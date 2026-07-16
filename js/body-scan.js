'use strict';
/* ============================================================
   BodyScan — AI body measurement from two photos.

   The user enters their height (the calibration ruler), then
   takes/uploads a FRONT photo and a SIDE photo. Everything runs
   on-device with real pixel computer vision — no upload, no
   model download, works offline:

     1. Silhouette: sample the photo's border colours as the
        background, score every pixel by colour distance, pick
        an adaptive threshold, clean the mask (majority filter)
        and keep the largest connected blob — the person.
     2. Calibration: top-of-head → feet in pixels vs the typed
        height gives cm-per-pixel.
     3. Landmarks: per-row silhouette spans locate the neck,
        shoulders, chest, waist, hips, crotch, thighs and arms
        at anthropometric height bands.
     4. Girths: chest/waist/hips/thigh are circumferences, so
        front width + side depth feed an ellipse-perimeter
        model (Ramanujan) with per-zone body-shape factors.

   Public API:
     BodyScan.start({ heightCm, unit, allowCamera, onDone, onCancel })
       → wizard modal. onDone receives
         { heightCm, values: {chest, waist, hips, shoulders,
           armLength, inseam, thigh}, conf: {key: 'measured'|'estimated'},
           warnings: [..] }   (all values in cm)
   ============================================================ */

