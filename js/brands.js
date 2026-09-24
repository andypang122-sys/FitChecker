'use strict';
/* ============================================================
   Brands — the per-brand sizing layer.

   WHY THIS IS THE IMPORTANT FILE.
   "What's my size?" is not a useful answer, because size is not a
   property of a person — it's a property of a person AND a brand.
   A 96cm chest is a Uniqlo L, a Gap M and a COS S. The generic
   engine in fit-engine.js gets you to a standards-based body
   ladder; this file is what turns that into "at THIS brand, in
   THIS category, take THIS size", which is the question people
   actually have while standing in a shop or hovering over a
   checkout button. It is also the part competitors can't copy
   quickly, because it compounds with every correction users feed
   back into it.

   HOW SIZING IS MODELLED — read before adding a brand.
   Brands are stored as OFFSETS (in cm) from the international
   standard chart, not as transcribed tables. That is a deliberate
   choice on two grounds:

     • Honesty. Published charts change per season and per region,
       and a precise-looking table that is quietly wrong is worse
       than an explicit estimate — someone buys the wrong size and
       stops trusting the app. Offsets encode what is actually
       well established (this brand runs about a size small) without
       pretending to a precision we don't have.
     • Maintenance. One number per zone per brand is correctable
       from a single user report. A full table is not.

   Each brand therefore carries a `confidence`:
     'published'  — transcribed from the brand's own chart. Trust it.
     'modelled'   — derived from well-documented fit reputation.
                    Good enough to pick a size, flagged as an estimate.
     'first-party'— we own the brand and the pattern. Exact.

   TO UPGRADE A BRAND: replace `bias` with an explicit `sizes`
   block in the same shape fit-engine uses, and set confidence to
   'published'. chartFor() prefers `sizes` whenever present, so
   brands can be upgraded one at a time with no other changes.
   ============================================================ */

