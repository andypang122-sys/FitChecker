'use strict';
/* ============================================================
   StyleProfile — who you shop for, and what you actually wear.

   WHY THIS EXISTS.

   The For You page used to be one list for everybody, and most of
   that list pointed at menswear: a woman who checked a T-shirt was
   sent to the men's T-shirt section. Getting the size right and then
   the shop wrong wastes the one thing FitChecker does well.

   Three answers fix it, each asked once and editable any time:

     1. FEMALE / MALE (or both). Filters the shops to the right side
        of the store and hides dresses and skirts for someone who has
        said they will never look at them. It is kept apart from a
        body profile's sex, which picks the SIZE chart: someone can be
        measured on a men's chart and still shop both sides.

     2. STYLE NICHES, up to three. Streetwear and office wear share no
        shops. Three is the cap on purpose — pick eight and nothing is
        prioritised, which is the same as picking none.

     3. BUDGET, optional. A premium-only list is useless to a student,
        and the reverse is just as useless to someone who wants it.

   Ranking is a plain additive score, so the order can always be
   explained: a style you named first counts most, a budget match
   helps, the garment you just checked helps, and a fit that clashes
   with your fit preference costs a little. The gender filter is not a
   score — a mismatch is never shown at all.

   Accounts keep the profile on the user record next to their other
   prefs; guests keep it on the device. A guest who signs up keeps
   their answers until they change them.
   ============================================================ */

