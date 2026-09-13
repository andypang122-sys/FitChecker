'use strict';
/* ============================================================
   BuyGuide — what to actually buy, for the way you dress.

   For You answers "where should I shop". This answers the question
   before it: "what should I own?" A streetwear wardrobe runs on a
   heavyweight tee, a relaxed hoodie and wide trousers; an office
   wardrobe on a suit, crisp shirts and a merino knit. Knowing the
   pieces is what makes a shop link useful.

   Each style lists its core pieces, per side of the shop where the
   pieces differ, with one line on why each one earns its place.

   WHY SEARCH LINKS, NOT PRODUCT LINKS.
   Product pages rotate every season; a link to a sold-out item is a
   dead end and earns nothing. A shop's own search for "linen shirt"
   stays useful for years. Every search format below was checked
   against the live site (a real search page, and a bogus path that
   correctly returns 404). Junkyard has no linkable search, so it
   links to its men's or women's section instead.

   Every link goes through Affiliate.link in the app, so the guide
   earns exactly like the rest of For You once networks are set up.

   Gender values match style-profile.js: 'female', 'male', 'unisex'.
   Types match the fit engine, or null for things it does not size
   (trainers), so the app can show "your size" where it knows it.
   ============================================================ */

const BuyGuide = (() => {
  const enc = encodeURIComponent;

  /* tier: 1 budget, 2 mid-range, 3 premium — used to put the shop
     nearest someone's budget first. */
  const SHOPS = {
    uniqlo:      { brand: 'Uniqlo',        tier: 1, search: q => 'https://www.uniqlo.com/se/en/search?q=' + enc(q) },
    boozt:       { brand: 'Boozt',         tier: 2, search: q => 'https://www.boozt.com/se/en/search/result?q=' + enc(q) },
    mango:       { brand: 'Mango',         tier: 2, search: (q, g) => 'https://shop.mango.com/se/en/search/' + (g === 'male' ? 'men' : 'women') + '?q=' + enc(q) },
    massimo:     { brand: 'Massimo Dutti', tier: 2, search: q => 'https://www.massimodutti.com/se/search?q=' + enc(q) },
    gant:        { brand: 'GANT',          tier: 2, search: q => 'https://www.gant.se/search?q=' + enc(q) },
    carhartt:    { brand: 'Carhartt WIP',  tier: 2, search: q => 'https://www.carhartt-wip.com/en-gb/search?q=' + enc(q) },
    nike:        { brand: 'Nike',          tier: 2, search: q => 'https://www.nike.com/w?q=' + enc(q) },
    gymshark:    { brand: 'Gymshark',      tier: 2, search: q => 'https://eu.gymshark.com/search?q=' + enc(q) },
    junkyard:    { brand: 'Junkyard',      tier: 2, page: g => 'https://junkyard.com/en/' + (g === 'male' ? 'men' : 'women') + '/' },
    suitsupply:  { brand: 'Suitsupply',    tier: 3, search: q => 'https://suitsupply.com/en-se/search?q=' + enc(q) },
    arcteryx:    { brand: "Arc'teryx",     tier: 3, search: q => 'https://arcteryx.com/se/en/search?q=' + enc(q) },
    fjallraven:  { brand: 'Fjällräven',    tier: 3, search: q => 'https://www.fjallraven.com/eu/en-gb/search/?q=' + enc(q) },
    reformation: { brand: 'Reformation',   tier: 3, search: q => 'https://www.thereformation.com/search?q=' + enc(q) },
    stussy:      { brand: 'Stüssy',        tier: 3, search: q => 'https://www.stussy.com/search?q=' + enc(q) },
    lululemon:   { brand: 'lululemon',     tier: 3, search: q => 'https://eu.lululemon.com/en-se/search?q=' + enc(q) },
    vinted:      { brand: 'Vinted',        tier: 1, search: q => 'https://www.vinted.se/catalog?search_text=' + enc(q), secondHand: true },
    beyondretro: { brand: 'Beyond Retro',  tier: 1, search: q => 'https://www.beyondretro.com/search?q=' + enc(q), secondHand: true }
  };

  const U = 'unisex', F = 'female', M = 'male';
  const item = (id, gender, type, name, why, shops) => ({ id, gender, type, name, why, shops });

  const GUIDE = {
    /* Shown when someone has not picked a style: the pieces nearly
       every wardrobe is built on. */
    essentials: [
      item('ess-tee', U, 'tshirt', 'A plain white tee', 'Goes under everything and with everything. Buy two.', [['uniqlo', 'crew neck t-shirt'], ['boozt', 'white t-shirt']]),
      item('ess-jeans', U, 'jeans', 'Straight dark jeans', 'Dark denim dresses up or down and hides wear longest.', [['boozt', "levi's straight jeans"], ['uniqlo', 'straight jeans']]),
      item('ess-knit', U, 'hoodie', 'A crew-neck knit', 'Merino or cotton — the layer that makes a tee look finished.', [['uniqlo', 'merino sweater'], ['massimo', 'crew neck sweater']]),
      item('ess-jacket', U, 'jacket', 'A light jacket', 'A plain blouson or overshirt covers three seasons.', [['uniqlo', 'blouson'], ['boozt', 'lightweight jacket']]),
      item('ess-oxford', M, 'shirt', 'An oxford shirt', 'Smart enough for dinner, relaxed enough for a weekend.', [['gant', 'oxford shirt'], ['uniqlo', 'oxford shirt']]),
      item('ess-midi', F, 'dress', 'A simple midi dress', 'One dress that works with trainers or heels.', [['mango', 'midi dress'], ['boozt', 'midi dress']])
    ],

    streetwear: [
      item('st-tee', U, 'tshirt', 'Heavyweight boxy tee', 'The base of every streetwear fit. Heavier cotton hangs straighter and survives the wash.', [['carhartt', 'pocket t-shirt'], ['uniqlo', 'oversized t-shirt'], ['stussy', 'tee']]),
      item('st-hoodie', U, 'hoodie', 'Relaxed hoodie', 'Dropped shoulders and a thick knit — the silhouette does the work.', [['carhartt', 'hooded sweat'], ['nike', 'hoodie'], ['junkyard', '']]),
      item('st-baggy-m', M, 'jeans', 'Baggy jeans or cargo trousers', 'Wide through the leg so they stack on your trainers.', [['carhartt', 'cargo pant'], ['boozt', 'baggy jeans'], ['junkyard', '']]),
      item('st-baggy-f', F, 'jeans', 'Wide-leg or baggy jeans', 'A full leg balances a boxy top and a chunky shoe.', [['boozt', 'wide leg jeans'], ['mango', 'wideleg jeans'], ['junkyard', '']]),
      item('st-jacket', U, 'jacket', 'Coach or varsity jacket', 'The outer layer that makes a hoodie look like an outfit.', [['carhartt', 'jacket'], ['stussy', 'jacket']]),
      item('st-kicks', U, null, 'Retro trainers', 'A low-top classic grounds the whole look.', [['nike', 'dunk low'], ['boozt', 'retro sneakers']])
    ],

    office: [
      item('of-suit', M, 'jacket', 'Navy or charcoal suit', 'Covers every formal day there is; wear the jacket alone with chinos too.', [['suitsupply', 'suit'], ['massimo', 'suit']]),
      item('of-shirt-m', M, 'shirt', 'White and light-blue shirts', 'Rotate two of each and the week is dressed.', [['suitsupply', 'shirt'], ['uniqlo', 'easy care shirt']]),
      item('of-knit-m', M, 'hoodie', 'Merino crew-neck knit', 'Over a shirt it replaces the jacket on quieter days.', [['uniqlo', 'extra fine merino'], ['massimo', 'merino sweater']]),
      item('of-trouser-m', M, 'jeans', 'Tailored wool trousers', 'Grey goes with every jacket you will ever own.', [['suitsupply', 'trousers'], ['uniqlo', 'smart ankle pants']]),
      item('of-blazer-f', F, 'jacket', 'Tailored blazer', 'Turns jeans into office wear and a dress into a meeting outfit.', [['mango', 'blazer'], ['massimo', 'blazer']]),
      item('of-trouser-f', F, 'jeans', 'Straight or wide tailored trousers', 'A high waist and a long leg look sharp with flats or heels.', [['mango', 'tailored trousers'], ['massimo', 'trousers']]),
      item('of-blouse-f', F, 'shirt', 'Poplin or satin blouse', 'Crisp poplin reads formal; satin carries into the evening.', [['mango', 'blouse'], ['massimo', 'blouse']]),
      item('of-skirt-f', F, 'skirt', 'Midi pencil or A-line skirt', 'Hits below the knee — polished without trying.', [['mango', 'midi skirt'], ['boozt', 'midi skirt']])
    ],

    smartcasual: [
      item('sc-knit', U, 'hoodie', 'Fine merino or cotton knit', 'The piece that makes smart casual look deliberate.', [['uniqlo', 'merino sweater'], ['massimo', 'knit sweater']]),
      item('sc-oxford', U, 'shirt', 'Oxford shirt', 'Worn open over a tee or buttoned under a knit.', [['gant', 'oxford shirt'], ['uniqlo', 'oxford shirt']]),
      item('sc-chino-m', M, 'jeans', 'Chinos in stone or navy', 'Sharper than jeans, easier than suit trousers.', [['gant', 'chinos'], ['uniqlo', 'chino']]),
      item('sc-trouser-f', F, 'jeans', 'Straight-leg trousers or dark jeans', 'Clean lines that go with a knit or a blazer.', [['mango', 'straight trousers'], ['boozt', 'straight jeans']]),
      item('sc-overshirt', U, 'jacket', 'Overshirt', 'A shirt-weight jacket for when a blazer is too much.', [['massimo', 'overshirt'], ['carhartt', 'shirt jac']])
    ],

    minimalist: [
      item('mi-tee', U, 'tshirt', 'Premium plain tee — white, black, grey', 'Three of these are most of a minimalist wardrobe.', [['uniqlo', 'supima cotton t-shirt'], ['boozt', 'filippa k t-shirt']]),
      item('mi-coat', U, 'jacket', 'Wool coat in camel, navy or charcoal', 'One good coat does more than five cheap jackets.', [['massimo', 'wool coat'], ['boozt', 'wool coat']]),
      item('mi-knit', U, 'hoodie', 'Fine-gauge knit', 'Thin enough to layer, plain enough to match everything.', [['uniqlo', 'cashmere sweater'], ['boozt', 'merino knit']]),
      item('mi-trouser-f', F, 'jeans', 'Straight or barrel-leg trousers in a neutral', 'Ecru, grey or black — the shape is the statement.', [['mango', 'straight trousers'], ['boozt', 'trousers']]),
      item('mi-trouser-m', M, 'jeans', 'Relaxed trousers in a neutral', 'A roomy, clean leg reads modern and stays comfortable.', [['uniqlo', 'wide trousers'], ['boozt', 'relaxed trousers']]),
      item('mi-trainers', U, null, 'Clean white trainers', 'The only shoe a neutral outfit really needs.', [['boozt', 'white leather sneakers']])
    ],

    oldmoney: [
      item('om-cashmere', U, 'hoodie', 'Cashmere or merino crew-neck', 'Quiet, soft, no logo — the heart of the look.', [['massimo', 'cashmere sweater'], ['uniqlo', 'cashmere crew neck']]),
      item('om-polo', M, 'tshirt', 'Knitted polo shirt', 'A knit collar is smarter than any cotton polo.', [['massimo', 'knit polo'], ['boozt', 'knitted polo']]),
      item('om-shirt', U, 'shirt', 'Oxford or poplin shirt', 'Pressed, pale and plain.', [['gant', 'oxford shirt'], ['massimo', 'poplin shirt']]),
      item('om-trouser-f', F, 'jeans', 'Pleated wide trousers', 'High-waisted pleats in cream or grey do most of the work.', [['mango', 'pleated trousers'], ['massimo', 'pleated trousers']]),
      item('om-blazer', U, 'jacket', 'Navy blazer', 'Gold or horn buttons, worn with anything from jeans to flannels.', [['suitsupply', 'blazer'], ['massimo', 'blazer']])
    ],

    classic: [
      item('cl-oxford', U, 'shirt', 'Button-down oxford shirt', 'The preppy uniform starts here.', [['gant', 'oxford shirt'], ['uniqlo', 'oxford shirt']]),
      item('cl-cable', U, 'hoodie', 'Cable-knit sweater', 'Over the shoulders or on — either way it says classic.', [['gant', 'cable knit'], ['boozt', 'cable knit sweater']]),
      item('cl-polo', U, 'tshirt', 'Piqué polo', 'The weekend version of the oxford.', [['gant', 'polo'], ['boozt', 'lacoste polo']]),
      item('cl-chino-m', M, 'jeans', 'Chinos', 'Stone, navy or olive — pick two.', [['gant', 'chinos'], ['uniqlo', 'chino']]),
      item('cl-skirt-f', F, 'skirt', 'Pleated or A-line skirt', 'Knee or midi length, with a knit or an oxford.', [['gant', 'skirt'], ['mango', 'pleated skirt']])
    ],

    athleisure: [
      item('at-fleece', U, 'hoodie', 'Tech fleece or zip hoodie', 'Smart enough for a coffee, warm enough for a run.', [['nike', 'tech fleece'], ['gymshark', 'zip hoodie']]),
      item('at-jogger', U, 'jeans', 'Tapered joggers', 'A slim ankle keeps them looking intentional.', [['nike', 'joggers'], ['gymshark', 'joggers']]),
      item('at-leggings', F, 'jeans', 'High-rise leggings', 'Squat-proof fabric that holds shape all day.', [['lululemon', 'align leggings'], ['gymshark', 'leggings']]),
      item('at-shorts', M, 'shorts', 'Training shorts', 'A lined short with a zip pocket covers gym and running.', [['gymshark', 'shorts'], ['nike', 'training shorts']]),
      item('at-jacket', U, 'jacket', 'Light running jacket', 'Packable and wind-proof — the layer you actually keep on.', [['nike', 'running jacket'], ['boozt', 'running jacket']])
    ],

    gorpcore: [
      item('go-fleece', U, 'hoodie', 'Half- or full-zip fleece', 'The instantly recognisable gorpcore layer.', [['fjallraven', 'fleece'], ['boozt', 'the north face fleece']]),
      item('go-shell', U, 'jacket', 'Waterproof shell jacket', 'Worth buying properly — a good shell lasts a decade.', [['arcteryx', 'beta jacket'], ['fjallraven', 'rain jacket']]),
      item('go-trouser', U, 'jeans', 'Trekking trousers', 'Tough fabric and knee room; they look right in town too.', [['fjallraven', 'vidda trousers'], ['arcteryx', 'hiking pants']]),
      item('go-puffer', U, 'jacket', 'Down or synthetic puffer', 'The winter half of the uniform.', [['boozt', 'the north face nuptse'], ['arcteryx', 'down jacket']])
    ],

    techwear: [
      item('te-shell', U, 'jacket', 'Black waterproof shell', 'Taped seams and a clean black finish define the look.', [['arcteryx', 'shell jacket'], ['nike', 'acg jacket']]),
      item('te-cargo', U, 'jeans', 'Technical cargo trousers', 'Real pockets and a tapered, articulated leg.', [['nike', 'acg cargo'], ['carhartt', 'cargo pant']]),
      item('te-mid', U, 'hoodie', 'Technical fleece or hoodie', 'Performance fabric under the shell.', [['nike', 'acg fleece'], ['arcteryx', 'fleece']])
    ],

    vintage: [
      item('vi-501', U, 'jeans', "Levi's 501 or vintage straight denim", 'The jean every other jean copied. Check second-hand first.', [['vinted', "levi's 501"], ['boozt', "levi's 501"]]),
      item('vi-tee', U, 'tshirt', 'Washed graphic tee', 'Real fading beats a printed-on vintage look.', [['beyondretro', 't-shirt'], ['vinted', 'vintage t-shirt']]),
      item('vi-trucker', U, 'jacket', 'Denim trucker jacket', 'Gets better every year you wear it.', [['beyondretro', 'denim jacket'], ['boozt', 'denim jacket']]),
      item('vi-knit', U, 'hoodie', 'Second-hand knit or cardigan', 'Old wool is often better made than new.', [['vinted', 'vintage cardigan'], ['beyondretro', 'jumper']])
    ],

    y2k: [
      item('yk-babytee', F, 'tshirt', 'Baby tee', 'Short, fitted and a little ironic.', [['boozt', 'baby tee'], ['vinted', 'baby tee']]),
      item('yk-lowrise', F, 'jeans', 'Low-rise flared or baggy jeans', 'The single most 2000s piece there is.', [['boozt', 'low rise jeans'], ['mango', 'flared jeans']]),
      item('yk-mini', F, 'skirt', 'Mini skirt', 'Denim or satin, with a baby tee.', [['mango', 'mini skirt'], ['vinted', 'y2k mini skirt']]),
      item('yk-ringer', M, 'tshirt', 'Ringer or graphic tee', 'Contrast trims and loud prints.', [['vinted', 'ringer tee'], ['beyondretro', 't-shirt']]),
      item('yk-baggy-m', M, 'jeans', 'Baggy light-wash jeans', 'Loose and long, pooling over the trainer.', [['boozt', 'baggy jeans'], ['carhartt', 'landon pant']]),
      item('yk-track', U, 'jacket', 'Track jacket', 'Stripes down the sleeves over anything.', [['boozt', 'adidas track top'], ['vinted', 'track jacket']])
    ],

    grunge: [
      item('gr-flannel', U, 'shirt', 'Flannel shirt', 'Worn open, sleeves pushed up, over a band tee.', [['vinted', 'flannel shirt'], ['boozt', 'flannel shirt']]),
      item('gr-bandtee', U, 'tshirt', 'Band tee', 'Faded is better. Second-hand is best.', [['beyondretro', 'band t-shirt'], ['vinted', 'band t-shirt']]),
      item('gr-jeans', U, 'jeans', 'Black or ripped jeans', 'Worn in, never pristine.', [['boozt', 'black jeans'], ['vinted', 'ripped jeans']]),
      item('gr-leather', U, 'jacket', 'Leather or biker jacket', 'The one investment piece in a grunge wardrobe.', [['vinted', 'leather jacket'], ['boozt', 'leather jacket']])
    ],

    boho: [
      item('bo-maxi', F, 'dress', 'Floral maxi dress', 'The easiest boho outfit is one piece.', [['mango', 'maxi dress'], ['reformation', 'maxi dress']]),
      item('bo-blouse', F, 'shirt', 'Peasant or embroidered blouse', 'Loose sleeves and detail at the neckline.', [['mango', 'embroidered blouse'], ['vinted', 'peasant blouse']]),
      item('bo-skirt', F, 'skirt', 'Flowing midi or maxi skirt', 'Movement is the point — tiers, prints, soft fabric.', [['mango', 'midi skirt'], ['boozt', 'maxi skirt']]),
      item('bo-layer', F, 'jacket', 'Suede or crochet layer', 'Texture pulls the look together.', [['vinted', 'suede jacket'], ['mango', 'crochet cardigan']])
    ],

    romantic: [
      item('ro-midi', F, 'dress', 'Floral midi dress', 'Soft print, fitted waist, a hem that moves.', [['reformation', 'midi dress'], ['mango', 'floral dress']]),
      item('ro-blouse', F, 'shirt', 'Lace or puff-sleeve blouse', 'The detail at the shoulder does the work.', [['mango', 'puff sleeve blouse'], ['boozt', 'lace blouse']]),
      item('ro-slip', F, 'skirt', 'Satin slip skirt', 'Dresses up a knit instantly.', [['mango', 'satin skirt'], ['reformation', 'skirt']]),
      item('ro-cardigan', F, 'hoodie', 'Soft cardigan', 'Buttoned or over the shoulders.', [['uniqlo', 'cardigan'], ['boozt', 'cardigan']])
    ],

    workwear: [
      item('wo-jacket', U, 'jacket', 'Canvas chore or Detroit jacket', 'Stiff at first, perfect after a year.', [['carhartt', 'detroit jacket'], ['boozt', 'chore jacket']]),
      item('wo-pant', U, 'jeans', 'Double-knee or carpenter trousers', 'Built for work, worn for everything.', [['carhartt', 'double knee pant'], ['boozt', 'dickies 874']]),
      item('wo-tee', U, 'tshirt', 'Heavy pocket tee', 'Thick cotton and a chest pocket — the workwear basic.', [['carhartt', 'pocket t-shirt']]),
      item('wo-shirt', U, 'shirt', 'Heavy flannel or shirt jacket', 'A shirt that works as a light jacket.', [['carhartt', 'shirt jac'], ['boozt', 'overshirt']])
    ],

    skater: [
      item('sk-pant', U, 'jeans', 'Loose skate jeans or work pants', 'Room to move and tough enough to fall in.', [['carhartt', 'landon pant'], ['junkyard', '']]),
      item('sk-hoodie', U, 'hoodie', 'Heavy hoodie', 'A skate staple in every season.', [['stussy', 'hoodie'], ['junkyard', '']]),
      item('sk-tee', U, 'tshirt', 'Long-sleeve or boxy tee', 'Loose, simple, a small logo at most.', [['carhartt', 'longsleeve t-shirt'], ['stussy', 'tee']]),
      item('sk-shorts', U, 'shorts', 'Work-pant shorts', 'Below the knee, wide and sturdy.', [['boozt', 'dickies shorts'], ['carhartt', 'shorts']])
    ],

    coastal: [
      item('co-linen', U, 'shirt', 'Linen shirt', 'Breathable, better creased, right from May to September.', [['uniqlo', 'linen shirt'], ['massimo', 'linen shirt']]),
      item('co-breton', U, 'tshirt', 'Breton stripe top', 'Navy and white, the coastal signature.', [['boozt', 'striped t-shirt'], ['uniqlo', 'striped t-shirt']]),
      item('co-shorts-m', M, 'shorts', 'Linen or chino shorts', 'Above the knee, in stone or navy.', [['uniqlo', 'chino shorts'], ['massimo', 'linen bermuda shorts']]),
      item('co-trouser-f', F, 'jeans', 'Linen trousers', 'Wide and light — cooler than any jeans.', [['mango', 'linen trousers'], ['massimo', 'linen trousers']]),
      item('co-sundress', F, 'dress', 'Linen sundress', 'One piece, no thinking, all summer.', [['mango', 'linen dress'], ['reformation', 'linen dress']])
    ],

    goingout: [
      item('go-slip', F, 'dress', 'Satin or slip dress', 'The fastest route to dressed-up.', [['reformation', 'slip dress'], ['mango', 'satin dress']]),
      item('go-top', F, 'shirt', 'Statement party top', 'Sequins, satin or a sharp cut with your best jeans.', [['mango', 'party top'], ['boozt', 'sequin top']]),
      item('go-shirt-m', M, 'shirt', 'Dark shirt or knitted polo', 'Black, navy or deep green — sharp without a tie.', [['massimo', 'knit polo'], ['suitsupply', 'shirt']]),
      item('go-trouser-m', M, 'jeans', 'Dark tailored trousers', 'Better than jeans in any bar with a dress code.', [['suitsupply', 'trousers'], ['massimo', 'tailored trousers']]),
      item('go-leather', U, 'jacket', 'Leather jacket', 'Over a dress or a shirt, it finishes a night-out look.', [['boozt', 'leather jacket'], ['vinted', 'leather jacket']])
    ]
  };

  function genderOk(itemGender, gender) {
    if (!gender || gender === 'all') return true;
    return itemGender === 'unisex' || itemGender === gender;
  }

  function linkFor(shopKey, query, gender) {
    const s = SHOPS[shopKey];
    if (!s) return null;
    return s.search ? s.search(query, gender) : s.page(gender);
  }

  /* An item's shop links, nearest the chosen budget first; second-hand
     shops always stay in, because they suit every budget. */
  function linksFor(it, gender, budget) {
    const target = budget && budget !== 'any' ? Number(budget) : null;
    return it.shops
      .map(([key, q], i) => {
        const s = SHOPS[key];
        return s ? { key, brand: s.brand, tier: s.tier, secondHand: !!s.secondHand, url: linkFor(key, q, gender), i } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (target == null) return a.i - b.i;
        const da = a.secondHand ? 0.5 : Math.abs(a.tier - target);
        const db = b.secondHand ? 0.5 : Math.abs(b.tier - target);
        return (da - db) || (a.i - b.i);
      });
  }

  function itemsFor(styleId, gender, budget) {
    return (GUIDE[styleId] || [])
      .filter(it => genderOk(it.gender, gender))
      .map(it => Object.assign({}, it, { links: linksFor(it, gender, budget) }));
  }

  /* The guide for a style profile: one section per chosen style, or
     the essentials when none are chosen. */
  function forProfile(profile, gender) {
    const p = profile || {};
    const g = gender || p.gender || 'all';
    const ids = (p.styles && p.styles.length) ? p.styles.filter(id => GUIDE[id]) : ['essentials'];
    return ids.map(id => ({ id, items: itemsFor(id, g, p.budget) })).filter(s => s.items.length);
  }

  /* Guide checks: a typo in a shop key or a gender silently removes a
     piece from somebody's guide, so the tests run everything here. */
  function problems(styleIds, types) {
    const out = [];
    const seen = new Set();
    Object.keys(GUIDE).forEach(sid => {
      if (sid !== 'essentials' && styleIds && styleIds.indexOf(sid) === -1) out.push(`guide style "${sid}" is not a style`);
      GUIDE[sid].forEach(it => {
        const at = `${sid}/${it.id}`;
        if (seen.has(it.id)) out.push(at + ': duplicate id');
        seen.add(it.id);
        if ([F, M, U].indexOf(it.gender) === -1) out.push(at + ': bad gender');
        if (it.type !== null && types && types.indexOf(it.type) === -1) out.push(at + ': unknown type ' + it.type);
        if (it.gender === M && (it.type === 'dress' || it.type === 'skirt')) out.push(at + ': menswear dress or skirt');
        if (!it.name || !it.why) out.push(at + ': missing name or why');
        if (!it.shops.length) out.push(at + ': no shops');
        it.shops.forEach(([k]) => { if (!SHOPS[k]) out.push(at + ': unknown shop ' + k); });
      });
    });
    return out;
  }

  return { SHOPS, GUIDE, genderOk, linkFor, linksFor, itemsFor, forProfile, problems };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BuyGuide;
if (typeof window !== 'undefined') window.BuyGuide = BuyGuide;
