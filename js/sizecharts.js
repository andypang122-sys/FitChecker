'use strict';
/* ============================================================
   SizeCharts — get to the retailer's own measurements in one tap.

   Every other number in FitCheck is a model of a brand. The
   retailer's own size guide is the ground truth, and when the return
   risk says "this is a marginal call, go and check the chest
   measurement", the next thing that should happen is not a hunt
   through a footer menu.

   THE DESIGN PROBLEM, stated honestly: deep links into retail sites
   rot. Brands redesign, move their size guides behind a modal, or
   localise the path per country, and a dead link is worse than no
   link because it costs the user a tap and their trust. There is no
   way to keep 25 retailers' URLs permanently correct from inside an
   offline app with no backend.

   So this does not pretend. Each retailer is marked with how the
   link was built:

     'direct'  — a stable, long-lived size-guide URL. Tapped straight.
     'search'  — the site's own search, queried for the size guide.
                 Slightly less direct, but it survives redesigns
                 because search URLs almost never change.

   Anything not confidently 'direct' gets 'search'. That is a
   deliberate trade: one extra tap, in exchange for a link that still
   works in a year. Where nothing is known at all, it falls back to a
   web search scoped to the brand, which always works.

   The second half of the module is the part that makes the link
   worth tapping: WHICH measurement to compare. Opening a size chart
   without knowing what you are looking for is how people end up
   staring at a table of numbers and guessing anyway.
   ============================================================ */