const StyleProfile = (() => {
  const KEY = 'fitcheck_style';
  const MAX_STYLES = 3;

  const GENDERS = [
    { id: 'female', label: 'Female', e: '👩', sub: 'Womenswear cuts, sizes and shops' },
    { id: 'male',   label: 'Male',   e: '👨', sub: 'Menswear cuts, sizes and shops' },
    { id: 'all',    label: 'Show me both', e: '🔀', sub: 'Everything, from both sides of the shop' }
  ];

  const STYLES = [
    { id: 'streetwear',  e: '🧢', label: 'Streetwear',          look: 'Oversized fits, graphic tees, hoodies and sneakers.' },
    { id: 'office',      e: '💼', label: 'Office & business',   look: 'Tailoring, shirts and trousers that hold up in a meeting.' },
    { id: 'smartcasual', e: '🧥', label: 'Smart casual',        look: 'Knitwear, chinos and clean jackets — dressed up, not stiff.' },
    { id: 'minimalist',  e: '⬜', label: 'Scandi minimalist',   look: 'Neutral colours, clean lines, few pieces that all match.' },
    { id: 'oldmoney',    e: '🎩', label: 'Old money',           look: 'Quiet luxury: knit polos, cashmere, pressed trousers, no logos.' },
    { id: 'classic',     e: '⛵', label: 'Classic & preppy',    look: 'Oxford shirts, cable knits, blazers and chinos.' },
    { id: 'athleisure',  e: '🏃', label: 'Athleisure',          look: 'Gym to street: joggers, technical fabrics and trainers.' },
    { id: 'gorpcore',    e: '🏔️', label: 'Gorpcore & outdoor',  look: 'Fleeces, shells and hiking gear worn in town.' },
    { id: 'techwear',    e: '🛰️', label: 'Techwear',            look: 'Black, technical and waterproof, with cargo and straps.' },
    { id: 'vintage',     e: '📻', label: 'Vintage & retro',     look: 'Second-hand finds, 70s–90s cuts and washed denim.' },
    { id: 'y2k',         e: '💿', label: 'Y2K',                 look: 'Low-rise, baby tees and shine — the 2000s, back again.' },
    { id: 'grunge',      e: '🎸', label: 'Grunge & rock',       look: 'Flannel, band tees, ripped denim and boots.' },
    { id: 'boho',        e: '🌼', label: 'Boho',                look: 'Flowing fabrics, prints, earthy tones and layers.' },
    { id: 'romantic',    e: '🎀', label: 'Romantic & feminine', look: 'Soft fabrics, lace, florals and midi lengths.' },
    { id: 'workwear',    e: '🛠️', label: 'Workwear & utility',  look: 'Canvas jackets, carpenter trousers and sturdy basics.' },
    { id: 'skater',      e: '🛹', label: 'Skater',              look: 'Wide jeans, hoodies, caps and canvas shoes.' },
    { id: 'coastal',     e: '🌊', label: 'Coastal & resort',    look: 'Linen, stripes and light colours for warm days.' },
    { id: 'goingout',    e: '🪩', label: 'Going out',           look: 'Party dresses, sharp shirts and night-out pieces.' }
  ];

  const BUDGETS = [
    { id: 'any', label: 'Any budget', sub: 'Show everything' },
    { id: '1',   label: '€',   sub: 'Budget-friendly' },
    { id: '2',   label: '€€',  sub: 'Mid-range' },
    { id: '3',   label: '€€€', sub: 'Premium' }
  ];

  /* Garment types only one side of the shop sells. */
  const FEMALE_ONLY_TYPES = ['dress', 'skirt'];

  const STYLE_BY_ID = {};
  STYLES.forEach(s => { STYLE_BY_ID[s.id] = s; });

  function style(id) { return STYLE_BY_ID[id] || null; }

  function normalise(p) {
    p = p || {};
    const gender = GENDERS.some(g => g.id === p.gender) ? p.gender : null;
    const styles = [...new Set((Array.isArray(p.styles) ? p.styles : []).filter(id => STYLE_BY_ID[id]))].slice(0, MAX_STYLES);
    const budget = BUDGETS.some(b => b.id === String(p.budget)) ? String(p.budget) : 'any';
    return { gender, styles, budget, done: !!(p.done && gender), updatedAt: Number(p.updatedAt) || 0 };
  }

  /* ---------- storage ---------- */
  function readGuest() {
    try { return normalise(JSON.parse(localStorage.getItem(KEY) || 'null')); }
    catch (e) { return normalise(null); }
  }

  function load(auth) {
    const u = auth && auth.user ? auth.user() : null;
    if (!u) return readGuest();
    const mine = normalise(u.prefs && u.prefs.style);
    if (mine.done) return mine;
    // A guest who just signed up keeps what they told us as a guest.
    const guest = readGuest();
    return guest.done ? guest : mine;
  }

  function save(auth, profile) {
    const clean = normalise(Object.assign({}, profile, { updatedAt: Date.now() }));
    const u = auth && auth.user ? auth.user() : null;
    if (u) {
      u.prefs = u.prefs || {};
      u.prefs.style = clean;
      if (auth.save) auth.save();
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (e) { /* private mode — keep going */ }
    }
    return clean;
  }

  /* ---------- matching ---------- */

  /* The side of the shop in play: what they chose, else the body
     profile's sex, else both. */
  function genderFor(profile, fallbackSex) {
    const p = normalise(profile);
    if (p.gender) return p.gender;
    return fallbackSex === 'female' || fallbackSex === 'male' ? fallbackSex : 'all';
  }

  function genderOk(rec, gender) {
    if (!gender || gender === 'all') return true;
    const g = rec && rec.gender;
    return !g || g === 'unisex' || g === gender;
  }

  function typeAllowed(type, gender) {
    return !(gender === 'male' && FEMALE_ONLY_TYPES.indexOf(type) > -1);
  }

  /* Score one catalogue entry, or null when it must not be shown. */
  function score(rec, profile, ctx) {
    ctx = ctx || {};
    const p = normalise(profile);
    const gender = genderFor(p, ctx.sex);
    if (!rec || !genderOk(rec, gender)) return null;
    const types = rec.types || [];
    if (types.length && !types.some(t => typeAllowed(t, gender))) return null;

    let s = 0;
    const matched = [];
    p.styles.forEach((id, i) => {
      if ((rec.styles || []).indexOf(id) > -1) { s += 12 - i * 2; matched.push(id); }
    });
    if (p.budget !== 'any' && rec.tier) {
      const d = Math.abs(Number(rec.tier) - Number(p.budget));
      s += d === 0 ? 4 : d === 1 ? 0 : -5;
    }
    if (ctx.type && types.indexOf(ctx.type) > -1) s += 6;
    if (ctx.fitPref && Array.isArray(rec.fits)) s += rec.fits.indexOf(ctx.fitPref) > -1 ? 2 : -3;
    // Someone who picked a side is better served by that side than by unisex.
    if (gender !== 'all' && rec.gender === gender) s += 1;
    return { rec, score: s, matched };
  }

  /* Everything showable, best first; ties keep catalogue order. */
  function rank(recs, profile, ctx) {
    return (recs || [])
      .map((r, i) => { const x = score(r, profile, ctx); return x ? Object.assign(x, { i }) : null; })
      .filter(Boolean)
      .sort((a, b) => (b.score - a.score) || (a.i - b.i));
  }

  function forStyle(recs, profile, styleId, ctx) {
    return rank(recs, profile, ctx).filter(x => (x.rec.styles || []).indexOf(styleId) > -1);
  }

  function forType(recs, profile, type, ctx) {
    return rank(recs, profile, ctx).filter(x => (x.rec.types || []).indexOf(type) > -1);
  }

  /* The short line shown on a recommendation: why it is here. */
  function reason(entry) {
    if (!entry || !entry.matched || !entry.matched.length) return '';
    return entry.matched.map(id => style(id).label).join(' · ');
  }

  function summary(profile) {
    const p = normalise(profile);
    if (!p.gender) return '';
    const bits = [GENDERS.find(g => g.id === p.gender).label];
    if (p.styles.length) bits.push(p.styles.map(id => style(id).label).join(', '));
    if (p.budget !== 'any') bits.push(BUDGETS.find(b => b.id === p.budget).label);
    return bits.join(' · ');
  }

  /* ---------- catalogue checks ----------
     recs.js is hand-edited. A typo in a style id silently hides a shop
     from everyone who picked that style, so the tests run every entry
     through this. */
  function problems(recs, validTypes) {
    const out = [];
    (recs || []).forEach((r, i) => {
      const at = `#${i} ${r && r.brand ? r.brand : '?'} — ${r && r.name ? r.name : '?'}`;
      if (!r || !r.brand || !r.name) { out.push(at + ': missing brand or name'); return; }
      if (['female', 'male', 'unisex'].indexOf(r.gender) === -1) out.push(at + ': gender must be female, male or unisex');
      if (!Array.isArray(r.styles) || !r.styles.length) out.push(at + ': needs at least one style');
      (r.styles || []).forEach(id => { if (!STYLE_BY_ID[id]) out.push(at + ': unknown style "' + id + '"'); });
      if ([1, 2, 3].indexOf(r.tier) === -1) out.push(at + ': tier must be 1, 2 or 3');
      if (!Array.isArray(r.types) || !r.types.length) out.push(at + ': needs at least one garment type');
      (r.types || []).forEach(t => { if (validTypes && validTypes.indexOf(t) === -1) out.push(at + ': unknown type "' + t + '"'); });
      if (r.gender === 'male' && (r.types || []).some(t => FEMALE_ONLY_TYPES.indexOf(t) > -1)) out.push(at + ': menswear entry lists a dress or skirt');
      if (!/^https:\/\//.test(r.url || '')) out.push(at + ': url must be https');
      if (r.fits && !r.fits.every(f => ['slim', 'regular', 'relaxed'].indexOf(f) > -1)) out.push(at + ': unknown fit');
    });
    return out;
  }

  return {
    KEY, MAX_STYLES, GENDERS, STYLES, BUDGETS, FEMALE_ONLY_TYPES,
    style, normalise, load, save,
    genderFor, genderOk, typeAllowed, score, rank, forStyle, forType, reason, summary, problems
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StyleProfile;
if (typeof window !== 'undefined') window.StyleProfile = StyleProfile;
