'use strict';
/* ============================================================
   RESALE — will this second-hand listing fit me?

   WHY THIS EXISTS. Every other screen in this app answers "what
   size am I at this brand", because on the high street you are
   choosing between sizes that all exist. Second-hand is the
   opposite problem: there is exactly ONE garment, in ONE size,
   usually from a brand whose sizing changed a decade ago, and
   usually with no returns. The question is not "which size" but
   "will THIS one fit me" — and getting it wrong costs the whole
   purchase, not a trip to the post office.

   It is also the one place sellers hand you the answer. Vinted,
   Depop, eBay and Grailed listings are full of lines like:

       Pit to pit: 54cm
       Length 71 cm
       Waist 40cm flat, inseam 32"

   Those are FLAT measurements of the garment lying on a table —
   half a circumference. Doubling them gives the garment's real
   girth, which is exactly the shape fit-engine already consumes
   as a `measurements: 'garment'` chart (see server.py's
   normalise_units, which does the same job for scraped tables).

   So this module is a text parser, not a new fit model:
     text → { zone: cm } → a one-size chart → FitEngine.analyze

   HONEST LIMITS, because they matter for a no-returns purchase:
     • Sellers measure badly and inconsistently. We surface every
       number we found so it can be corrected before it is trusted.
     • "Chest 54" is ambiguous — flat or girth? Resolved by
       magnitude, which is right almost always and wrong for
       children's sizes and very large garments.
     • A listing with no measurements gets no verdict. Guessing
       from a size label alone is what we are trying to replace.
   ============================================================ */

