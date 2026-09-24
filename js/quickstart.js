'use strict';
/* ============================================================
   QuickStart — body measurements from a size you already wear.

   Four tape measurements is where most people give up: almost
   nobody knows their chest in centimetres, and a tape is the one
   thing in the flat nobody can find. Almost everybody does know
   "I'm an M at H&M".

   That sentence is a measurement. A brand's M is cut for one body,
   so someone who wears it is, to a first approximation, that body.
   We take the centre of the size they named, through that brand's
   own chart (so "M at Uniqlo" and "M at Zara" land on different
   bodies), and use it as a starting point:

     chest          ← the brand's top chart for that size
     waist, hips    ← the brand's trouser chart for that size

   What this is NOT: a measurement. Anyone at the top or bottom of
   their size band is up to half a size off, and the brand offsets
   are modelled. So the result is flagged as an estimate, the fit
   engine takes points off its confidence, and the verdict says a
   tape would sharpen it. Where it earns its keep is across brands:
   "M at H&M" → the right size at Uniqlo, without a tape.

   Public API:
     QuickStart.estimate({ sex, size, brandId, heightCm })
       → { height, chest, waist, hips } in cm, or null
     QuickStart.PENALTY  confidence points an estimate costs
   ============================================================ */

const QuickStart = (() => {

  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  // Confidence cost of each estimate source. A size you wear is a
  // half-size-wide band, so it costs more than a photo read that at
  // least looked at this body.
  const PENALTY = { size: 20, scan: 15 };

  function chart(brandId, garmentType, sex) {
    const B = (typeof Brands !== 'undefined') ? Brands : null;
    const F = (typeof FitEngine !== 'undefined') ? FitEngine : null;
    if (B) { const c = B.chartFor(brandId || 'generic', garmentType, sex); if (c) return c; }
    return F ? F.chartFor(garmentType, sex) : null;
  }

  function estimate(o) {
    const opts = o || {};
    const sex = opts.sex === 'female' ? 'female' : (opts.sex === 'male' ? 'male' : null);
    if (!sex || SIZES.indexOf(opts.size) < 0) return null;

    const top = chart(opts.brandId, 'tshirt', sex);
    const bottom = chart(opts.brandId, 'jeans', sex);
    const t = top && top.sizes && top.sizes[opts.size];
    const b = bottom && bottom.sizes && bottom.sizes[opts.size];
    if (!t || !b || t.chest == null || b.hips == null) return null;

    const h = Number(opts.heightCm);
    return {
      height: h > 0 ? h : null,
      chest: Math.round(t.chest),
      // Trousers are sold by the waist, so their chart is the better
      // witness for it than a tee's.
      waist: Math.round(b.waist != null ? b.waist : t.waist),
      hips: Math.round(b.hips)
    };
  }

  return { estimate, SIZES, PENALTY };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QuickStart;
if (typeof window !== 'undefined') window.QuickStart = QuickStart;
