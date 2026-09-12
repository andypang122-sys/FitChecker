'use strict';
/* ============================================================
   FitFeedback — "so did it actually fit?"

   The engine judges a garment against a size chart. Nothing until
   now ever checked whether it was right, which left two holes:

     1. The wearer's own body does not match the national average
        the chart was drafted from. If someone reports "too tight"
        three times running on sizes we called good, our ease
        assumption is wrong FOR THEM, and we can correct it.

     2. Brands lie. "Runs small" is the single most useful fact
        about a retailer and it only exists in aggregate, across
        wearers. That is the dataset the merchant side of this
        product is supposed to be worth paying for, and it starts
        with asking one question after a purchase.

   Reports are kept on-device and drive (1) locally. (2) is an
   optional, anonymous POST carrying only brand / garment / size /
   outcome — never measurements, never an account id.
   ============================================================ */

const FitFeedback = (() => {

  const KEY = 'fitcheck_fit_reports';
  const MAX_REPORTS = 300;

  /* How far one report moves our ease assumption, in cm. Deliberately
     small: this is a nudge accumulated over several garments, not a
     single-report override. Someone who buys one unlucky slim-cut shirt
     has not told us their chest measurement is wrong. */
  const NUDGE_CM = 1.5;
  const MIN_REPORTS = 2;
  const MAX_BIAS = 4;

  const OUTCOMES = {
    'too-tight': { label: 'Too tight', nudge: +NUDGE_CM },
    'good':      { label: 'Fitted well', nudge: 0 },
    'too-loose': { label: 'Too loose', nudge: -NUDGE_CM }
  };

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; }
    catch (e) { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_REPORTS))); }
    catch (e) { /* quota — the calibration is a nicety, never break a save */ }
  }

  function all() { return read(); }

  function forGarment(garmentType) {
    return read().filter(r => r.garmentType === garmentType);
  }

  /* Record one outcome. `analysis` is the result object the engine
     returned, so the report carries what we predicted alongside what
     actually happened — without that pairing the data says nothing. */
  function record(analysis, outcome, opts) {
    if (!OUTCOMES[outcome] || !analysis) return null;
    opts = opts || {};
    const report = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      garmentType: analysis.garmentType || null,
      size: analysis.evaluatedSize || null,
      predictedScore: analysis.score != null ? analysis.score : null,
      brand: analysis.brand || opts.brand || null,
      fitPref: analysis.fitPref || null,
      outcome: outcome
    };
    const list = read();
    list.push(report);
    write(list);
    if (opts.share !== false) share(report);
    return report;
  }

  function remove(id) {
    write(read().filter(r => r.id !== id));
  }

  function clear() { write([]); }

  /* ---------- calibration ----------
     The correction to add to the engine's ideal-ease target for this
     wearer, in cm. Positive means "you consistently need more room
     than the chart assumes".

     Reports for the same garment type are worth most, but a wearer
     who runs tight in shirts usually runs tight in jackets too, so
     everything else counts at a third of the weight. Recent reports
     outweigh old ones — bodies change. */
  function calibration(garmentType) {
    const list = read();
    if (list.length < MIN_REPORTS) return 0;

    const relevant = garmentType ? list.filter(r => r.garmentType === garmentType) : list;
    if (garmentType && relevant.length < MIN_REPORTS && list.length < MIN_REPORTS) return 0;

    const now = Date.now();
    const HALF_LIFE = 180 * 24 * 60 * 60 * 1000; // six months
    let weighted = 0, weightSum = 0;

    for (const r of list) {
      const o = OUTCOMES[r.outcome];
      if (!o) continue;
      const sameType = !garmentType || r.garmentType === garmentType;
      const recency = Math.pow(0.5, (now - (r.ts || now)) / HALF_LIFE);
      const w = (sameType ? 1 : 0.33) * recency;
      weighted += o.nudge * w;
      weightSum += w;
    }

    if (weightSum <= 0) return 0;
    const bias = weighted / weightSum;
    return Math.max(-MAX_BIAS, Math.min(MAX_BIAS, Math.round(bias * 10) / 10));
  }

  /* A plain-English account of what the calibration is doing, so the
     adjustment is never invisible. Returns null when it is not active. */
  function explain(garmentType) {
    const bias = calibration(garmentType);
    if (!bias) return null;
    const n = read().length;
    const direction = bias > 0 ? 'more room' : 'less room';
    return `Adjusted from your ${n} fit report${n === 1 ? '' : 's'}: `
         + `you tend to want about ${Math.abs(bias)} cm ${direction} than the chart assumes.`;
  }

  /* How well the engine has been doing, for an honest accuracy readout. */
  function accuracy() {
    const list = read();
    if (!list.length) return null;
    const good = list.filter(r => r.outcome === 'good').length;
    return { total: list.length, good, pct: Math.round((good / list.length) * 100) };
  }

  /* ---------- anonymous aggregate ----------
     Fire-and-forget. No account, no measurements, no id — only the
     fact that one person found this brand's M too tight. Failure is
     silent by design: this must never interrupt the user. */
  function share(report) {
    if (!report || !report.brand) return;
    try {
      fetch('api/fit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: report.brand,
          garmentType: report.garmentType,
          size: report.size,
          outcome: report.outcome
        })
      }).catch(() => {});
    } catch (e) { /* offline — the local calibration still works */ }
  }

  /* What everyone else found about this brand + garment, if anything. */
  function brandVerdict(brand, garmentType) {
    if (!brand) return Promise.resolve(null);
    const q = 'api/fit-feedback?brand=' + encodeURIComponent(brand)
            + (garmentType ? '&garment=' + encodeURIComponent(garmentType) : '');
    return fetch(q)
      .then(r => r.json())
      .then(d => (d && d.ok && d.total >= 5) ? d : null)
      .catch(() => null);
  }

  return { OUTCOMES, all, forGarment, record, remove, clear,
           calibration, explain, accuracy, brandVerdict };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FitFeedback;
if (typeof window !== 'undefined') window.FitFeedback = FitFeedback;
