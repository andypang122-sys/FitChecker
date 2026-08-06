'use strict';
/* ============================================================
   Returns — how likely is this to go back?

   FitCheck already answers "what size am I". This answers the
   question the shopper is actually asking underneath it, which is
   "am I going to have to send this back". Those are not the same
   question, and the second one is worth far more.

   Why it is worth more, commercially: clothing return rates online
   run around 25-40%, the overwhelming majority for fit, and the
   shopper eats the hassle while the retailer eats the cost. An app
   that lowers that number is worth money to both, which is the
   strongest affiliate position FitCheck can occupy — "we sent you a
   customer who keeps things" is a far better pitch than "we sent you
   a click".

   Why it is worth more to the user: "size M" is advice you can
   ignore. "There is a good chance this comes back — here is the one
   measurement that decides it" is advice you act on.

   The honest core: this is a MODELLED risk, not an observed one. We
   have no returns data — no app without a retailer feed does. What
   we do have is the fit analysis itself, and the things that
   genuinely drive returns are visible in it: how marginal the size
   call is, how badly one zone disagrees with the others, how much a
   brand's sizing wanders, and how much of the body we actually
   measured. Those are combined transparently and the output always
   shows its reasoning, so nobody mistakes it for a statistic.
   ============================================================ */

const Returns = (() => {

  /* Bands. Deliberately coarse — a precise-looking percentage would
     imply data we do not have. */
  const BANDS = [
    { key: 'low',   max: 22, label: 'Low risk',        tone: 'good', emoji: '✅',
      line: 'This should fit. Order it with reasonable confidence.' },
    { key: 'some',  max: 40, label: 'Some risk',       tone: 'ok',   emoji: '🙂',
      line: 'Likely fine, but there is one thing worth checking before you buy.' },
    { key: 'high',  max: 62, label: 'Risky',           tone: 'warn', emoji: '⚠️',
      line: 'This is a marginal call. Order two sizes, or check the garment measurements first.' },
    { key: 'vhigh', max: 101, label: 'Likely to come back', tone: 'bad', emoji: '🔁',
      line: 'The numbers do not agree well enough. Buying from somewhere with free returns would be sensible.' }
  ];

  function band(score) { return BANDS.find(b => score <= b.max) || BANDS[BANDS.length - 1]; }

  /* ---------- the drivers ----------
     Each returns a 0-100 contribution and an explanation. They are
     weighted rather than averaged, because they are not equally
     predictive: a single badly-wrong zone sends a garment back on its
     own, whereas low confidence only widens the uncertainty. */

  /* 1. How close was the size call? A fit sitting on the boundary
        between two sizes is the single biggest cause of returns. */
  function marginalityOf(result) {
    if (!result || !result.sizes || !result.sizes.length) return { v: 40, why: null };
    const sorted = result.sizes.slice().sort((a, b) => b.score - a.score);
    if (sorted.length < 2) return { v: 30, why: null };
    const gap = sorted[0].score - sorted[1].score;
    /* A 25-point gap is a clear win; a 2-point gap is a coin toss. */
    const v = Math.max(0, Math.min(100, Math.round(100 - gap * 4)));
    return {
      v,
      why: gap < 8
        ? { label: 'It is between two sizes',
            line: `${sorted[0].size} and ${sorted[1].size} score almost the same. Which one works depends on how you like things to sit.` }
        : null
    };
  }

  /* 2. The worst single zone. An otherwise perfect shirt that is too
        tight across the chest still goes back. */
  function worstZoneOf(result) {
    if (!result || !result.zones) return { v: 35, why: null };
    let worst = null, worstKey = null;
    Object.keys(result.zones).forEach(k => {
      const z = result.zones[k];
      if (!z || z.score == null) return;
      if (!worst || z.score < worst.score) { worst = z; worstKey = k; }
    });
    if (!worst) return { v: 35, why: null };

    const v = Math.max(0, Math.min(100, Math.round(100 - worst.score)));
    /* Tight is worse than loose: loose is a look, tight is unwearable. */
    const bump = worst.status === 'tight' ? 12 : 0;
    return {
      v: Math.min(100, v + bump),
      why: worst.score < 70
        ? { label: worst.status === 'tight' ? 'Tight somewhere' : 'Loose somewhere',
            line: worst.message || ('The ' + worstKey + ' is the zone that does not agree with the rest.'),
            zone: worstKey }
        : null
    };
  }

  /* 3. The brand itself. Some brands are simply inconsistent between
        items, and no amount of body measurement fixes that. */
  function brandRiskOf(brandId, garmentType) {
    if (typeof Brands === 'undefined') return { v: 40, why: null };
    const b = Brands.get(brandId);
    let v = 30;
    if (b.confidence === 'first-party') v = 12;
    else if (b.confidence === 'modelled') v = 45;
    if (b.volatile) v += 25;

    const d = Brands.drift ? Brands.drift(brandId, garmentType) : null;
    return {
      v: Math.min(100, v),
      why: b.volatile
        ? { label: 'This brand wanders', line: b.name + ' varies noticeably between items and seasons, so any single recommendation is a starting point rather than a promise.' }
        : (d && d.note ? { label: 'Known quirk', line: d.note } : null)
    };
  }

  /* 4. How much of the body we actually know. Guessing from two
        measurements is not the same as knowing from six. */
  function confidenceRiskOf(confidence) {
    const c = (confidence && confidence.score != null) ? confidence.score : (confidence || 60);
    return {
      v: Math.max(0, Math.min(100, Math.round(100 - c))),
      why: c < 65
        ? { label: 'We are working from little', line: 'Only some of your measurements are in, so this is more of an estimate than it needs to be. Adding the missing ones sharpens it considerably.' }
        : null
    };
  }

  const W = { marginal: 0.34, zone: 0.34, brand: 0.20, conf: 0.12 };

  /* ---------- the assessment ---------- */
  function assess(cmp, opts) {
    opts = opts || {};
    if (!cmp || !cmp.result) return null;

    const m = marginalityOf(cmp.result);
    const z = worstZoneOf(cmp.result);
    const b = brandRiskOf(opts.brandId || 'generic', opts.garmentType);
    const c = confidenceRiskOf(cmp.confidence);

    const score = Math.round(m.v * W.marginal + z.v * W.zone + b.v * W.brand + c.v * W.conf);
    const bd = band(score);

    const reasons = [m.why, z.why, b.why, c.why].filter(Boolean);

    return {
      score, band: bd,
      parts: [
        { key: 'marginal', label: 'How clear the size call is', v: m.v, w: W.marginal },
        { key: 'zone',     label: 'Worst-fitting area',         v: z.v, w: W.zone },
        { key: 'brand',    label: 'How predictable the brand is', v: b.v, w: W.brand },
        { key: 'conf',     label: 'How much we know about you',  v: c.v, w: W.conf }
      ],
      reasons,
      advice: advice(score, m, z, cmp, opts),
      /* Said plainly, every time, so the number is never mistaken for
         an observed return rate. */
      basis: 'Modelled from your measurements against this brand\'s chart — not from real return data, which no app has without the retailer\'s own feed.'
    };
  }

  /* The genuinely actionable part: what to do about it. */
  function advice(score, m, z, cmp, opts) {
    const out = [];
    if (m.why) {
      out.push({
        do: 'Order both sizes if returns are free',
        why: 'You are between sizes here, and trying both is the only way to settle it without guessing.'
      });
    }
    if (z.why && z.zone) {
      out.push({
        do: 'Check the garment\'s ' + z.zone + ' measurement on the product page',
        why: 'That is the one number that decides this. Most listings publish it, and comparing it to your own takes ten seconds.'
      });
    }
    if (score > 40 && cmp.shift) {
      out.push({
        do: cmp.shift > 0 ? 'Consider sizing up' : 'Consider sizing down',
        why: cmp.line
      });
    }
    if (!out.length) {
      out.push({ do: 'Order your recommended size', why: 'Nothing here suggests a problem — the measurements agree and the brand is predictable.' });
    }
    return out;
  }

  /* ---------- fit history ----------
     What was kept and what went back is the only real signal that
     ever enters this app, so when the user gives it, it is recorded
     and shown — never silently folded into a number. */
  const HKEY = 'fitcheck_fithistory';
  const read = () => { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } };
  const write = v => { try { localStorage.setItem(HKEY, JSON.stringify(v)); } catch (e) {} };

  function record(entry) {
    const l = read();
    /* The random suffix is not decoration. Two fit checks saved in the
       same millisecond used to be given the same id, and setOutcome
       looks entries up by id — so logging "kept" on the second one
       silently overwrote the first, and the brand record stayed empty
       no matter how much the user told it. */
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    l.unshift(Object.assign({ id, ts: Date.now() }, entry));
    write(l.slice(0, 200));
    return l[0];
  }
  function history(brandId) {
    const l = read();
    return brandId ? l.filter(e => e.brandId === brandId) : l;
  }
  function setOutcome(id, outcome) {
    const l = read();
    const e = l.find(x => x.id === id);
    if (e) { e.outcome = outcome; write(l); }
    return e;
  }

  /* Your own history with a brand beats any model of it. If there is
     enough of it, say so plainly rather than burying it. */
  function yourRecord(brandId) {
    const l = history(brandId).filter(e => e.outcome);
    if (l.length < 2) return null;
    const kept = l.filter(e => e.outcome === 'kept').length;
    const back = l.filter(e => e.outcome === 'returned').length;
    const pct = Math.round((kept / l.length) * 100);
    return {
      total: l.length, kept, back, pct,
      line: kept === l.length
        ? `You have kept all ${l.length} things you logged from here.`
        : `You have kept ${kept} of ${l.length} things from here` +
          (back ? `, and sent ${back} back.` : '.'),
      /* Sizes that worked are the most useful thing in the whole app. */
      sizesKept: [...new Set(l.filter(e => e.outcome === 'kept' && e.size).map(e => e.size))]
    };
  }

  return {
    BANDS, band, assess, advice,
    record, history, setOutcome, yourRecord,
    marginalityOf, worstZoneOf, brandRiskOf, confidenceRiskOf
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Returns;
if (typeof window !== 'undefined') window.Returns = Returns;