const SizeCharts = (() => {

  const enc = encodeURIComponent;

  /* ---------- retailers ----------
     `site` is the domain used for the search fallback. `guide` is a
     known-stable size-guide path where one exists. Region matters:
     several of these serve different sites per country, and sending a
     UK shopper to a US chart in inches is its own kind of wrong. */
  const SITES = {
    uniqlo:         { name: 'Uniqlo',            site: 'uniqlo.com',            how: 'search' },
    shein:          { name: 'SHEIN',             site: 'shein.com',             how: 'search' },
    muji:           { name: 'MUJI',              site: 'muji.com',              how: 'search' },
    zara:           { name: 'Zara',              site: 'zara.com',              how: 'search' },
    hm:             { name: 'H&M',               site: 'hm.com',                how: 'search' },
    cos:            { name: 'COS',               site: 'cos.com',               how: 'search' },
    arket:          { name: 'ARKET',             site: 'arket.com',             how: 'search' },
    weekday:        { name: 'Weekday',           site: 'weekday.com',           how: 'search' },
    mango:          { name: 'Mango',             site: 'shop.mango.com',        how: 'search' },
    primark:        { name: 'Primark',           site: 'primark.com',           how: 'search' },
    massimo:        { name: 'Massimo Dutti',     site: 'massimodutti.com',      how: 'search' },
    gap:            { name: 'Gap',               site: 'gap.com',               how: 'search' },
    oldnavy:        { name: 'Old Navy',          site: 'oldnavy.gap.com',       how: 'search' },
    ralphlauren:    { name: 'Ralph Lauren',      site: 'ralphlauren.com',       how: 'search' },
    tommy:          { name: 'Tommy Hilfiger',    site: 'tommy.com',             how: 'search' },
    abercrombie:    { name: 'Abercrombie',       site: 'abercrombie.com',       how: 'search' },
    carhartt:       { name: 'Carhartt',          site: 'carhartt.com',          how: 'search' },
    levis:          { name: "Levi's",            site: 'levi.com',              how: 'search' },
    nike:           { name: 'Nike',              site: 'nike.com',              how: 'search' },
    adidas:         { name: 'adidas',            site: 'adidas.com',            how: 'search' },
    lululemon:      { name: 'lululemon',         site: 'lululemon.com',         how: 'search' },
    northface:      { name: 'The North Face',    site: 'thenorthface.com',      how: 'search' },
    patagonia:      { name: 'Patagonia',         site: 'patagonia.com',         how: 'search' },
    asos:           { name: 'ASOS',              site: 'asos.com',              how: 'search' },
    boohoo:         { name: 'boohoo',            site: 'boohoo.com',            how: 'search' },
    urbanoutfitters:{ name: 'Urban Outfitters',  site: 'urbanoutfitters.com',   how: 'search' },
    trissan:        { name: 'Trissan',           site: '',                      how: 'own' }
  };

  /* Words that get you to a size guide on almost any retail site. */
  const QUERY = 'size guide';

  function linkFor(brandId, garmentType) {
    const s = SITES[brandId];
    const gLabel = garmentLabel(garmentType);

    /* Our own label — the chart is in the app, so do not send anyone
       to a website to read something we already know exactly. */
    if (s && s.how === 'own') {
      return { kind: 'own', label: 'Trissan measurements', url: '',
        note: 'This is our own pattern, so the numbers in FitCheck are the numbers on the garment. Nothing to look up.' };
    }

    if (!s) {
      /* Unknown or generic brand: a scoped web search still lands
         people in the right place, and is honest about what it is. */
      return {
        kind: 'web',
        label: 'Search the web for a size guide',
        url: 'https://duckduckgo.com/?q=' + enc((brandId && brandId !== 'generic' ? brandId + ' ' : '') + gLabel + ' ' + QUERY),
        note: 'No specific retailer to link to, so this searches the web.'
      };
    }

    if (s.how === 'direct' && s.guide) {
      return { kind: 'direct', label: s.name + ' size guide', url: s.guide,
        note: 'Straight to ' + s.name + "'s own measurements." };
    }

    /* The default, and the honest one. A site-scoped search survives
       redesigns in a way a hard-coded path does not. */
    return {
      kind: 'search',
      label: 'Find ' + s.name + "'s size guide",
      url: 'https://duckduckgo.com/?q=' + enc('site:' + s.site + ' ' + gLabel + ' ' + QUERY),
      note: 'Searches ' + s.site + ' directly. Retailers move their size guides often, so this is more reliable than a fixed link.'
    };
  }

  function garmentLabel(t) {
    const map = {
      tshirt: 't-shirt', shirt: 'shirt', hoodie: 'hoodie', jacket: 'jacket',
      dress: 'dress', jeans: 'jeans', shorts: 'shorts', skirt: 'skirt', inseam: 'trousers'
    };
    return map[t] || '';
  }

  /* ============================================================
     WHAT TO COMPARE

     The reason for opening a size chart. Two things people
     consistently get wrong and that decide whether the garment fits:

     1. Retailers publish two different kinds of table — BODY
        measurements ("this size fits a 96cm chest") and GARMENT
        measurements ("this garment measures 104cm flat"). Comparing
        your body to a garment measurement, or vice versa, is a
        guaranteed mistake of several centimetres. Almost nobody knows
        these are different tables.

     2. Which single number actually decides it, which depends on the
        garment and on where your own fit is tightest.
     ============================================================ */

  /* Ordered by how often the zone is the deciding one for that
     garment, not alphabetically. */
  const DECIDER = {
    tshirt: ['chest', 'shoulders', 'torsoLength'],
    shirt:  ['chest', 'shoulders', 'sleeveLength'],
    hoodie: ['chest', 'shoulders'],
    jacket: ['chest', 'shoulders', 'sleeveLength'],
    dress:  ['chest', 'waist', 'hips'],
    jeans:  ['waist', 'hips', 'inseam'],
    shorts: ['waist', 'hips'],
    skirt:  ['waist', 'hips'],
    inseam: ['waist', 'inseam']
  };

  const ZONE_WORD = {
    chest: 'chest', waist: 'waist', hips: 'hips', shoulders: 'shoulder width',
    sleeveLength: 'sleeve length', torsoLength: 'body length', inseam: 'inside leg'
  };

  /* How the garment's flat measurement relates to a body measurement.
     Girth measurements are usually published as half the circumference
     when measured flat — the classic "the chart says 52cm, that cannot
     be right" confusion. Saying so is the whole value here. */
  const FLAT_HALVED = ['chest', 'waist', 'hips'];

  function whatToCheck(garmentType, result, body) {
    const order = DECIDER[garmentType] || ['chest', 'waist'];

    /* If the fit analysis already knows which zone is the problem,
       that is the one to check — it beats any general rule. */
    let pick = order[0];
    if (result && result.zones) {
      let worst = null;
      order.forEach(k => {
        const z = result.zones[k];
        if (z && z.score != null && (!worst || z.score < worst.score)) { worst = z; pick = k; }
      });
    }

    const word = ZONE_WORD[pick] || pick;
    const yours = body && body[pick] != null ? body[pick] : null;
    const halved = FLAT_HALVED.indexOf(pick) > -1;

    return {
      zone: pick,
      word,
      yours,
      steps: [
        yours != null
          ? `Your ${word} is ${yours} cm.`
          : `Find your ${word} — it is the measurement that decides this garment.`,
        `On the chart, check whether it lists BODY measurements or GARMENT measurements. They are different tables and the difference is several centimetres.`,
        halved
          ? `If it is a garment measurement taken flat, it will be about half your ${word} — a 52 cm "chest" on a flat-laid chart means a 104 cm garment.`
          : `Garment ${word} is usually listed as-is rather than halved.`,
        `Compare against ${yours != null ? yours + ' cm' : 'your number'} and pick the size that clears it with a little room, not the one that exactly equals it.`
      ],
      /* The single sentence version, for when there is no space. */
      short: yours != null
        ? `Check the ${word} measurement against your ${yours} cm.`
        : `Check the ${word} measurement.`
    };
  }

  function known(brandId) { return !!SITES[brandId]; }
  function list() { return Object.keys(SITES).map(id => ({ id, name: SITES[id].name })); }

  return { SITES, DECIDER, ZONE_WORD, linkFor, whatToCheck, garmentLabel, known, list };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SizeCharts;
if (typeof window !== 'undefined') window.SizeCharts = SizeCharts;
