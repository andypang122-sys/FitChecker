'use strict';
/* ============================================================
   StyleAI — on-device outfit rating.

   Reads the actual pixels of the outfit photo (no upload, no
   external AI service) and scores the look out of 100 against
   real styling principles:

     • palette discipline — how many colours are in play
     • harmony — analogous vs complementary hue relationships
     • neutral grounding — neutrals giving the eye a rest
     • colour echo — the same tone repeating top-to-bottom
       (a matching hat & shoes shows up here)
     • contrast — light/dark structure
     • saturation restraint

   Every point in the score maps to a written reason.
   ============================================================ */

const StyleAI = (() => {

  function rate(dataUrl, cb) {
    const img = new Image();
    img.onload = () => {
      try { cb(analyze(img)); } catch (e) { cb(null); }
    };
    img.onerror = () => cb(null);
    img.src = dataUrl;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > .5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  const HUE_NAMES = ['red', 'orange', 'gold', 'green', 'green', 'teal',
                     'teal', 'blue', 'blue', 'purple', 'pink', 'pink'];

  function analyze(img) {
    const W = 64, H = 64, BINS = 12;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;

    let n = 0, neutral = 0, satSum = 0;
    const bins = new Array(BINS).fill(0);
    const topBins = new Array(BINS).fill(0);
    const botBins = new Array(BINS).fill(0);
    const lums = [];

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const hsl = rgbToHsl(px[i], px[i + 1], px[i + 2]);
        lums.push(hsl[2]);
        n++;
        // low saturation or extreme lightness reads as a neutral
        if (hsl[1] < .18 || hsl[2] < .09 || hsl[2] > .93) { neutral++; continue; }
        satSum += hsl[1];
        const bin = Math.floor(hsl[0] / (360 / BINS)) % BINS;
        bins[bin]++;
        if (y < H / 3) topBins[bin]++;
        else if (y >= H * 2 / 3) botBins[bin]++;
      }
    }

    const chromatic = n - neutral;
    const neutralRatio = neutral / n;
    const meanLum = lums.reduce((a, b) => a + b, 0) / lums.length;
    const lumStd = Math.sqrt(lums.reduce((a, b) => a + (b - meanLum) * (b - meanLum), 0) / lums.length);

    let score = 55;
    const notes = [];

    /* ---- an (almost) all-neutral outfit is its own discipline ---- */
    if (chromatic / n < .05) {
      score = 78;
      notes.push('An all-neutral palette — clean, deliberate and hard to get wrong.');
      if (lumStd >= .12 && lumStd <= .32) { score += 8; notes.push('Good light-dark structure keeps the neutrals from going flat.'); }
      else if (lumStd < .07) { score -= 5; notes.push('The tones sit very close together — one lighter or darker piece would add depth.'); }
      return { score: clamp(score), notes: notes.slice(0, 4) };
    }

    /* ---- palette discipline: how many hues carry real weight ---- */
    const clusters = [];
    for (let b = 0; b < BINS; b++) if (bins[b] / chromatic >= .08) clusters.push(b);
    if (clusters.length <= 2) { score += 13; notes.push('A disciplined palette — ' + (clusters.length === 1 ? 'one colour family' : 'two colour families') + ' doing the work, nothing fighting.'); }
    else if (clusters.length === 3) { score += 5; notes.push('Three colour families in play — still controlled.'); }
    else { score -= 9; notes.push('A lot of competing colours — dropping one would calm the whole look.'); }

    /* ---- harmony between the two strongest hues ---- */
    if (clusters.length >= 2) {
      const sorted = clusters.slice().sort((a, b) => bins[b] - bins[a]);
      const dist = circDist(sorted[0], sorted[1], BINS);
      if (dist <= 2) { score += 8; notes.push(cap(HUE_NAMES[sorted[0]]) + ' and ' + HUE_NAMES[sorted[1]] + ' sit next to each other on the colour wheel — easy, natural harmony.'); }
      else if (dist >= 5) { score += 9; notes.push(cap(HUE_NAMES[sorted[0]]) + ' against ' + HUE_NAMES[sorted[1]] + ' is a proper complementary pairing — bold and intentional.'); }
      else { score += 2; }
    }

    /* ---- colour echo: same tone at the top and the bottom ---- */
    const topC = topBins.reduce((a, b) => a + b, 0);
    const botC = botBins.reduce((a, b) => a + b, 0);
    if (topC > 20 && botC > 20) {
      for (const b of clusters) {
        if (topBins[b] / topC >= .18 && botBins[b] / botC >= .18) {
          score += 8;
          notes.push('The ' + HUE_NAMES[b] + ' echoes from top to bottom — matching pieces tie the whole outfit together.');
          break;
        }
      }
    }

    /* ---- neutrals grounding the look ---- */
    if (neutralRatio >= .3 && neutralRatio <= .85) { score += 7; notes.push('Well grounded — the neutrals give the colours room to speak.'); }
    else if (neutralRatio < .15) { score -= 5; notes.push('Almost no neutrals — the eye gets nowhere to rest.'); }

    /* ---- light/dark structure ---- */
    if (lumStd >= .12 && lumStd <= .32) { score += 6; if (notes.length < 3) notes.push('Good contrast between light and dark gives the outfit structure.'); }
    else if (lumStd < .07) { score -= 4; notes.push('Very flat lighting between pieces — a darker or lighter layer would add depth.'); }

    /* ---- saturation restraint ---- */
    const meanSat = chromatic ? satSum / chromatic : 0;
    if (meanSat > .75) { score -= 4; notes.push('The colours run very loud — one muted piece would balance them.'); }
    else if (meanSat >= .25) { score += 3; }

    if (!notes.length) notes.push('A balanced look — nothing shouts, nothing clashes.');
    return { score: clamp(score), notes: notes.slice(0, 4) };
  }

  function circDist(a, b, m) {
    const d = Math.abs(a - b);
    return Math.min(d, m - d);
  }
  function clamp(s) { return Math.max(42, Math.min(98, Math.round(s))); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  return { rate };
})();