const Resale = (() => {

  /* Zone vocabulary. Order matters — the first pattern that matches a
     label wins, so the specific ones ("inside leg") must precede the
     generic ones ("leg"). Mirrors server.py's ZONE_PATTERNS and adds the
     flat-lay phrasings that only ever appear in resale listings. */
  const ZONE_PATTERNS = [
    ['chest',        /\b(pit[\s-]*(to)?[\s-]*pit|p2p|ptp|armpit[\s-]*to[\s-]*armpit|chest|bust)\b/],
    ['sleeveLength', /\b(sleeve(\s*length)?|arm\s*length)\b/],
    ['inseam',       /\b(inseam|inside\s*leg|inner\s*leg|leg\s*length)\b/],
    ['waist',        /\bwaist\b/],
    ['hips',         /\b(hips?|seat)\b/],
    ['shoulders',    /\b(shoulders?|shoulder\s*(to\s*shoulder|seam|width))\b/],
    ['thigh',        /\bthigh\b/],
    ['torsoLength',  /\b(length|back\s*length|body\s*length|front\s*length|total\s*length)\b/]
  ];

  // Zones a seller measures flat across the garment (half the girth).
  const GIRTH_ZONES = ['chest', 'waist', 'hips', 'thigh'];

  /* Above this, a girth figure is already a full circumference; below it,
     it is a flat measurement that needs doubling. 68cm is the same
     threshold server.py uses, and it sits comfortably between the widest
     plausible flat measurement and the smallest plausible adult girth. */
  const FLAT_CEILING_CM = 68;

  // Plausible cm ranges — anything outside is a typo or a misread unit.
  const SANE_CM = {
    chest: [40, 200], waist: [35, 200], hips: [40, 200], thigh: [20, 110],
    shoulders: [25, 80], sleeveLength: [10, 100], torsoLength: [25, 150], inseam: [15, 110]
  };

  const isGirth = z => GIRTH_ZONES.indexOf(z) !== -1;

  function zoneFor(label) {
    const t = String(label || '').toLowerCase();
    for (const [zone, re] of ZONE_PATTERNS) if (re.test(t)) return zone;
    return null;
  }

  /* One "label: number unit" reading. The unit may be attached to the
     number ( 54cm ), separated ( 54 cm ), a quote mark ( 21" ), or absent
     — in which case the caller decides from the listing as a whole. */
  const READING_RE = new RegExp(
    '([a-z][a-z0-9\\s\\-/()\\.]{1,28}?)'  +  // label
    '\\s*[:=\\u2013\\u2014-]?\\s*'        +  // optional separator
    '(\\d{1,3}(?:[.,]\\d)?)'              +  // number
    '\\s*(cm|centimet(?:er|re)s?|mm|in\\b|ins\\b|inch(?:es)?|"|”)?',
    'gi');

  function toCm(value, unit) {
    if (!unit) return null;                       // caller resolves
    const u = unit.toLowerCase();
    if (u === 'mm') return value / 10;
    if (u.startsWith('cm') || u.startsWith('centimet')) return value;
    return value * 2.54;                          // in / inch / " / ”
  }

  /* Whole-listing unit hint, for readings that carry no unit of their own.
     Sellers usually state it once ("all measurements in cm") and then give
     bare numbers. */
  function listingUnit(text) {
    const t = text.toLowerCase();
    // "54cm" has no word boundary before the unit, so a plain \bcm\b misses
    // the most common way sellers write it.
    const cm = (t.match(/\d\s*cm\b|\bcm\b|centimet/g) || []).length;
    // A bare "in" is usually the preposition, so it only counts attached to
    // a number; "inch"/"inches" and a quote mark are unambiguous on their own.
    const inch = (t.match(/\d\s*(?:ins?|inch(?:es)?)\b|\binch(?:es)?\b|["”]/g) || []).length;
    if (cm > inch) return 'cm';
    if (inch > cm) return 'in';
    return null;
  }

  function inRange(zone, cm) {
    const r = SANE_CM[zone];
    return !r || (cm >= r[0] && cm <= r[1]);
  }

  /* Parse a pasted listing description.
     Returns { measurements: {zone: {cm, flat, raw, unit}}, unit, warnings } */
  function parse(text) {
    const src = String(text || '');
    const warnings = [];
    const found = {};
    const hintUnit = listingUnit(src);

    // Newlines are the strongest separator in a listing; treating the whole
    // blob as one string lets a label on one line capture a number on the
    // next, which is how "Measurements:\nChest 54\nLength 71" goes wrong.
    const lines = src.split(/[\n\r;•·|]+/);

    for (const line of lines) {
      READING_RE.lastIndex = 0;
      let m;
      while ((m = READING_RE.exec(line)) !== null) {
        const zone = zoneFor(m[1]);
        if (!zone) continue;
        const value = parseFloat(String(m[2]).replace(',', '.'));
        if (!isFinite(value) || value <= 0) continue;

        const explicitUnit = m[3] || null;
        let cm = toCm(value, explicitUnit);
        let unit = explicitUnit;
        if (cm == null) {
          // No unit on this reading — fall back to the listing's own hint,
          // then to magnitude (a 21 is inches; a 54 is centimetres).
          unit = hintUnit || (value < 40 ? 'in' : 'cm');
          cm = unit === 'in' ? value * 2.54 : value;
        }

        // A flat girth is half the garment. Double it, but only when the
        // seller has not already given a full circumference.
        let flat = false;
        if (isGirth(zone) && cm < FLAT_CEILING_CM) { cm *= 2; flat = true; }

        cm = Math.round(cm * 10) / 10;
        if (!inRange(zone, cm)) continue;

        // First reading of a zone wins: sellers repeat themselves, and the
        // measurements block is usually stated before any prose aside.
        if (!(zone in found)) {
          found[zone] = { cm, flat, raw: value, unit: unit };
        }
      }
    }

    if (!Object.keys(found).length) warnings.push('nothing-found');
    if (!hintUnit && Object.keys(found).length) warnings.push('unit-guessed');

    return { measurements: found, unit: hintUnit, warnings };
  }

  /* Turn parsed measurements into the one-size chart fit-engine consumes.
     `measurements: 'garment'` is the important flag — these are the
     garment's own dimensions with the maker's ease already in them, not a
     body chart, so the engine must not add ease on top. */
  const LISTING_SIZE = 'This item';

  function toChart(measurements, opts) {
    const zones = Object.keys(measurements || {});
    if (!zones.length) return null;
    opts = opts || {};
    const sizes = {};
    sizes[LISTING_SIZE] = {};
    for (const z of zones) sizes[LISTING_SIZE][z] = measurements[z].cm;

    return {
      brand: opts.brand || null,
      source: opts.source || null,
      zones: zones,
      sizes: sizes,
      sizeOrder: [LISTING_SIZE],
      measurements: 'garment'
    };
  }

  /* The engine's verdict lines are written for "which size should I buy",
     so they all begin "Size M …". Here there is one garment and the
     question is yes or no, which needs its own voice. */
  const VERDICT = [
    [92, 'This one is cut for you — buy it.'],
    [82, 'This will fit you well.'],
    [70, 'This should fit, with minor compromises.'],
    [55, 'Marginal. Wearable, but not what you would call a good fit.'],
    [0,  'This will not fit you properly. With no returns, walk away.']
  ];

  function verdictFor(score) {
    for (const [floor, line] of VERDICT) if (score >= floor) return line;
    return VERDICT[VERDICT.length - 1][1];
  }

  /* The whole job in one call: listing text + body → verdict, or a reason
     there isn't one. */
  function check(text, garmentType, body, fitPref, sex, opts) {
    const parsed = parse(text);
    const zones = Object.keys(parsed.measurements);
    if (!zones.length) {
      return { ok: false, reason: 'nothing-found', parsed };
    }

    // Built directly rather than through FitEngine.buildCustomChart, which
    // requires a ladder of at least two sizes. A listing is one garment.
    const single = toChart(parsed.measurements, opts);
    const engineChart = {
      label: (opts && opts.brand) ? opts.brand + ' listing' : 'This listing',
      brand: (opts && opts.brand) || null,
      source: (opts && opts.source) || null,
      zones: single.zones,
      sizes: single.sizes,
      sizeOrder: [LISTING_SIZE],
      bodyChart: false,     // garment measurements: ease is already in them
      custom: true
    };

    const result = FitEngine.analyze(
      garmentType, body, fitPref, LISTING_SIZE, engineChart, sex, opts);
    if (!result) return { ok: false, reason: 'no-engine', parsed };

    result.verdict = verdictFor(result.score);

    /* Confidence must reflect how much of the GARMENT the seller measured,
       not how much of their own list we managed to read. Judging a jacket
       on a single pit-to-pit is a guess, and scoring that 100% because we
       parsed 1 of the 1 numbers offered would be the most dishonest number
       in the app. Measured against the zones this garment type actually
       has, the same formula the engine uses. */
    const baseChart = FitEngine.chartFor(garmentType, sex);
    if (baseChart && baseChart.zones.length) {
      const covered = baseChart.zones.filter(z => zones.indexOf(z) !== -1).length;
      result.confidence = Math.round(10 + 90 * (covered / baseChart.zones.length));
      result.missingZones = baseChart.zones.filter(z => zones.indexOf(z) === -1);
    }

    return { ok: true, parsed, result, chart: engineChart, zonesFound: zones };
  }

  return { parse, toChart, check, zoneFor, listingUnit, verdictFor,
           LISTING_SIZE, GIRTH_ZONES, FLAT_CEILING_CM, SANE_CM };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Resale;
if (typeof window !== 'undefined') window.Resale = Resale;
