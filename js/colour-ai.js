'use strict';
/* FitChecker — ColourAI
   On-device personal-colour analysis. Reads a selfie's skin pixels with a
   canvas (no cloud, no API key), estimates the wearer's undertone (warm / cool /
   neutral) and depth (light / medium / deep) via CIELAB + the ITA° skin scale,
   then maps that to a flattering seasonal palette with plain-language reasons.

   Photo light is never perfect, so the result is an honest estimate — the UI
   offers a 3-question refine step to confirm the undertone by hand. */

(function () {
  // ---- colour maths -------------------------------------------------------

  function srgbToLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  // sRGB (0-255) -> CIELAB (D65)
  function rgbToLab(r, g, b) {
    const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
    let X = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) * 100;
    let Y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) * 100;
    let Z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) * 100;
    const xr = X / 95.047, yr = Y / 100, zr = Z / 108.883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const fx = f(xr), fy = f(yr), fz = f(zr);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function hex(r, g, b) {
    const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }

  // ---- skin detection -----------------------------------------------------

  // Classic RGB skin-pixel rule, tuned to skip pure whites/darks.
  function isSkin(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return r > 95 && g > 40 && b > 20 &&
           (mx - mn) > 15 &&
           Math.abs(r - g) > 15 && r > g && r > b &&
           !(r > 235 && g > 235 && b > 235);
  }

  /* Load the photo, sample skin pixels, return the average skin colour plus a
     confidence based on how much skin was found. Falls back to a centre crop. */
  function readSkin(dataUrl, cb) {
    const img = new Image();
    img.onload = function () {
      const S = 120;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, S, S);
      let data;
      try { data = ctx.getImageData(0, 0, S, S).data; }
      catch (e) { cb(null); return; }

      let sr = 0, sg = 0, sb = 0, n = 0;
      let lumSum = 0, lumSq = 0, lumN = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lumSum += lum; lumSq += lum * lum; lumN++;
        if (isSkin(r, g, b)) { sr += r; sg += g; sb += b; n++; }
      }

      const total = S * S;
      let confidence = Math.min(1, n / (total * 0.12)); // ~12% skin = full confidence
      if (n < total * 0.02) {
        // Too little skin found — average the centre where a face usually sits.
        sr = sg = sb = n = 0;
        const lo = Math.round(S * 0.32), hi = Math.round(S * 0.68);
        for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
          const i = (y * S + x) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
        }
        confidence = 0.35;
      }
      if (!n) { cb(null); return; }

      const mean = lumSum / lumN;
      const contrast = Math.sqrt(Math.max(0, lumSq / lumN - mean * mean)); // photo luminance spread
      cb({ r: sr / n, g: sg / n, b: sb / n, confidence: confidence, contrast: contrast });
    };
    img.onerror = function () { cb(null); };
    img.src = dataUrl;
  }

  // ---- classification -----------------------------------------------------

  function classify(skin) {
    const lab = rgbToLab(skin.r, skin.g, skin.b);
    // ITA° — the standard skin-depth angle. Collapsed to the two tiers the
    // palette model distinguishes (light vs deep); the boundary sits around
    // tan skin, so genuinely deep colouring gets the richer seasons.
    const ita = Math.atan2(lab.L - 50, lab.b) * 180 / Math.PI;
    const depth = ita > 20 ? 'light' : 'deep';

    // Undertone from the yellow(b*) vs red(a*) balance of the skin.
    const ratio = lab.a > 1 ? lab.b / lab.a : 2;
    let undertone = 'neutral';
    if (ratio >= 1.55) undertone = 'warm';
    else if (ratio <= 1.12) undertone = 'cool';

    return { undertone: undertone, depth: depth, ratio: ratio, ita: ita, lab: lab };
  }

  // ---- palettes -----------------------------------------------------------

  const S = (hex, name) => ({ hex: hex, name: name });

  const PALETTES = {
    spring: {
      season: 'Warm Spring', tone: 'Warm · Light',
      wear: [S('#FF6F61', 'Coral'), S('#FFB07C', 'Peach'), S('#F4C430', 'Golden yellow'),
             S('#2EC4B6', 'Warm turquoise'), S('#7BB661', 'Fresh green'), S('#FF8C69', 'Salmon'),
             S('#F28E1C', 'Warm orange'), S('#4FB0C6', 'Aqua')],
      neutrals: [S('#F5EAD1', 'Ivory'), S('#C19A6B', 'Camel'), S('#D9BE9E', 'Warm beige'), S('#34495E', 'Soft navy')],
      avoid: [S('#0B0B0B', 'Black'), S('#36454F', 'Charcoal'), S('#CFE8F0', 'Icy pastel'), S('#9AA7B0', 'Cool grey')],
      why: 'Your warm, light colouring lights up next to clear, sun-warmed colours. Keep them bright and warm — heavy black and icy tones overpower you.'
    },
    autumn: {
      season: 'Warm Autumn', tone: 'Warm · Deep',
      wear: [S('#B7410E', 'Rust'), S('#C66B3D', 'Terracotta'), S('#D4A017', 'Mustard'),
             S('#708238', 'Olive'), S('#244F3B', 'Forest green'), S('#17706E', 'Teal'),
             S('#E67E22', 'Pumpkin'), S('#8C6B3F', 'Bronze')],
      neutrals: [S('#F3E9D2', 'Cream'), S('#4B3621', 'Chocolate'), S('#C19A6B', 'Camel'), S('#556B2F', 'Moss')],
      avoid: [S('#C154C1', 'Fuchsia'), S('#CFE8F0', 'Icy blue'), S('#FFFFFF', 'Pure white'), S('#F7A8C4', 'Cool pink')],
      why: 'Your warm, deep colouring is at home in earthy, muted, sun-baked shades. Rich and golden flatters; icy or neon colours fight you.'
    },
    summer: {
      season: 'Cool Summer', tone: 'Cool · Light',
      wear: [S('#E8A0BF', 'Soft rose'), S('#7A9CC6', 'Dusty blue'), S('#B497BD', 'Lavender'),
             S('#9CAF88', 'Sage'), S('#B784A7', 'Mauve'), S('#A6C7E3', 'Powder blue'),
             S('#6FB1A8', 'Soft teal'), S('#C08497', 'Rosewood')],
      neutrals: [S('#F1F1EC', 'Soft white'), S('#B0B7BF', 'Cool grey'), S('#33415C', 'Soft navy'), S('#B3A394', 'Taupe')],
      avoid: [S('#E67E22', 'Orange'), S('#F4D03F', 'Bright yellow'), S('#E74C3C', 'Tomato red'), S('#C19A6B', 'Camel')],
      why: 'Your cool, light colouring glows in soft, muted, dusty tones. Gentle and cool flatters; hot or earthy colours drain you.'
    },
    winter: {
      season: 'Cool Winter', tone: 'Cool · Deep',
      wear: [S('#C0122F', 'True red'), S('#1C39BB', 'Royal blue'), S('#0F8B5F', 'Emerald'),
             S('#C154C1', 'Fuchsia'), S('#0047AB', 'Cobalt'), S('#F4C2D7', 'Icy pink'),
             S('#6A0DAD', 'Purple'), S('#008B8B', 'Deep teal')],
      neutrals: [S('#FFFFFF', 'Pure white'), S('#0B0B0B', 'Black'), S('#2C3539', 'Charcoal'), S('#1B2A4A', 'Cool navy')],
      avoid: [S('#D4A017', 'Mustard'), S('#B7410E', 'Rust'), S('#708238', 'Olive'), S('#D9BE9E', 'Warm beige')],
      why: 'Your cool, deep colouring can carry clear, bold, high-contrast colours few others can. Crisp and cool flatters; muted earth tones make you look tired.'
    },
    softNeutral: {
      season: 'Soft Neutral', tone: 'Neutral · Light',
      wear: [S('#3C9D9B', 'Teal'), S('#F08080', 'Soft coral'), S('#6E8CA0', 'Denim blue'),
             S('#4CA98A', 'Jade'), S('#D98BA0', 'Rose'), S('#D9B36A', 'Soft gold'),
             S('#79C7C5', 'Aqua'), S('#8E9DCC', 'Periwinkle')],
      neutrals: [S('#F1F1EC', 'Soft white'), S('#C9C0B2', 'Greige'), S('#34495E', 'Denim'), S('#B3A394', 'Taupe')],
      avoid: [S('#39FF14', 'Neon green'), S('#FF1493', 'Hot pink'), S('#3B2F1E', 'Muddy brown'), S('#00FFFF', 'Electric cyan')],
      why: 'Your undertone is balanced, so you can wear both warm and cool — as long as colours stay medium and a touch soft. Only the extremes (icy or muddy, neon) work against you.'
    },
    deepNeutral: {
      season: 'Deep Neutral', tone: 'Neutral · Deep',
      wear: [S('#1F7A7A', 'Teal'), S('#7B1E3B', 'Burgundy'), S('#1E5945', 'Pine'),
             S('#34495E', 'Denim'), S('#6C4675', 'Plum'), S('#9C3B2E', 'Brick'),
             S('#16775F', 'Deep jade'), S('#4A6274', 'Slate blue')],
      neutrals: [S('#17181A', 'Soft black'), S('#2C3539', 'Charcoal'), S('#8A8178', 'Stone'), S('#E8DFCB', 'Ecru')],
      avoid: [S('#F7E7CE', 'Washed pastel'), S('#39FF14', 'Neon'), S('#FADADD', 'Pale pink'), S('#F5F5DC', 'Beige')],
      why: 'Your undertone is balanced and your colouring is deep, so rich mid-to-deep colours from both families flatter you. Pale, washed-out pastels are the main thing to skip.'
    }
  };

  function seasonKey(undertone, depth) {
    if (undertone === 'warm') return depth === 'deep' ? 'autumn' : 'spring';
    if (undertone === 'cool') return depth === 'deep' ? 'winter' : 'summer';
    return depth === 'deep' ? 'deepNeutral' : 'softNeutral';
  }

  function build(undertone, depth, extra) {
    const key = seasonKey(undertone, depth);
    const p = PALETTES[key];
    return Object.assign({
      key: key,
      undertone: undertone,
      depth: depth
    }, p, extra || {});
  }

  // ---- public API ---------------------------------------------------------

  const ColourAI = {
    /* Analyse a selfie. cb receives a result object or null on failure. */
    analyze: function (dataUrl, cb) {
      readSkin(dataUrl, function (skin) {
        if (!skin) { cb(null); return; }
        const c = classify(skin);
        const res = build(c.undertone, c.depth, {
          skinHex: hex(skin.r, skin.g, skin.b),
          confidence: skin.confidence,
          ita: Math.round(c.ita)
        });
        cb(res);
      });
    },

    /* Rebuild a palette after the user hand-picks an undertone/depth in the
       refine step (photo light is unreliable, so this always wins). */
    fromChoice: function (undertone, depth, skinHex) {
      return build(undertone, depth, { skinHex: skinHex || null, confidence: 1, refined: true });
    },

    seasonKey: seasonKey,
    palettes: PALETTES
  };

  window.ColourAI = ColourAI;
})();