const BodyScan = (() => {

  const WORK_MAX = 560;            // analysis canvas, longest edge (px)
  const THRESHOLDS = [900, 1300, 1800, 2500, 3300, 4200]; // sq colour dist candidates
  const FG_MIN = 0.07, FG_MAX = 0.55, FG_IDEAL = 0.22;    // sane person/frame ratios

  // Ellipse → real-body perimeter correction per zone (bodies are
  // rounder-cornered than a true ellipse) + fallback multiplier used
  // when the side photo gave no usable depth (circ ≈ width × mult).
  const ZONES = {
    chest: { k: 1.05, mult: 2.90 },
    waist: { k: 1.02, mult: 2.80 },
    hips:  { k: 1.05, mult: 2.90 },
    thigh: { k: 0.95, mult: 3.00 }
  };

  /* ==========================================================
     IMAGE → SILHOUETTE MASK
     ========================================================== */

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('bad-image'));
      img.src = dataUrl;
    });
  }

  function toWorkCanvas(img) {
    const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // Background colour samples: top row, both side columns, and the
  // bottom corners (bottom-centre is skipped — that's the feet/shadow).
  function backgroundSamples(data, w, h) {
    const s = [];
    const push = (x, y) => {
      const p = (y * w + x) * 4;
      s.push(data[p], data[p + 1], data[p + 2]);
    };
    const stepX = Math.max(2, Math.floor(w / 22));
    const stepY = Math.max(2, Math.floor(h / 14));
    for (let x = 0; x < w; x += stepX) { push(x, 0); push(x, 1); }
    for (let y = 0; y < h; y += stepY) { push(0, y); push(1, y); push(w - 1, y); push(w - 2, y); }
    for (let x = 0; x < Math.floor(w * 0.14); x += Math.max(2, Math.floor(stepX / 2))) {
      push(x, h - 1); push(w - 1 - x, h - 1);
    }
    return s;
  }

  // Per-pixel min squared RGB distance to any background sample.
  function distanceMap(data, w, h, samples) {
    const n = w * h;
    const d = new Uint16Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      let m = 65535;
      for (let s = 0; s < samples.length; s += 3) {
        const dr = r - samples[s], dg = g - samples[s + 1], db = b - samples[s + 2];
        const q = dr * dr + dg * dg + db * db;
        if (q < m) {
          m = q;
          if (m < 180) break; // clearly background — stop early
        }
      }
      d[i] = m;
    }
    return d;
  }

  // Pick the threshold whose foreground fraction is closest to a
  // plausible "person in frame" ratio.
  function pickThreshold(dist) {
    let best = THRESHOLDS[0], bestScore = Infinity;
    for (const t of THRESHOLDS) {
      let fg = 0;
      for (let i = 0; i < dist.length; i++) if (dist[i] > t) fg++;
      const f = fg / dist.length;
      const inBand = f >= FG_MIN && f <= FG_MAX;
      const score = Math.abs(f - FG_IDEAL) + (inBand ? 0 : 10);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  // 3×3 majority vote — knocks out speckle noise and hairline gaps.
  function smooth(mask, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const s = mask[i - w - 1] + mask[i - w] + mask[i - w + 1] +
                  mask[i - 1] + mask[i] + mask[i + 1] +
                  mask[i + w - 1] + mask[i + w] + mask[i + w + 1];
        out[i] = s >= 5 ? 1 : 0;
      }
    }
    return out;
  }

  // Keep only the largest 4-connected blob (the person), drop the rest.
  function largestComponent(mask, w, h) {
    const n = w * h;
    const labels = new Int32Array(n);
    const stack = new Int32Array(n);
    let cur = 0, best = 0, bestCount = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i] || labels[i]) continue;
      cur++;
      let count = 0, sp = 0;
      stack[sp++] = i; labels[i] = cur;
      while (sp) {
        const p = stack[--sp]; count++;
        const x = p % w;
        if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = cur; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = cur; stack[sp++] = p + 1; }
        if (p >= w && mask[p - w] && !labels[p - w]) { labels[p - w] = cur; stack[sp++] = p - w; }
        if (p < n - w && mask[p + w] && !labels[p + w]) { labels[p + w] = cur; stack[sp++] = p + w; }
      }
      if (count > bestCount) { bestCount = count; best = cur; }
    }
    for (let i = 0; i < n; i++) mask[i] = labels[i] === best ? 1 : 0;
    return bestCount;
  }

  function buildMask(img) {
    const canvas = toWorkCanvas(img);
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const dist = distanceMap(data, w, h, backgroundSamples(data, w, h));
    const t = pickThreshold(dist);
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = dist[i] > t ? 1 : 0;
    mask = smooth(mask, w, h);
    mask = smooth(mask, w, h);
    const size = largestComponent(mask, w, h);
    return { mask, w, h, canvas, fgFraction: size / (w * h) };
  }

  /* ==========================================================
     MASK → ROWS, LANDMARKS, MEASUREMENTS
     ========================================================== */

  // Per-row horizontal runs [x0, x1], ignoring slivers < 3px.
  function buildRows(mask, w, h) {
    const rows = new Array(h);
    for (let y = 0; y < h; y++) {
      const runs = [];
      let start = -1;
      const base = y * w;
      for (let x = 0; x <= w; x++) {
        const on = x < w && mask[base + x];
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          if (x - start >= 3) runs.push([start, x - 1]);
          start = -1;
        }
      }
      rows[y] = runs;
    }
    return rows;
  }

  const runW = r => r[1] - r[0] + 1;
  const runC = r => (r[0] + r[1]) / 2;
  const rowTotal = runs => runs.reduce((s, r) => s + runW(r), 0);

  function bodyBounds(rows, w, h) {
    const need = Math.max(4, w * 0.02);
    let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) {
      if (rowTotal(rows[y]) >= need) { if (top < 0) top = y; bottom = y; }
    }
    if (top < 0 || bottom - top < 20) return null;
    return { top, bottom, pxH: bottom - top };
  }

  // Horizontal body centre, from the widest run of the mid-body rows.
  function estimateCenter(rows, y0, y1) {
    let sum = 0, weight = 0;
    for (let y = y0; y <= y1; y++) {
      let widest = null;
      for (const r of rows[y]) if (!widest || runW(r) > runW(widest)) widest = r;
      if (widest) { sum += runC(widest) * runW(widest); weight += runW(widest); }
    }
    return weight ? sum / weight : null;
  }

  // The run on this row that belongs to the torso (nearest the centre line).
  function torsoRun(runs, centerX) {
    let best = null, bd = Infinity;
    for (const r of runs) {
      const d = Math.abs(runC(r) - centerX);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function extremeWidthRow(rows, y0, y1, centerX, wantMax) {
    let row = -1, px = wantMax ? 0 : Infinity, run = null;
    for (let y = y0; y <= y1; y++) {
      const t = torsoRun(rows[y], centerX);
      if (!t) continue;
      const tw = runW(t);
      if (wantMax ? tw > px : tw < px) { px = tw; row = y; run = t; }
    }
    return row < 0 ? null : { row, px, run };
  }

  // First row (3 in a row for stability) where the torso splits into two
  // leg runs with the gap straddling the centre line.
  function findCrotch(rows, y0, y1, centerX, hipPx) {
    let streak = 0;
    for (let y = y0; y <= y1; y++) {
      const near = rows[y].filter(r => Math.abs(runC(r) - centerX) < hipPx);
      let split = false;
      if (near.length >= 2) {
        near.sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < near.length - 1; i++) {
          if (near[i][1] < centerX && near[i + 1][0] > centerX &&
              runW(near[i]) >= hipPx * 0.18 && runW(near[i + 1]) >= hipPx * 0.18) {
            split = true;
            break;
          }
        }
      }
      streak = split ? streak + 1 : 0;
      if (streak >= 3) return y - 2;
    }
    return -1;
  }

  // Follow the arm (runs clearly outside the torso) from the shoulders
  // down and return its lowest point — the fingertips in an A-pose.
  function armTip(rows, y0, y1, centerX, sideSign) {
    let tip = null, rowsSeen = 0;
    for (let y = y0; y <= y1; y++) {
      const t = torsoRun(rows[y], centerX);
      if (!t) continue;
      for (const r of rows[y]) {
        if (r === t) continue;
        const outside = sideSign < 0 ? r[1] < t[0] - 2 : r[0] > t[1] + 2;
        if (!outside) continue;
        rowsSeen++;
        tip = { x: runC(r), y };  // keep updating — last one is lowest
        break;
      }
    }
    return rowsSeen >= 8 ? tip : null; // too few rows = noise, not an arm
  }

  // Ramanujan's ellipse perimeter from full width + full depth (cm).
  function ellipsePerimeter(widthCm, depthCm) {
    const a = widthCm / 2, b = depthCm / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }

  function clampField(key, val) {
    const f = (typeof FitEngine !== 'undefined') &&
              FitEngine.BODY_FIELDS.find(x => x.key === key);
    if (!f || val == null || isNaN(val)) return val;
    return Math.round(Math.min(f.max, Math.max(f.min, val)) * 10) / 10;
  }

  function analyzeFront(m, heightCm) {
    const { w, h } = m;
    const rows = buildRows(m.mask, w, h);
    const bounds = bodyBounds(rows, w, h);
    if (!bounds) return { ok: false, reason: 'outline' };
    const { top, bottom, pxH } = bounds;
    if (pxH < h * 0.45) return { ok: false, reason: 'small' };

    const cmPerPx = heightCm / pxH;
    const r = f => Math.min(h - 1, Math.max(0, Math.round(top + f * pxH)));
    const centerX = estimateCenter(rows, r(0.30), r(0.50));
    if (centerX == null) return { ok: false, reason: 'outline' };

    const warnings = [];

    // Landmarks at anthropometric height bands (fractions from head top).
    const neck = extremeWidthRow(rows, r(0.05), r(0.17), centerX, false);
    const shoulder = extremeWidthRow(rows, (neck ? neck.row + 1 : r(0.14)), r(0.25), centerX, true);
    let chest = extremeWidthRow(rows, r(0.27), r(0.36), centerX, true);
    const waist = extremeWidthRow(rows, r(0.36), r(0.47), centerX, false);
    const hips = extremeWidthRow(rows, r(0.47), r(0.58), centerX, true);
    if (!shoulder || !chest || !waist || !hips) return { ok: false, reason: 'outline' };

    // Arms hugging the torso melt into the chest span. The ribcage is
    // never close to the full deltoid width, so cap the ratio.
    if (chest.px > shoulder.px * 0.95) warnings.push('arms-close');
    if (chest.px > shoulder.px * 0.88) {
      chest = { row: chest.row, px: Math.round(shoulder.px * 0.82), run: chest.run };
    }

    // Crotch → inseam; legs-together (or a dress) hides it.
    let crotchRow = findCrotch(rows, hips.row + 2, r(0.68), centerX, hips.px);
    let inseamMeasured = true;
    if (crotchRow < 0) { crotchRow = r(0.53); inseamMeasured = false; warnings.push('no-crotch'); }

    // Thigh width just below the crotch — the wider leg.
    const thighY = Math.min(h - 1, crotchRow + Math.round(0.04 * pxH));
    let thighPx = 0;
    for (const run of rows[thighY]) {
      if (Math.abs(runC(run) - centerX) < hips.px && runW(run) > thighPx) thighPx = runW(run);
    }

    // Arm length: shoulder point → fingertips, minus the hand (~10.8% of height).
    let armCm = null;
    const tipL = armTip(rows, shoulder.row + 3, r(0.60), centerX, -1);
    const tipR = armTip(rows, shoulder.row + 3, r(0.60), centerX, +1);
    const shoulderPts = { left: shoulder.run[0], right: shoulder.run[1] };
    const arms = [];
    if (tipL) arms.push(Math.hypot(tipL.x - shoulderPts.left, tipL.y - shoulder.row));
    if (tipR) arms.push(Math.hypot(tipR.x - shoulderPts.right, tipR.y - shoulder.row));
    if (arms.length) {
      const toTip = (arms.reduce((a, b) => a + b, 0) / arms.length) * cmPerPx;
      armCm = toTip - 0.108 * heightCm;
      // an implausible track (arm folded, bag in hand…) falls back to anthropometry
      if (armCm < heightCm * 0.24 || armCm > heightCm * 0.40) armCm = null;
    }

    return {
      ok: true, rows, top, bottom, pxH, cmPerPx, centerX, warnings,
      neck, shoulder, chest, waist, hips, crotchRow, inseamMeasured, thighPx, armCm
    };
  }

  // Side photo: same silhouette, but each row's widest run is the body's
  // front-to-back DEPTH at that height.
  function analyzeSide(m, heightCm) {
    const { w, h } = m;
    const rows = buildRows(m.mask, w, h);
    const bounds = bodyBounds(rows, w, h);
    if (!bounds) return { ok: false };
    const { top, pxH } = bounds;
    if (pxH < h * 0.45) return { ok: false };
    const cmPerPx = heightCm / pxH;
    const depthAt = f => {
      const y = Math.min(h - 1, Math.max(0, Math.round(top + f * pxH)));
      let widest = 0;
      for (const run of rows[y]) if (runW(run) > widest) widest = runW(run);
      return widest ? widest * cmPerPx : null;
    };
    return { ok: true, depthAt };
  }

  // Fuse front + side into the final measurement set.
  function compose(front, side, heightCm) {
    const f = row => (row - front.top) / front.pxH; // row → height fraction
    const values = {}, conf = {};
    const warnings = front.warnings.slice();
    if (!side.ok) warnings.push('side-failed');

    const girth = (key, widthPx, row) => {
      const wCm = widthPx * front.cmPerPx;
      const dCm = side.ok ? side.depthAt(f(row)) : null;
      const z = ZONES[key];
      if (dCm && dCm > 8 && dCm < wCm * 2.5) {
        conf[key] = 'measured';
        return ellipsePerimeter(wCm, dCm) * z.k;
      }
      conf[key] = 'estimated';
      return wCm * z.mult;
    };

    values.chest = clampField('chest', girth('chest', front.chest.px, front.chest.row));
    values.waist = clampField('waist', girth('waist', front.waist.px, front.waist.row));
    values.hips  = clampField('hips',  girth('hips',  front.hips.px,  front.hips.row));

    values.shoulders = clampField('shoulders', front.shoulder.px * front.cmPerPx * 0.97);
    conf.shoulders = 'measured';

    // inseam: crotch → floor, minus ankle height (~7 cm, barefoot)
    values.inseam = clampField('inseam', (front.bottom - front.crotchRow) * front.cmPerPx - 7);
    conf.inseam = front.inseamMeasured ? 'measured' : 'estimated';

    if (front.thighPx > 0) {
      values.thigh = clampField('thigh', girth('thigh', front.thighPx, Math.min(front.bottom, front.crotchRow + Math.round(0.04 * front.pxH))));
      conf.thigh = 'estimated'; // noisiest zone — always double-check
    }

    if (front.armCm != null) {
      values.armLength = clampField('armLength', front.armCm);
      conf.armLength = 'measured';
    } else {
      values.armLength = clampField('armLength', heightCm * 0.315); // anthropometric ratio
      conf.armLength = 'estimated';
      warnings.push('arm-estimated');
    }

    return { heightCm, values, conf, warnings };
  }

  /* ==========================================================
     RESULT OVERLAY — the photo with the AI's landmarks drawn on
     ========================================================== */

  function drawOverlay(canvas, workCanvas, m, front, values) {
    canvas.width = m.w;
    canvas.height = m.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(workCanvas, 0, 0);

    // silhouette tint
    const tint = ctx.getImageData(0, 0, m.w, m.h);
    for (let i = 0; i < m.mask.length; i++) {
      if (!m.mask[i]) continue;
      const p = i * 4;
      tint.data[p] = Math.min(255, tint.data[p] * 0.75 + 70);
      tint.data[p + 1] = tint.data[p + 1] * 0.82;
      tint.data[p + 2] = tint.data[p + 2] * 0.72;
    }
    ctx.putImageData(tint, 0, 0);

    const line = (y, run, label) => {
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(run[0] - 4, y); ctx.lineTo(run[1] + 4, y); ctx.stroke();
      ctx.strokeStyle = '#b23b2e';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(run[0] - 4, y); ctx.lineTo(run[1] + 4, y); ctx.stroke();
      ctx.font = '600 11px Outfit, sans-serif';
      ctx.textBaseline = 'middle';
      const tx = run[1] + 8, tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(Math.min(tx, m.w - tw - 4) - 2, y - 8, tw + 5, 16);
      ctx.fillStyle = '#1c1814';
      ctx.fillText(label, Math.min(tx, m.w - tw - 4), y);
    };

    line(front.shoulder.row, front.shoulder.run, 'Shoulders');
    line(front.chest.row, front.chest.run, 'Chest');
    line(front.waist.row, front.waist.run, 'Waist');
    line(front.hips.row, front.hips.run, 'Hips');
    if (values.inseam != null) {
      const run = [Math.round(front.centerX - 12), Math.round(front.centerX + 12)];
      line(front.crotchRow, run, 'Inseam');
    }
  }

  /* ==========================================================
     WIZARD UI
     ========================================================== */

  const FIELD_LABELS = {
    chest: 'Chest / Bust', waist: 'Waist', hips: 'Hips', shoulders: 'Shoulder width',
    armLength: 'Arm length', inseam: 'Inseam', thigh: 'Thigh'
  };

  const FAIL_MSG = {
    outline: 'I couldn\'t find a clear body outline. Two things to check: stand in front of a plain wall with nothing else in frame, and wear clothes that are a DIFFERENT colour from the wall — a white top on a white wall is invisible to the scan.',
    small: 'You look too small in the frame. Move the camera closer — your whole body (head to feet) should fill most of the photo.',
    'bad-image': 'That photo couldn\'t be read. Please try another one.'
  };

  const WARN_MSG = {
    'arms-close': 'Your arms looked very close to your body, so the chest reading may run wide — lift them ~30° next time.',
    'no-crotch': 'I couldn\'t see daylight between your legs, so the inseam is an estimate.',
    'side-failed': 'The side photo outline wasn\'t clear, so circumferences were estimated from the front photo only.',
    'arm-estimated': 'Arm length was estimated from your height.'
  };

  let S = null; // wizard state

  function start(opts) {
    if (S) return; // one scan at a time
    S = {
      unit: opts.unit === 'in' ? 'in' : 'cm',
      heightCm: opts.heightCm || null,
      allowCamera: opts.allowCamera !== false,
      onDone: opts.onDone || (() => {}),
      onCancel: opts.onCancel || (() => {}),
      front: null, side: null, result: null, overlays: null
    };

    const root = document.getElementById('modal-root');
    S.overlay = document.createElement('div');
    S.overlay.className = 'modal-overlay';
    S.overlay.innerHTML = '<div class="modal scan-modal" role="dialog" aria-label="AI body scan"></div>';
    root.appendChild(S.overlay);
    S.box = S.overlay.querySelector('.scan-modal');
    renderHeight();
  }

  function close(cancelled) {
    if (!S) return;
    S.overlay.remove();
    const cb = cancelled ? S.onCancel : null;
    S = null;
    if (cb) cb();
  }

  const dispH = cm => S.unit === 'in'
    ? (typeof FitEngine !== 'undefined' ? FitEngine.cmToIn(cm) : Math.round(cm / 2.54 * 10) / 10)
    : Math.round(cm * 10) / 10;
  const toCmH = v => S.unit === 'in'
    ? (typeof FitEngine !== 'undefined' ? FitEngine.inToCm(v) : Math.round(v * 2.54 * 10) / 10)
    : v;

  function renderHeight() {
    S.box.innerHTML = `
      <h3>AI body scan</h3>
      <p>Two photos and your height — the AI does the tape measure's job. Photos are analysed on your device and never leave it.</p>
      <div class="field">
        <label for="scan-height">Your height <span class="req">*</span></label>
        <span class="input-suffix">
          <input class="input" id="scan-height" type="number" step="0.1" inputmode="decimal"
                 value="${S.heightCm ? dispH(S.heightCm) : ''}">
          <span class="suffix">${S.unit}</span>
        </span>
        <span class="hint">The scan uses your height as its ruler — the more exact, the better every other number.</span>
      </div>
      <div class="scan-tips">
        <div class="scan-tip"><span class="scan-tip-ico">🎨</span><div><b>Contrast with the wall.</b> Wear a colour that stands out — a white top on a white wall can't be read.</div></div>
        <div class="scan-tip"><span class="scan-tip-ico">🖼️</span><div><b>Whole body in frame.</b> Head to bare feet, nothing cropped off. Any photo shape works.</div></div>
        <div class="scan-tip"><span class="scan-tip-ico">🧍</span><div><b>Stand tall.</b> Front: arms ~30° out from your sides. Side: turn 90°, arms straight down.</div></div>
        <div class="scan-tip"><span class="scan-tip-ico">📷</span><div><b>Plain background.</b> Prop the phone ~3 m away and use the self-timer.</div></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-lg" data-scan-act="next">Start scan</button>
        <button class="btn btn-ghost" data-scan-act="cancel">Cancel</button>
      </div>`;
    wire({
      next: () => {
        const cm = toCmH(parseFloat(document.getElementById('scan-height').value));
        if (!cm || isNaN(cm) || cm < 45 || cm > 230) {
          alertLine('Please enter a height between ' + (S.unit === 'in' ? '18 and 90 in' : '45 and 230 cm') + '.');
          return;
        }
        S.heightCm = cm;
        renderPhoto('front');
      },
      cancel: () => close(true)
    });
  }

  function renderPhoto(which) {
    const isFront = which === 'front';
    const shot = S[which];
    S.box.innerHTML = `
      <h3>${isFront ? 'Step 1 · Front photo' : 'Step 2 · Side photo'}</h3>
      <p>${isFront
        ? 'Face the camera, stand tall, arms lifted ~30° away from your body so I can see your waistline.'
        : 'Turn 90° to the side, stand tall, arms straight with hands slightly in front of your thighs.'}</p>
      ${shot ? `<img class="scan-preview" src="${shot}" alt="">` : `
      <div class="scan-drop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="m9 7 1.5-3h3L15 7"/><circle cx="12" cy="13" r="3.5"/></svg>
        <span>${isFront ? 'Full-body photo, facing the camera' : 'Full-body photo, from the side'}</span>
      </div>`}
      ${S.allowCamera ? '' : '<p class="hint mb-16">Live camera needs a free account — upload a photo instead.</p>'}
      <div class="btn-row">
        ${shot
          ? `<button class="btn btn-primary btn-lg" data-scan-act="next">${isFront ? 'Next: side photo' : 'Analyse my body'}</button>
             <button class="btn btn-secondary" data-scan-act="pick">Retake</button>`
          : `<button class="btn btn-primary btn-lg" data-scan-act="pick">${S.allowCamera ? 'Add photo' : 'Upload photo'}</button>`}
        <button class="btn btn-ghost" data-scan-act="cancel" style="margin-left:auto">Cancel</button>
      </div>`;
    wire({
      pick: () => {
        const handler = {
          onImage: dataUrl => { S[which] = dataUrl; renderPhoto(which); },
          onError: msg => alertLine(msg)
        };
        if (S.allowCamera) Camera.pickImage(handler); else Camera.uploadOnly(handler);
      },
      next: () => { if (isFront) renderPhoto('side'); else runAnalysis(); },
      cancel: () => close(true)
    });
  }

  function renderProcessing() {
    S.box.innerHTML = `
      <h3>Measuring you…</h3>
      <div class="scan-progress">
        <div class="scan-spinner"></div>
        <div class="scan-progress-msg" id="scan-msg">Reading photos…</div>
      </div>`;
  }

  const tick = ms => new Promise(res => setTimeout(res, ms));
  const progress = msg => {
    const el = document.getElementById('scan-msg');
    if (el) el.textContent = msg;
  };

  async function runAnalysis() {
    renderProcessing();
    try {
      await tick(60); // let the modal paint before the heavy loops
      const imgF = await loadImage(S.front);
      const imgS = await loadImage(S.side);

      progress('Finding your outline…');
      await tick(350);
      const maskF = buildMask(imgF);
      const maskS = buildMask(imgS);

      progress('Locating body landmarks…');
      await tick(350);
      const front = analyzeFront(maskF, S.heightCm);
      if (!front.ok) { renderFail(FAIL_MSG[front.reason] || FAIL_MSG.outline, 'front'); return; }
      const side = analyzeSide(maskS, S.heightCm);

      progress('Calibrating with your height…');
      await tick(300);
      const result = compose(front, side, S.heightCm);

      progress('Estimating circumferences…');
      await tick(300);
      S.result = result;
      S.overlays = { maskF, front };
      renderResults();
    } catch (e) {
      renderFail(FAIL_MSG['bad-image'], 'front');
    }
  }

  function renderFail(msg, backTo) {
    S.box.innerHTML = `
      <h3>Hmm, that didn't work</h3>
      <p>${msg}</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-scan-act="retry">Retake photos</button>
        <button class="btn btn-ghost" data-scan-act="cancel">Cancel</button>
      </div>`;
    wire({
      retry: () => { S.front = null; S.side = null; renderPhoto(backTo); },
      cancel: () => close(true)
    });
  }

  function renderResults() {
    const { values, conf, warnings } = S.result;
    const unitLabel = S.unit;
    const rows = Object.keys(FIELD_LABELS)
      .filter(k => values[k] != null)
      .map(k => `
        <div class="scan-row">
          <span class="scan-row-label">${FIELD_LABELS[k]}</span>
          <span class="scan-chip ${conf[k] === 'measured' ? 'ok' : 'est'}">${conf[k] === 'measured' ? 'measured' : 'estimated'}</span>
          <span class="scan-row-val">${dispH(values[k])} ${unitLabel}</span>
        </div>`).join('');

    const notes = warnings.map(wn => WARN_MSG[wn]).filter(Boolean)
      .map(t => `<div class="scan-note">💡 ${t}</div>`).join('');

    S.box.innerHTML = `
      <h3>Your measurements</h3>
      <p>Here's what the AI found. Numbers land in the form next — fine-tune anything that looks off.</p>
      <canvas class="scan-canvas" id="scan-canvas"></canvas>
      <div class="scan-rows">${rows}</div>
      ${notes}
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-primary btn-lg" data-scan-act="use">Use these measurements</button>
        <button class="btn btn-secondary" data-scan-act="retry">Rescan</button>
      </div>`;

    try {
      drawOverlay(document.getElementById('scan-canvas'), S.overlays.maskF.canvas,
                  S.overlays.maskF, S.overlays.front, values);
    } catch (e) { document.getElementById('scan-canvas').style.display = 'none'; }

    wire({
      use: () => {
        const res = S.result;
        const cb = S.onDone;
        S.overlay.remove();
        S = null;
        cb(res);
      },
      retry: () => { S.front = null; S.side = null; renderPhoto('front'); }
    });
  }

  function alertLine(msg) {
    let el = S.box.querySelector('.scan-alert');
    if (!el) {
      el = document.createElement('div');
      el.className = 'scan-alert';
      S.box.querySelector('.btn-row').before(el);
    }
    el.textContent = msg;
  }

  function wire(actions) {
    S.box.onclick = e => {
      const btn = e.target.closest('[data-scan-act]');
      if (!btn) return;
      const fn = actions[btn.getAttribute('data-scan-act')];
      if (fn) fn();
    };
  }

  return {
    start,
    // pure CV internals, exposed for testing
    _internals: { buildRows, bodyBounds, estimateCenter, findCrotch, analyzeFront, analyzeSide, compose, ellipsePerimeter, smooth, largestComponent }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BodyScan;
