'use strict';
/* ============================================================
   FitEngine — size charts + fit math.
   Compares body measurements against garment size charts,
   scores every size, explains fit per body zone
   (good / tight / loose / short / long) and recommends
   the best size with a confidence score.
   All internal math is in centimetres.
   ============================================================ */

const FitEngine = (() => {

  /* ----------------------------------------------------------
     Size charts (body measurements each size is designed for,
     in cm). Based on common international sizing standards.
     ---------------------------------------------------------- */

  const SIZE_CHARTS = {
    tshirt: {
      label: 'T-Shirt / Top',
      zones: ['chest', 'waist', 'shoulders', 'torsoLength'],
      sizes: {
        XS:  { chest: 84,  waist: 70,  shoulders: 41, torsoLength: 64 },
        S:   { chest: 90,  waist: 76,  shoulders: 43, torsoLength: 66 },
        M:   { chest: 96,  waist: 82,  shoulders: 45, torsoLength: 69 },
        L:   { chest: 104, waist: 90,  shoulders: 47, torsoLength: 72 },
        XL:  { chest: 112, waist: 98,  shoulders: 49, torsoLength: 74 },
        XXL: { chest: 120, waist: 108, shoulders: 52, torsoLength: 76 }
      }
    },
    shirt: {
      label: 'Shirt / Blouse',
      zones: ['chest', 'waist', 'shoulders', 'sleeveLength', 'torsoLength'],
      sizes: {
        XS:  { chest: 86,  waist: 72,  shoulders: 42, sleeveLength: 60, torsoLength: 68 },
        S:   { chest: 92,  waist: 78,  shoulders: 44, sleeveLength: 62, torsoLength: 70 },
        M:   { chest: 98,  waist: 84,  shoulders: 46, sleeveLength: 64, torsoLength: 73 },
        L:   { chest: 106, waist: 92,  shoulders: 48, sleeveLength: 65, torsoLength: 76 },
        XL:  { chest: 114, waist: 100, shoulders: 50, sleeveLength: 66, torsoLength: 78 },
        XXL: { chest: 122, waist: 110, shoulders: 53, sleeveLength: 67, torsoLength: 80 }
      }
    },
    hoodie: {
      label: 'Hoodie / Sweater',
      zones: ['chest', 'waist', 'shoulders', 'sleeveLength', 'torsoLength'],
      sizes: {
        XS:  { chest: 90,  waist: 78,  shoulders: 43, sleeveLength: 61, torsoLength: 65 },
        S:   { chest: 96,  waist: 84,  shoulders: 45, sleeveLength: 63, torsoLength: 67 },
        M:   { chest: 102, waist: 90,  shoulders: 47, sleeveLength: 65, torsoLength: 70 },
        L:   { chest: 110, waist: 98,  shoulders: 49, sleeveLength: 66, torsoLength: 73 },
        XL:  { chest: 118, waist: 106, shoulders: 51, sleeveLength: 67, torsoLength: 75 },
        XXL: { chest: 126, waist: 116, shoulders: 54, sleeveLength: 68, torsoLength: 77 }
      }
    },
    jacket: {
      label: 'Jacket / Coat',
      zones: ['chest', 'waist', 'shoulders', 'sleeveLength', 'torsoLength'],
      sizes: {
        XS:  { chest: 92,  waist: 80,  shoulders: 43, sleeveLength: 61, torsoLength: 66 },
        S:   { chest: 98,  waist: 86,  shoulders: 45, sleeveLength: 63, torsoLength: 68 },
        M:   { chest: 104, waist: 92,  shoulders: 47, sleeveLength: 65, torsoLength: 71 },
        L:   { chest: 112, waist: 100, shoulders: 49, sleeveLength: 66, torsoLength: 74 },
        XL:  { chest: 120, waist: 108, shoulders: 51, sleeveLength: 67, torsoLength: 76 },
        XXL: { chest: 128, waist: 118, shoulders: 54, sleeveLength: 68, torsoLength: 78 }
      }
    },
    dress: {
      label: 'Dress',
      zones: ['chest', 'waist', 'hips', 'torsoLength'],
      sizes: {
        XS:  { chest: 82,  waist: 64,  hips: 88,  torsoLength: 84 },
        S:   { chest: 86,  waist: 68,  hips: 92,  torsoLength: 86 },
        M:   { chest: 90,  waist: 72,  hips: 96,  torsoLength: 88 },
        L:   { chest: 96,  waist: 78,  hips: 102, torsoLength: 90 },
        XL:  { chest: 102, waist: 86,  hips: 108, torsoLength: 92 },
        XXL: { chest: 110, waist: 94,  hips: 116, torsoLength: 94 }
      }
    },
    jeans: {
      label: 'Jeans / Trousers',
      zones: ['waist', 'hips', 'thigh', 'inseam'],
      sizes: {
        XS:  { waist: 68,  hips: 88,  thigh: 52, inseam: 76 },
        S:   { waist: 74,  hips: 94,  thigh: 55, inseam: 78 },
        M:   { waist: 80,  hips: 100, thigh: 58, inseam: 80 },
        L:   { waist: 88,  hips: 106, thigh: 61, inseam: 81 },
        XL:  { waist: 96,  hips: 112, thigh: 64, inseam: 82 },
        XXL: { waist: 106, hips: 120, thigh: 68, inseam: 82 }
      }
    },
    shorts: {
      label: 'Shorts',
      zones: ['waist', 'hips', 'thigh'],
      sizes: {
        XS:  { waist: 68,  hips: 88,  thigh: 52 },
        S:   { waist: 74,  hips: 94,  thigh: 55 },
        M:   { waist: 80,  hips: 100, thigh: 58 },
        L:   { waist: 88,  hips: 106, thigh: 61 },
        XL:  { waist: 96,  hips: 112, thigh: 64 },
        XXL: { waist: 106, hips: 120, thigh: 68 }
      }
    },
    skirt: {
      label: 'Skirt',
      zones: ['waist', 'hips'],
      sizes: {
        XS:  { waist: 64,  hips: 88 },
        S:   { waist: 68,  hips: 92 },
        M:   { waist: 72,  hips: 96 },
        L:   { waist: 78,  hips: 102 },
        XL:  { waist: 86,  hips: 108 },
        XXL: { waist: 94,  hips: 116 }
      }
    }
  };

  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  // The built-in charts list the BODY measurements each size is designed
  // for — the designer already added the garment's ease. Mark them so
  // evalZone compares body-to-body instead of demanding ease on top
  // (otherwise everyone gets recommended one size too big).
  for (const k of Object.keys(SIZE_CHARTS)) SIZE_CHARTS[k].bodyChart = true;

  /* ----------------------------------------------------------
     Zone metadata: display names + how much ease (extra room
     over the body measurement) each zone ideally has, per fit
     preference. Girth zones use ease; length zones use ranges.
     ---------------------------------------------------------- */

  const ZONES = {
    chest:        { label: 'Chest',        kind: 'girth',  ease: { slim: 4,  regular: 8,  relaxed: 14 }, tol: 4 },
    waist:        { label: 'Waist',        kind: 'girth',  ease: { slim: 2,  regular: 5,  relaxed: 10 }, tol: 4 },
    hips:         { label: 'Hips',         kind: 'girth',  ease: { slim: 2,  regular: 5,  relaxed: 10 }, tol: 4 },
    thigh:        { label: 'Thigh',        kind: 'girth',  ease: { slim: 2,  regular: 5,  relaxed: 9  }, tol: 3 },
    shoulders:    { label: 'Shoulders',    kind: 'width',  ease: { slim: 0,  regular: 1,  relaxed: 3  }, tol: 2 },
    sleeveLength: { label: 'Sleeve length',kind: 'length', tol: 2.5 },
    torsoLength:  { label: 'Garment length', kind: 'length', tol: 3 },
    inseam:       { label: 'Inseam',       kind: 'length', tol: 3 }
  };

  // Which body measurement feeds each garment zone.
  const BODY_SOURCE = {
    chest: 'chest',
    waist: 'waist',
    hips: 'hips',
    thigh: 'thigh',
    shoulders: 'shoulders',
    sleeveLength: 'armLength',
    torsoLength: null, // judged against height-derived ideal
    inseam: 'inseam'
  };

  // Ideal garment length as a fraction of body height.
  const LENGTH_RATIO = {
    torsoLength: { tshirt: 0.395, shirt: 0.42, hoodie: 0.40, jacket: 0.42, dress: 0.52 },
    inseam: { jeans: 0.45, shorts: 0.25 }
  };

  /* ----------------------------------------------------------
     Fields the profile form collects (all in cm internally).
     ---------------------------------------------------------- */

  // Minimums accommodate the whole family — a 5-month-old baby is
  // roughly 62cm tall with a 43cm chest, so the floor sits below that.
  const BODY_FIELDS = [
    { key: 'height',    label: 'Height',            required: true,  min: 45,  max: 230, hint: 'Stand straight against a wall' },
    { key: 'weight',    label: 'Weight',            required: false, min: 2,   max: 250, unit: 'kg', hint: 'Optional — improves confidence' },
    { key: 'chest',     label: 'Chest / Bust',      required: true,  min: 35,  max: 170, hint: 'Around the fullest part of your chest' },
    { key: 'waist',     label: 'Waist',             required: true,  min: 30,  max: 160, hint: 'Around your natural waistline' },
    { key: 'hips',      label: 'Hips',              required: true,  min: 35,  max: 170, hint: 'Around the widest part of your hips' },
    { key: 'shoulders', label: 'Shoulder width',    required: false, min: 14,  max: 65,  hint: 'Across the back, shoulder to shoulder' },
    { key: 'armLength', label: 'Arm length',        required: false, min: 15,  max: 85,  hint: 'Shoulder to wrist, arm relaxed' },
    { key: 'inseam',    label: 'Inseam',            required: false, min: 15,  max: 100, hint: 'Crotch to ankle, along the inner leg' },
    { key: 'thigh',     label: 'Thigh',             required: false, min: 14,  max: 90,  hint: 'Around the widest part of your thigh' }
  ];

  /* ----------------------------------------------------------
     Core: evaluate one zone of one size against the body.
     Returns { status, delta, message, score } where score
     is 0..100 (100 = perfect).
     ---------------------------------------------------------- */

  // Brand size guides state the BODY measurements each size is made
  // for, so the brand already added the garment's ease. Fit preference
  // then only nudges the target slightly.
  const BODY_CHART_EASE = { slim: -2, regular: 0, relaxed: 4 };

  function evalZone(zoneKey, chart, garmentType, size, body, fitPref) {
    const zone = ZONES[zoneKey];
    const garmentVal = chart.sizes[size][zoneKey];
    if (garmentVal == null) return null;

    if (zone.kind === 'girth' || zone.kind === 'width') {
      const bodyVal = body[BODY_SOURCE[zoneKey]];
      if (bodyVal == null || bodyVal === '') return { status: 'info', delta: 0, score: 60, message: 'Not measured — add this measurement to your profile for a precise check.' };

      const idealEase = chart.bodyChart
        ? BODY_CHART_EASE[fitPref] != null ? BODY_CHART_EASE[fitPref] : 0
        : zone.ease[fitPref] != null ? zone.ease[fitPref] : zone.ease.regular;
      const actualEase = garmentVal - bodyVal;      // room the garment gives you
      const delta = actualEase - idealEase;         // + = roomier than ideal, − = tighter
      const t = zone.tol;

      if (delta < -t * 1.75) return { status: 'tight', delta, score: clampScore(38 + delta), message: `Too tight — about ${fmt(-actualEase > 0 ? -delta : -delta)} cm less room than ideal at the ${zone.label.toLowerCase()}. ${actualEase < 0 ? 'It is smaller than your body here and will pull or pinch.' : 'Expect it to feel restrictive.'}` };
      if (delta < -t)        return { status: 'tight', delta, score: clampScore(68 + delta * 2), message: `Slightly tight at the ${zone.label.toLowerCase()} — wearable, but snugger than a ${fitPref} fit should be.` };
      if (delta > t * 1.75)  return { status: 'loose', delta, score: clampScore(38 - delta), message: `Too loose — about ${fmt(delta)} cm more room than ideal at the ${zone.label.toLowerCase()}. Expect visible bagginess.` };
      if (delta > t)         return { status: 'loose', delta, score: clampScore(68 - delta * 2), message: `Slightly loose at the ${zone.label.toLowerCase()} — a bit roomier than a ${fitPref} fit.` };
      return { status: 'good', delta, score: clampScore(100 - Math.abs(delta) * 3), message: `Good fit at the ${zone.label.toLowerCase()} — close to the ideal amount of room for a ${fitPref} fit.` };
    }

    // Length zones.
    let idealLen = null;
    const src = BODY_SOURCE[zoneKey];
    if (src && body[src] != null && body[src] !== '') {
      idealLen = Number(body[src]);
    } else if (LENGTH_RATIO[zoneKey] && LENGTH_RATIO[zoneKey][garmentType] && body.height) {
      idealLen = Number(body.height) * LENGTH_RATIO[zoneKey][garmentType];
    }
    if (idealLen == null) return { status: 'info', delta: 0, score: 60, message: 'Not enough data to judge this length — add height or arm/inseam measurements.' };

    const delta = garmentVal - idealLen;
    const t = zone.tol;
    if (delta < -t * 1.75) return { status: 'short', delta, score: clampScore(40 + delta), message: `Too short — the ${zone.label.toLowerCase()} runs about ${fmt(-delta)} cm shorter than ideal for your height.` };
    if (delta < -t)        return { status: 'short', delta, score: clampScore(68 + delta * 2), message: `Runs slightly short in ${zone.label.toLowerCase()} for your proportions.` };
    if (delta > t * 1.75)  return { status: 'long', delta, score: clampScore(40 - delta), message: `Too long — the ${zone.label.toLowerCase()} runs about ${fmt(delta)} cm longer than ideal. It may bunch or need altering.` };
    if (delta > t)         return { status: 'long', delta, score: clampScore(68 - delta * 2), message: `Runs slightly long in ${zone.label.toLowerCase()}.` };
    return { status: 'good', delta, score: clampScore(100 - Math.abs(delta) * 3), message: `Good ${zone.label.toLowerCase()} for your proportions.` };
  }

  function clampScore(n) {
    return Math.max(5, Math.min(100, Math.round(n)));
  }

  function fmt(n) {
    return Math.abs(Math.round(n * 2) / 2);
  }

  /* ----------------------------------------------------------
     Evaluate one full size: weighted zone scores → overall.
     Girth problems (especially "too tight") weigh more than
     length problems, because length is easier to live with.
     ---------------------------------------------------------- */

  const ZONE_WEIGHT = { chest: 3, waist: 3, hips: 3, shoulders: 2.5, thigh: 2, sleeveLength: 1.5, torsoLength: 1.5, inseam: 1.5 };

  function evalSize(chart, garmentType, size, body, fitPref) {
    const zones = {};
    let weighted = 0, weightSum = 0, measuredZones = 0;

    for (const zk of chart.zones) {
      const res = evalZone(zk, chart, garmentType, size, body, fitPref);
      if (!res) continue;
      zones[zk] = res;
      const w = ZONE_WEIGHT[zk] || 1;
      // "tight" scores get an extra penalty — tight is worse than loose.
      const effective = res.status === 'tight' ? res.score * 0.9 : res.score;
      weighted += effective * w;
      weightSum += w;
      if (res.status !== 'info') measuredZones++;
    }

    const score = weightSum ? Math.round(weighted / weightSum) : 0;
    return { size, score, zones, measuredZones };
  }

  /* ----------------------------------------------------------
     Public: analyze(garmentType, body, fitPref[, pickedSize])
     Scores every size, picks the best, builds the verdict.
     ---------------------------------------------------------- */

  function analyze(garmentType, body, fitPref, pickedSize, customChart) {
    const baseChart = SIZE_CHARTS[garmentType];
    const chart = customChart || baseChart;
    if (!chart) return null;
    fitPref = fitPref || 'regular';

    const order = chart.sizeOrder || SIZE_ORDER;
    const allSizes = order.map(s => evalSize(chart, garmentType, s, body, fitPref));
    let best = allSizes[0];
    for (const s of allSizes) if (s.score > best.score) best = s;

    const evaluated = pickedSize && chart.sizes[pickedSize]
      ? allSizes.find(s => s.size === pickedSize)
      : best;

    // Confidence: how many zones we could actually measure.
    const totalZones = chart.zones.length;
    const confidence = Math.round(50 + 50 * (evaluated.measuredZones / totalZones));

    // Headline verdict for the evaluated size — in the house tailor's voice.
    const problems = Object.entries(evaluated.zones)
      .filter(([, z]) => z.status !== 'good' && z.status !== 'info')
      .sort((a, b) => a[1].score - b[1].score);

    const pool = evaluated.score >= 92 ? VERDICT_LINES.bespoke
      : evaluated.score >= 82 ? VERDICT_LINES.good
      : evaluated.score >= 65 ? VERDICT_LINES.fair
      : VERDICT_LINES.poor;
    let verdict = pool[Math.floor(Math.random() * pool.length)](evaluated.size);

    if (problems.length) {
      const worst = problems[0];
      verdict += ` Main issue: ${statusWord(worst[1].status)} at the ${ZONES[worst[0]].label.toLowerCase()}.`;
    }

    // Tiebreaker: when the runner-up lands within 5 points of the best
    // size, spell out which zones each one wins and make the call.
    let tiebreaker = null;
    const runner = allSizes.filter(s => s.size !== best.size).sort((a, b) => b.score - a.score)[0];
    if (runner && best.score - runner.score <= 5 && best.score >= 60) {
      const aWins = [], bWins = [];
      for (const zk of Object.keys(best.zones)) {
        const za = best.zones[zk], zb = runner.zones[zk];
        if (!zb || za.status === 'info' || zb.status === 'info') continue;
        if (za.score - zb.score >= 6) aWins.push(ZONES[zk].label.toLowerCase());
        else if (zb.score - za.score >= 6) bWins.push(ZONES[zk].label.toLowerCase());
      }
      const tight = Object.entries(runner.zones).find(([, z]) => z.status === 'tight');
      const loose = Object.entries(runner.zones).find(([, z]) => z.status === 'loose');
      const call = tight
        ? `If in doubt, take the ${best.size} — the ${runner.size} runs snug at the ${ZONES[tight[0]].label.toLowerCase()}.`
        : loose
          ? `If in doubt, take the ${best.size} — the ${runner.size} drifts baggy at the ${ZONES[loose[0]].label.toLowerCase()}.`
          : `If in doubt, take the ${best.size} — it's the closer cut overall.`;
      tiebreaker = { a: best.size, b: runner.size, aWins, bWins, call };
    }

    return {
      garmentType,
      garmentLabel: customChart
        ? (baseChart ? baseChart.label : 'Garment') + ' · ' + (chart.brand || 'brand chart')
        : chart.label,
      fitPref,
      evaluatedSize: evaluated.size,
      pickedSize: pickedSize || null,
      bestSize: best.size,
      bestScore: best.score,
      score: evaluated.score,
      confidence,
      verdict,
      zones: evaluated.zones,
      allSizes: allSizes.map(s => ({ size: s.size, score: s.score })),
      tiebreaker,
      silhouette: silhouetteNotes(body),
      brand: customChart ? chart.brand || null : null,
      source: customChart ? chart.source || null : null
    };
  }

  /* ----------------------------------------------------------
     The house tailor's verdict lines, by score band.
     Picked once per analysis, then frozen into the result.
     ---------------------------------------------------------- */

  const VERDICT_LINES = {
    bespoke: [
      s => `Size ${s} is practically bespoke — take it and don't look back.`,
      s => `Size ${s} — as close to made-for-you as off-the-rack gets.`,
      s => `Size ${s} sits like it was cut to your pattern.`
    ],
    good: [
      s => `Size ${s} is a clean fit — no arguments from the tape.`,
      s => `Size ${s} fits you well — a solid choice.`,
      s => `Size ${s} will serve you well.`
    ],
    fair: [
      s => `Size ${s} is wearable, though the tape has notes.`,
      s => `Size ${s} will do — just not everywhere.`,
      s => `Size ${s} works, with a few compromises.`
    ],
    poor: [
      s => `Size ${s} was never cut for you — walk away.`,
      s => `Size ${s} fights your frame. Pass on it.`,
      s => `Size ${s} is not your size — the tape doesn't lie.`
    ]
  };

  /* ----------------------------------------------------------
     Silhouette notes — what your proportions mean for how
     clothes will fit you, derived from measurement ratios.
     ---------------------------------------------------------- */

  function silhouetteNotes(body) {
    const n = k => { const v = Number(body && body[k]); return isFinite(v) && v > 0 ? v : null; };
    const notes = [];
    const chest = n('chest'), waist = n('waist'), hips = n('hips'),
          shoulders = n('shoulders'), arm = n('armLength'),
          inseam = n('inseam'), height = n('height');

    if (shoulders && chest) {
      const r = shoulders / chest;
      if (r >= 0.49) notes.push({ label: 'Shoulders', note: 'Broad shoulders relative to your chest — the shoulder seam is your fitting point. Size for the shoulders and let the chest follow.' });
      else if (r <= 0.42) notes.push({ label: 'Shoulders', note: 'Neat shoulders relative to your chest — structured shoulders will run wide on you. Softer, unstructured cuts sit better.' });
    }
    if (chest && waist) {
      const drop = chest - waist;
      if (drop >= 18) notes.push({ label: 'Taper', note: 'A strong chest-to-waist taper — regular cuts may billow at the waist. Slim or tailored fits will follow your line.' });
      else if (drop <= 6) notes.push({ label: 'Taper', note: 'Fairly straight through the middle — regular and relaxed cuts sit cleaner on you than aggressive slim fits.' });
    }
    if (hips && waist && hips - waist >= 24) {
      notes.push({ label: 'Waist to hip', note: 'A defined hip-to-waist line — trousers sized to your hips will gape at the waist. Curved or stretch waistbands are your friend.' });
    }
    if (arm && height) {
      const r = arm / height;
      if (r >= 0.375) notes.push({ label: 'Arms', note: 'Long arms for your height — sleeves will run short on standard sizing. Check the sleeve length before anything else.' });
      else if (r <= 0.335) notes.push({ label: 'Arms', note: 'Shorter arms for your height — expect sleeves to run long; cuffs may need turning or altering.' });
    }
    if (inseam && height) {
      const r = inseam / height;
      if (r >= 0.47) notes.push({ label: 'Legs', note: 'Long legs for your height — standard inseams will run short. "Tall" or longer-length options are worth seeking out.' });
      else if (r <= 0.42) notes.push({ label: 'Legs', note: 'Shorter legs for your height — standard inseams will stack at the ankle. A quick hem keeps trousers clean.' });
    }
    if (height && height >= 190) notes.push({ label: 'Height', note: 'Length is your battleground — a garment that fits your girth can still run short. Prioritise length measurements.' });
    else if (height && height <= 162) notes.push({ label: 'Height', note: 'Standard sizes will run long on you overall — petite or short-length ranges will save you alterations.' });

    return notes.slice(0, 3);
  }

  /* ----------------------------------------------------------
     Custom charts fetched from a brand's website
     (payload from /api/size-chart).
     ---------------------------------------------------------- */

  function buildCustomChart(data) {
    if (!data || !data.sizes || !data.sizeOrder || data.sizeOrder.length < 2) return null;
    return {
      label: (data.brand || 'Brand') + ' size guide',
      brand: data.brand || null,
      source: data.source || null,
      zones: data.zones,
      sizes: data.sizes,
      sizeOrder: data.sizeOrder,
      // "garment" charts (flat product measurements, doubled to girths by
      // the server) need ease expectations; body charts compare directly
      bodyChart: data.measurements !== 'garment',
      custom: true
    };
  }

  function statusWord(status) {
    return { tight: 'too tight', loose: 'too loose', short: 'too short', long: 'too long' }[status] || status;
  }

  /* ---------- units ---------- */

  function cmToIn(cm) { return Math.round((cm / 2.54) * 10) / 10; }
  function inToCm(inch) { return Math.round(inch * 2.54 * 10) / 10; }

  return { SIZE_CHARTS, SIZE_ORDER, ZONES, BODY_FIELDS, analyze, buildCustomChart, silhouetteNotes, statusWord, cmToIn, inToCm };
})();