const Brands = (() => {

  /* Offsets are cm applied to the BODY each size is cut for.
     Negative = this brand's label is cut for a smaller body than the
     standard, i.e. it "runs small" and the wearer should size up. */

  const BRANDS = [
    {
      id: 'generic', name: 'Not listed / generic', region: '—',
      confidence: 'modelled', popular: true,
      note: 'Uses the international standard chart. Pick your brand for a sharper answer.',
      bias: {}
    },

    /* ---- our own label ----
       Print-on-demand and not launched yet, so there is no measured
       garment behind it: it uses the standard chart and says so.
       Once the first blanks are measured, add a `sizes` block and set
       confidence to 'first-party' — that is the only thing that earns it. */
    {
      id: 'trissan', name: 'Trissan', region: 'SE',
      confidence: 'modelled', popular: true,
      note: 'Our own label, launching soon. Until the first garments are measured this uses the standard European chart.',
      bias: {}
    },

    /* ---- Japanese / Asian sizing: consistently smaller labels ---- */
    {
      id: 'uniqlo', name: 'Uniqlo', region: 'JP',
      confidence: 'modelled', popular: true,
      note: 'Japanese sizing — roughly one size small against EU/US labels. Sleeves and body run short.',
      bias: {
        default: { chest: -5, waist: -5, shoulders: -1.5, hips: -4 },
        lengths: { sleeveLength: -1.5, torsoLength: -2 }
      }
    },
    {
      id: 'shein', name: 'SHEIN', region: 'CN',
      confidence: 'modelled', popular: true,
      note: 'Runs small and varies a lot between items — size up, and treat any single item as approximate.',
      volatile: true,
      bias: {
        default: { chest: -7, waist: -7, shoulders: -2, hips: -6 },
        lengths: { sleeveLength: -2, torsoLength: -2.5 }
      }
    },
    {
      id: 'muji', name: 'MUJI', region: 'JP',
      confidence: 'modelled',
      note: 'Japanese sizing but cut relaxed — the two roughly cancel on the body, sleeves still short.',
      bias: { default: { chest: -2, waist: -3, shoulders: -1 }, lengths: { sleeveLength: -1.5 } }
    },

    /* ---- European high street ---- */
    {
      id: 'zara', name: 'Zara', region: 'ES',
      confidence: 'modelled', popular: true,
      note: 'Runs small, particularly menswear and anything tailored. Shoulders are cut narrow.',
      volatile: true,
      bias: {
        default: { chest: -4, waist: -4, shoulders: -2, hips: -3 },
        lengths: { sleeveLength: -1 }
      }
    },
    {
      id: 'hm', name: 'H&M', region: 'SE',
      confidence: 'modelled', popular: true,
      note: 'Runs small, and inconsistent between lines — Divided runs smaller than the main label.',
      volatile: true,
      bias: { default: { chest: -3.5, waist: -4, shoulders: -1.5, hips: -3.5 } }
    },
    {
      id: 'cos', name: 'COS', region: 'SE',
      confidence: 'modelled',
      note: 'Deliberately oversized and boxy — most people take a size down from their usual.',
      bias: {
        default: { chest: 6, waist: 7, shoulders: 2, hips: 5 },
        lengths: { torsoLength: 3, sleeveLength: 1.5 }
      }
    },
    {
      id: 'arket', name: 'Arket', region: 'SE',
      confidence: 'modelled',
      note: 'Relaxed Scandinavian cut — a little roomier than standard, generous length.',
      bias: { default: { chest: 3, waist: 3.5, shoulders: 1 }, lengths: { torsoLength: 2 } }
    },
    {
      id: 'weekday', name: 'Weekday', region: 'SE',
      confidence: 'modelled',
      note: 'Oversized streetwear cut. Sizes are roomy and very boxy through the body.',
      bias: { default: { chest: 7, waist: 8, shoulders: 2.5 }, lengths: { torsoLength: 2.5 } }
    },
    {
      id: 'mango', name: 'Mango', region: 'ES',
      confidence: 'modelled',
      note: 'Similar to Zara — slim through the body, small labels.',
      bias: { default: { chest: -3, waist: -3.5, shoulders: -1.5, hips: -3 } }
    },
    {
      id: 'primark', name: 'Primark', region: 'IE',
      confidence: 'modelled',
      note: 'Very inconsistent between items — treat any single result as a starting point.',
      volatile: true,
      bias: { default: { chest: -2, waist: -2 } }
    },
    {
      id: 'massimo', name: 'Massimo Dutti', region: 'ES',
      confidence: 'modelled',
      note: 'Tailored and slim, but sized closer to true than Zara despite the shared parent.',
      bias: { default: { chest: -1.5, waist: -2, shoulders: -1 } }
    },

    /* ---- US: vanity sizing, labels cut for larger bodies ---- */
    {
      id: 'gap', name: 'Gap', region: 'US',
      confidence: 'modelled', popular: true,
      note: 'US vanity sizing — labels are cut for a larger body, so many people size down.',
      bias: { default: { chest: 5, waist: 6, shoulders: 1.5, hips: 5 } }
    },
    {
      id: 'oldnavy', name: 'Old Navy', region: 'US',
      confidence: 'modelled',
      note: 'Even more generous than Gap. Sizing down is common.',
      bias: { default: { chest: 6.5, waist: 8, shoulders: 2, hips: 6.5 } }
    },
    {
      id: 'ralphlauren', name: 'Ralph Lauren', region: 'US',
      confidence: 'modelled',
      note: 'Classic fit runs large and boxy; the Custom Slim line is roughly two sizes trimmer.',
      bias: { default: { chest: 6, waist: 6, shoulders: 2 }, lengths: { sleeveLength: 1 } }
    },
    {
      id: 'tommy', name: 'Tommy Hilfiger', region: 'US',
      confidence: 'modelled',
      note: 'Runs large through the body in the classic lines.',
      bias: { default: { chest: 4.5, waist: 5, shoulders: 1.5 } }
    },
    {
      id: 'abercrombie', name: 'Abercrombie & Fitch', region: 'US',
      confidence: 'modelled',
      note: 'Cut slim and short in the body despite being a US label.',
      bias: { default: { chest: -2, waist: -2, shoulders: -1 }, lengths: { torsoLength: -2 } }
    },
    {
      id: 'carhartt', name: 'Carhartt', region: 'US',
      confidence: 'modelled', popular: true,
      note: 'Workwear — cut boxy and generous to layer over. Carhartt WIP runs closer to EU sizing.',
      bias: {
        default: { chest: 8, waist: 9, shoulders: 2.5 },
        lengths: { sleeveLength: 1.5, torsoLength: 2 }
      }
    },
    {
      id: 'levis', name: "Levi's", region: 'US',
      confidence: 'modelled', popular: true,
      note: 'Denim is labelled by actual waist inches, so the number is honest — but rigid pairs stretch about 2cm with wear.',
      bias: { default: { waist: 1, hips: 1, thigh: 0.5 } }
    },

    /* ---- sportswear ---- */
    {
      id: 'nike', name: 'Nike', region: 'US',
      confidence: 'modelled', popular: true,
      note: 'True to size in standard fit; anything labelled Dri-FIT or "slim" is cut close.',
      bias: { default: { chest: 1, waist: 1 } }
    },
    {
      id: 'adidas', name: 'Adidas', region: 'DE',
      confidence: 'modelled', popular: true,
      note: 'Broadly true to size, cut a little slimmer through the chest than Nike.',
      bias: { default: { chest: -0.5, waist: 0 } }
    },
    {
      id: 'lululemon', name: 'Lululemon', region: 'CA',
      confidence: 'modelled',
      note: 'Athletic and close-fitting by design — compressive rather than small.',
      bias: { default: { chest: -3, waist: -3.5, hips: -3, thigh: -2 } }
    },
    {
      id: 'northface', name: 'The North Face', region: 'US',
      confidence: 'modelled',
      note: 'Outerwear cut to layer over a mid-layer, so it reads roomy on bare measurements.',
      bias: { default: { chest: 5, waist: 5, shoulders: 1.5 }, lengths: { sleeveLength: 1.5 } }
    },
    {
      id: 'patagonia', name: 'Patagonia', region: 'US',
      confidence: 'modelled',
      note: 'Relaxed through the body with long sleeves.',
      bias: { default: { chest: 4, waist: 4.5 }, lengths: { sleeveLength: 2 } }
    },

    /* ---- online-first ---- */
    {
      id: 'asos', name: 'ASOS Design', region: 'UK',
      confidence: 'modelled', popular: true,
      note: 'Own-brand runs close to true to size; other labels on the site do not follow it.',
      bias: { default: {} }
    },
    {
      id: 'boohoo', name: 'boohoo', region: 'UK',
      confidence: 'modelled',
      note: 'Runs small and varies item to item.',
      volatile: true,
      bias: { default: { chest: -4, waist: -5, hips: -4 } }
    },
    {
      id: 'urbanoutfitters', name: 'Urban Outfitters', region: 'US',
      confidence: 'modelled',
      note: 'Own-brand is cut oversized, especially tops.',
      bias: { default: { chest: 6, waist: 6.5, shoulders: 2 }, lengths: { torsoLength: 2 } }
    }
  ];

  const BY_ID = {};
  BRANDS.forEach(b => { BY_ID[b.id] = b; });

  function list()      { return BRANDS.slice(); }
  function popular()   { return BRANDS.filter(b => b.popular); }
  function get(id)     { return BY_ID[id] || BY_ID.generic; }

  function search(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return popular();
    return BRANDS.filter(b => b.name.toLowerCase().indexOf(q) > -1 || b.id.indexOf(q) > -1);
  }

  /* ==========================================================
     chartFor — the whole point of the module.

     Returns a chart in exactly the shape fit-engine.analyze()
     expects for its `customChart` argument, so brand-aware fit
     checking needs no engine changes at all.
     ========================================================== */
  function chartFor(brandId, garmentType, sex) {
    if (typeof FitEngine === 'undefined') return null;
    const base = FitEngine.chartFor(garmentType, sex);
    if (!base) return null;

    const brand = get(brandId);

    /* A brand upgraded to a real transcribed table wins outright. */
    if (brand.sizes && brand.sizes[garmentType]) {
      const explicit = brand.sizes[garmentType][sex === 'female' ? 'female' : 'male'];
      if (explicit) {
        return Object.assign({}, base, {
          sizes: explicit, brand: brand.name, brandId: brand.id,
          source: 'Published chart', confidence: 'published', bodyChart: true
        });
      }
    }

    const bias = brand.bias || {};
    const zoneBias = Object.assign({}, bias.default || {}, bias[garmentType] || {});
    const lenBias = bias.lengths || {};

    /* Womenswear is drafted to smaller absolute measurements, so a fixed
       cm offset lands harder on a women's chart than a men's. Scaling
       keeps "runs one size small" meaning the same thing for both. */
    const scale = (sex === 'female') ? 0.85 : 1;

    /* The wizard reads chart.sizeOrder directly when a custom chart is
       in play, so a brand chart has to carry one or the UI throws. */
    const order = FitEngine.SIZE_ORDER.filter(s => base.sizes[s]);

    const sizes = {};
    Object.keys(base.sizes).forEach(sz => {
      const row = base.sizes[sz];
      const out = {};
      Object.keys(row).forEach(zone => {
        const delta = (zoneBias[zone] != null ? zoneBias[zone] : 0) +
                      (lenBias[zone] != null ? lenBias[zone] : 0);
        out[zone] = Math.round((row[zone] + delta * scale) * 10) / 10;
      });
      sizes[sz] = out;
    });

    /* `brand` carries the display name because fit-engine builds its
       garmentLabel straight from it ("T-Shirt · Uniqlo"); the id rides
       alongside as brandId for lookups. */
    return Object.assign({}, base, {
      sizes: sizes,
      sizeOrder: order,
      brand: brand.name,
      brandId: brand.id,
      brandName: brand.name,
      confidence: brand.confidence,
      volatile: !!brand.volatile,
      note: brand.note,
      source: brand.confidence === 'first-party' ? 'Our own pattern' : 'Modelled from brand fit',
      bodyChart: true
    });
  }

  /* ==========================================================
     How far this brand sits from the standard, in plain words.
     Used for the "you usually take M — here take L" line, which is
     the single most useful sentence the app can produce.
     ========================================================== */
  function drift(brandId, garmentType) {
    const brand = get(brandId);
    const bias = brand.bias || {};
    const z = Object.assign({}, bias.default || {}, bias[garmentType] || {});
    const chest = z.chest != null ? z.chest : (z.waist != null ? z.waist : 0);

    /* One label step is roughly 6–7cm of chest on the standard ladder.
       The ±0.5 boundary matters: at ±0.55 a brand sitting half a size
       small (H&M) rounded to "true to size", which is precisely the
       advice that gets someone the wrong parcel. Half a step off is
       already worth telling people about. */
    const steps = chest / 6.5;
    /* "Most people size up" would be a claim about data we don't have.
       The advice says what to do; `estimate` says how sure we are. */
    let verdict, advice;
    if (steps <= -1.4)     { verdict = 'runs much smaller'; advice = 'Going up two sizes is usually the safer call.'; }
    else if (steps <= -0.5){ verdict = 'runs small';        advice = 'Going up a size is usually the safer call.'; }
    else if (steps < 0.5)  { verdict = 'true to size';      advice = 'Your usual size should hold here.'; }
    else if (steps < 1.4)  { verdict = 'runs large';        advice = 'Going down a size is usually the safer call.'; }
    else                   { verdict = 'runs much larger';  advice = 'Going down two sizes is usually the safer call.'; }

    return {
      brand: brand.id, brandName: brand.name, verdict, advice,
      steps: Math.round(steps * 10) / 10,
      confidence: brand.confidence, volatile: !!brand.volatile, note: brand.note,
      // Only a transcribed chart or our own measured pattern is a fact.
      estimate: brand.confidence !== 'published' && brand.confidence !== 'first-party'
    };
  }

  /* ==========================================================
     compare — "you're usually an M, here take L".

     This is the sentence the whole app exists to produce, so it is
     DERIVED rather than asserted: we run the wearer against the
     standard chart and against the brand chart and report the
     difference. An earlier version read the advice off the brand's
     drift table, which could disagree with the size actually
     recommended a line above it (Zara reads half a size small, so
     the table said "size up" while the engine still returned M).
     Advice that argues with the recommendation next to it destroys
     confidence in both. Deriving it means they cannot diverge.
     ========================================================== */
  /* `opts` is handed straight to FitEngine.analyze (easeBias, and the
     age / estimate confidence penalties). Without it the headline was
     computed without the wearer's own "did it fit?" calibration, so it
     could argue with the size recommended beside it, and the confidence
     shown for a brand quietly ignored stale or estimated measurements. */
  function compare(garmentType, body, fitPref, sex, brandId, opts) {
    if (typeof FitEngine === 'undefined') return null;
    const order = FitEngine.SIZE_ORDER;

    const std = FitEngine.analyze(garmentType, body, fitPref, null, chartFor('generic', garmentType, sex), sex, opts);
    const brandChart = chartFor(brandId, garmentType, sex);
    const bra = FitEngine.analyze(garmentType, body, fitPref, null, brandChart, sex, opts);
    if (!std || !bra) return null;

    const iStd = order.indexOf(std.bestSize);
    const iBra = order.indexOf(bra.bestSize);
    const shift = (iStd > -1 && iBra > -1) ? iBra - iStd : 0;

    const brand = get(brandId);
    /* Every size label reads vowel-initial when spoken as a letter —
       "an S", "an M", "an L", "an XL" — so the article is always "an". */
    const a = s => 'an ' + s;
    let line;
    if (brandId === 'generic') line = `Your size is ${bra.bestSize}.`;
    else if (shift === 0) line = `On a standard chart you're ${a(std.bestSize)} — and at ${brand.name} that's still ${bra.bestSize}.`;
    else {
      const dir = shift > 0 ? 'up' : 'down';
      const n = Math.abs(shift) === 1 ? 'a size' : Math.abs(shift) + ' sizes';
      line = `On a standard chart you're ${a(std.bestSize)} — at ${brand.name} size ${dir} to ${bra.bestSize}.`;
      const known = brand.confidence === 'published' || brand.confidence === 'first-party';
      line += ` ${known ? 'They' : 'By our estimate they'} run ${shift > 0 ? 'small' : 'large'} by about ${n}.`;
    }

    return {
      standardSize: std.bestSize,
      brandSize: bra.bestSize,
      shift: shift,
      line: line,
      result: bra,
      chart: brandChart,
      confidence: temper(bra.confidence, brandId),
      drift: drift(brandId, garmentType)
    };
  }

  /* ==========================================================
     Confidence, expressed honestly.

     The engine's own confidence counts how many body zones we
     could measure. This tempers that with how well we actually
     know the brand — a perfectly measured body against a brand
     that reissues its blocks every season is still a guess, and
     saying so is what keeps the number trustworthy.
     ========================================================== */
  function temper(engineConfidence, brandId) {
    const brand = get(brandId);
    let c = engineConfidence;
    if (brand.confidence === 'first-party') c += 5;
    else if (brand.confidence === 'modelled') c -= 8;
    if (brand.volatile) c -= 12;
    c = Math.max(35, Math.min(99, Math.round(c)));

    let label;
    if (c >= 85) label = 'High';
    else if (c >= 68) label = 'Good';
    else if (c >= 52) label = 'Fair';
    else label = 'Rough';

    let why;
    if (brand.confidence === 'first-party') why = 'We make this one — the pattern is ours.';
    else if (brand.volatile) why = 'This brand varies a lot between items, so treat it as a starting point.';
    else if (brand.confidence === 'modelled') why = 'Modelled from this brand\'s known fit, not a transcribed chart.';
    else why = 'Based on the brand\'s published chart.';

    return { value: c, label, why };
  }

  return { list, popular, get, search, chartFor, compare, drift, temper, BRANDS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Brands;
if (typeof window !== 'undefined') window.Brands = Brands;
