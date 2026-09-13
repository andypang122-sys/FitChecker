'use strict';
/* ============================================================
   RECS — the "You'd like this…" catalogue.

   This file is YOURS to edit. Each entry is one recommendation on
   the For You page, ranked for each person by style-profile.js.

   Fields:
     brand  — shown as a small tag on the row
     name   — the link's title
     note   — one line on why it's worth a look
     types  — which garment types it appears for:
              tshirt, shirt, hoodie, jacket, dress, jeans, shorts, skirt
     gender — 'female' | 'male' | 'unisex'. Decides who ever sees it:
              someone shopping womenswear is never sent to a men's page.
     styles — one or more style niches it suits (ids from STYLES in
              js/style-profile.js): streetwear, office, smartcasual,
              minimalist, oldmoney, classic, athleisure, gorpcore,
              techwear, vintage, y2k, grunge, boho, romantic, workwear,
              skater, coastal, goingout
     tier   — price level: 1 budget, 2 mid-range, 3 premium
     fits   — optional: only suits these fit prefs
              ['slim','regular','relaxed']; omit for all
     url    — the plain link
     img    — OPTIONAL real product photo (the brand's own image).
              Open the product in your browser, right-click the photo →
              "Copy image address" → paste here. Falls back to the
              coloured garment tile if it ever breaks.
     aff    — OPTIONAL affiliate link (Awin, Adtraction, Tradedoubler,
              Amazon…). Used instead of url automatically. Leave ''
              until approved.

   tests/test_style_profile.js checks every entry — a mistyped style
   or gender would silently hide a shop from everyone who chose it.

   NOTE: most retail sites bot-block automated scraping, so FitChecker
   cannot fetch these photos by itself for category links — but any
   image URL you paste from your own browser will load fine.

   Legal note: when any aff link is active, the disclosure line on
   the For You page is required (FTC / EU rules). It renders
   automatically — do not remove it.
   ============================================================ */

const RECS = [
  /* ================= t-shirts ================= */
  { brand: 'Uniqlo', name: 'AIRism Cotton Oversized Tee', note: 'The boxy staple — half a size of ease built in, breathes well.',
    types: ['tshirt'], fits: ['relaxed'], gender: 'male', styles: ['streetwear', 'minimalist', 'skater'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/men/tops/t-shirts', aff: '' },
  { brand: 'Uniqlo', name: 'Supima Cotton Crew Neck', note: 'A clean regular-fit tee that holds its shape wash after wash.',
    types: ['tshirt'], gender: 'male', styles: ['minimalist', 'smartcasual', 'classic'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/men/tops/t-shirts',
    img: 'https://image.uniqlo.com/UQ/ST3/eu/imagesgoods/455365/item/eugoods_17_455365_3x4.jpg', aff: '' },
  { brand: 'Weekday', name: 'Relaxed & standard tees', note: 'Scandi cuts with honest sizing — good between-size options.',
    types: ['tshirt'], gender: 'male', styles: ['minimalist', 'streetwear'], tier: 1,
    url: 'https://www.weekday.com/en-se/c/men/t-shirts-tops/', aff: '' },
  { brand: 'ASOS', name: 'T-shirt edit — all fits', note: 'Huge range with fit filters: slim, regular, oversized in one place.',
    types: ['tshirt'], gender: 'male', styles: ['streetwear', 'goingout', 'y2k'], tier: 1,
    url: 'https://www.asos.com/men/t-shirts-vests/cat/?cid=7616', aff: '' },
  { brand: 'Uniqlo', name: 'Women’s tees — crew, relaxed & cropped', note: 'True-to-chart basics that stay in shape; the relaxed cut runs roomy.',
    types: ['tshirt'], gender: 'female', styles: ['minimalist', 'smartcasual', 'classic'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/women/tops/t-shirts', aff: '' },
  { brand: 'Weekday', name: 'Women’s tees & tops', note: 'Boxy, cropped and fitted cuts from the same honest size chart.',
    types: ['tshirt'], gender: 'female', styles: ['streetwear', 'minimalist', 'y2k'], tier: 1,
    url: 'https://www.weekday.com/en-se/c/women/t-shirts-tops/', aff: '' },
  { brand: 'ASOS', name: 'Women’s T-shirt edit', note: 'Baby tees to oversized — filter by fit and length in one place.',
    types: ['tshirt'], gender: 'female', styles: ['y2k', 'streetwear', 'goingout'], tier: 1,
    url: 'https://www.asos.com/search/?q=womens%20t%20shirts', aff: '' },

  /* ================= shirts & blouses ================= */
  { brand: 'Uniqlo', name: 'Oxford & linen shirts', note: 'Reliable collar-to-hem proportions; the size chart runs true.',
    types: ['shirt'], gender: 'male', styles: ['office', 'smartcasual', 'classic', 'coastal'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/men/shirts-and-polos', aff: '' },
  { brand: 'H&M', name: 'Shirts in regular & relaxed', note: 'Budget-friendly, generous cut — size down if you like it neat.',
    types: ['shirt'], gender: 'male', styles: ['office', 'smartcasual', 'goingout'], tier: 1,
    url: 'https://www2.hm.com/en_gb/men/shop-by-product/shirts.html', aff: '' },
  { brand: 'Massimo Dutti', name: 'Tailored shirting', note: 'Sharper shoulders and a longer hem — suits a slim preference.',
    types: ['shirt'], fits: ['slim', 'regular'], gender: 'male', styles: ['office', 'oldmoney', 'smartcasual'], tier: 2,
    url: 'https://www.massimodutti.com/se/men/clothing/shirts-n1904', aff: '' },
  { brand: 'H&M', name: 'Women’s shirts & blouses', note: 'Office shirts to soft blouses; check sleeve length if your arms run long.',
    types: ['shirt'], gender: 'female', styles: ['office', 'romantic', 'smartcasual'], tier: 1,
    url: 'https://www2.hm.com/en_gb/ladies/shop-by-product/shirts-blouses.html', aff: '' },
  { brand: 'Uniqlo', name: 'Women’s shirts & blouses', note: 'Linen and rayon shirts sized to the bust — a safe first buy.',
    types: ['shirt'], gender: 'female', styles: ['minimalist', 'office', 'coastal'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/women/shirts-and-blouses', aff: '' },
  { brand: 'Massimo Dutti', name: 'Women’s tailoring & shirts', note: 'Structured shirts and blazers cut for the office and dinner after.',
    types: ['shirt', 'jacket'], gender: 'female', styles: ['office', 'oldmoney', 'smartcasual'], tier: 2,
    url: 'https://www.massimodutti.com/se/women/clothing-n1854', aff: '' },

  /* ================= hoodies & sweats ================= */
  { brand: 'Uniqlo', name: 'Sweat pullover hoodie', note: 'Mid-weight, true to chart — a safe first-size buy.',
    types: ['hoodie'], gender: 'male', styles: ['athleisure', 'minimalist'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/men/tops/sweatshirts-and-hoodies', aff: '' },
  { brand: 'Weekday', name: 'Oversized hoodies', note: 'Dropped shoulders by design — trust the relaxed verdict here.',
    types: ['hoodie'], fits: ['relaxed'], gender: 'male', styles: ['streetwear', 'skater'], tier: 1,
    url: 'https://www.weekday.com/en-se/c/men/hoodies-sweatshirts/', aff: '' },
  { brand: 'H&M', name: 'Basics hoodie range', note: 'Everyday sweats — check the garment-length verdict; they run short.',
    types: ['hoodie'], gender: 'male', styles: ['streetwear', 'athleisure'], tier: 1,
    url: 'https://www2.hm.com/en_gb/men/shop-by-product/hoodies-sweatshirts.html', aff: '' },
  { brand: 'H&M', name: 'Women’s hoodies & sweatshirts', note: 'Cropped and oversized cuts; the oversized ones size up a full step.',
    types: ['hoodie'], gender: 'female', styles: ['streetwear', 'athleisure', 'y2k'], tier: 1,
    url: 'https://www2.hm.com/en_gb/ladies/shop-by-product/hoodies-sweatshirts.html', aff: '' },
  { brand: 'Weekday', name: 'Women’s hoodies & sweats', note: 'Heavy cotton, boxy shapes — trust the relaxed verdict.',
    types: ['hoodie'], fits: ['relaxed'], gender: 'female', styles: ['streetwear', 'skater', 'minimalist'], tier: 1,
    url: 'https://www.weekday.com/en-se/c/women/hoodies-sweatshirts/', aff: '' },
  { brand: 'Uniqlo', name: 'Women’s sweatshirts & hoodies', note: 'Mid-weight and true to chart; the cropped styles are cut short on purpose.',
    types: ['hoodie'], gender: 'female', styles: ['athleisure', 'minimalist'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/women/tops/sweatshirts-and-hoodies', aff: '' },

  /* ================= jackets & coats ================= */
  { brand: 'Lacoste', name: 'Jackets & coats', note: 'Sporty cuts with published product measurements — easy to verify.',
    types: ['jacket'], gender: 'male', styles: ['classic', 'oldmoney', 'athleisure'], tier: 2,
    url: 'https://www.lacoste.com/se/lacoste/men/clothing/jackets-coats/', aff: '' },
  { brand: 'Zalando', name: 'Jacket edit — all brands', note: 'Filter by size and fit; free returns make between-sizes safer.',
    types: ['jacket'], gender: 'male', styles: ['smartcasual', 'streetwear', 'classic'], tier: 2,
    url: 'https://www.zalando.se/herrklader-jackor/', aff: '' },
  { brand: 'Uniqlo', name: 'Outerwear & blousons', note: 'Light shells and hybrid down — sized for a tee underneath.',
    types: ['jacket'], gender: 'male', styles: ['minimalist', 'gorpcore'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/men/outerwear', aff: '' },
  { brand: 'Zalando', name: 'Women’s jacket edit — all brands', note: 'Trench to puffer, with a size filter and free returns.',
    types: ['jacket'], gender: 'female', styles: ['smartcasual', 'classic', 'streetwear'], tier: 2,
    url: 'https://www.zalando.se/damklader-jackor/', aff: '' },
  { brand: 'Uniqlo', name: 'Women’s outerwear', note: 'Light down and blazers cut with room for a knit underneath.',
    types: ['jacket'], gender: 'female', styles: ['minimalist', 'gorpcore', 'office'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/women/outerwear', aff: '' },
  { brand: 'Lacoste', name: 'Women’s clothing', note: 'Polo dresses, knits and jackets with product measurements listed.',
    types: ['jacket', 'tshirt', 'dress'], gender: 'female', styles: ['classic', 'oldmoney', 'coastal'], tier: 2,
    url: 'https://www.lacoste.com/se/lacoste/women/clothing/', aff: '' },

  /* ================= dresses ================= */
  { brand: 'H&M', name: 'Dresses — every length', note: 'Wide size run; check the garment-length verdict against your height.',
    types: ['dress'], gender: 'female', styles: ['romantic', 'goingout', 'coastal'], tier: 1,
    url: 'https://www2.hm.com/en_gb/ladies/shop-by-product/dresses.html', aff: '' },
  { brand: '& Other Stories', name: 'Dresses with real waists', note: 'Cut for a defined waist — good when your hip-waist drop is large.',
    types: ['dress'], gender: 'female', styles: ['romantic', 'boho', 'office'], tier: 2,
    url: 'https://www.stories.com/en_sek/clothing/dresses.html', aff: '' },
  { brand: 'ASOS', name: 'Dress edit — petite & tall', note: 'Dedicated petite and tall lines when standard lengths fail you.',
    types: ['dress'], gender: 'female', styles: ['goingout', 'y2k', 'romantic'], tier: 1,
    url: 'https://www.asos.com/women/dresses/cat/?cid=8799', aff: '' },
  { brand: 'Reformation', name: 'Dresses & tops', note: 'Fitted bodices and bias cuts — measure your bust, they size to it.',
    types: ['dress', 'tshirt'], gender: 'female', styles: ['romantic', 'goingout', 'coastal'], tier: 3,
    url: 'https://www.thereformation.com/', aff: '' },
  { brand: 'Free People', name: 'Boho dresses & layers', note: 'Loose, flowing cuts; most styles forgive a size either way.',
    types: ['dress', 'shirt'], fits: ['relaxed', 'regular'], gender: 'female', styles: ['boho', 'romantic', 'vintage'], tier: 3,
    url: 'https://www.freepeople.com/', aff: '' },
  { brand: 'Mango', name: 'Women’s dresses & tailoring', note: 'Office-to-evening pieces; the tailored cuts run a little small.',
    types: ['dress', 'jacket', 'shirt'], gender: 'female', styles: ['office', 'romantic', 'boho', 'goingout'], tier: 2,
    url: 'https://shop.mango.com/se/en/h/women', aff: '' },

  /* ================= jeans & trousers ================= */
  { brand: "Levi's", name: '501 & tapered fits', note: 'The reference size chart — waist and inseam sold separately.',
    types: ['jeans'], gender: 'male', styles: ['vintage', 'workwear', 'classic', 'grunge'], tier: 2,
    url: 'https://www.levi.com/SE/en/clothing/men/jeans/c/levi_clothing_men_jeans', aff: '' },
  { brand: 'Weekday', name: 'Jeans in exact waist/leg', note: 'Numeric waist × length sizing beats S/M/L guessing every time.',
    types: ['jeans'], gender: 'male', styles: ['streetwear', 'skater', 'minimalist'], tier: 1,
    url: 'https://www.weekday.com/en-se/c/men/jeans/', aff: '' },
  { brand: 'Zalando', name: 'Trouser edit — all brands', note: 'Filter by waist and inseam from your profile numbers.',
    types: ['jeans'], gender: 'male', styles: ['office', 'smartcasual', 'streetwear'], tier: 2,
    url: 'https://www.zalando.se/herrklader-jeans/', aff: '' },
  { brand: "Levi's", name: 'Women’s jeans — 501, ribcage, baggy', note: 'Waist and length sold separately; the ribcage rise sits high.',
    types: ['jeans'], gender: 'female', styles: ['vintage', 'classic', 'grunge', 'y2k'], tier: 2,
    url: 'https://www.levi.com/SE/en/clothing/women/jeans/c/levi_clothing_women_jeans', aff: '' },
  { brand: 'Weekday', name: 'Women’s jeans in waist/leg sizes', note: 'Wide, straight and low-rise fits in numeric sizing.',
    types: ['jeans'], gender: 'female', styles: ['streetwear', 'y2k', 'skater', 'minimalist'], tier: 1,
    url: 'https://www.weekday.com/en-se/c/women/jeans/', aff: '' },
  { brand: 'Zalando', name: 'Women’s jeans & trousers — all brands', note: 'Filter by waist and length; tailored trousers sit in the same edit.',
    types: ['jeans'], gender: 'female', styles: ['office', 'smartcasual', 'streetwear'], tier: 2,
    url: 'https://www.zalando.se/damklader-jeans/', aff: '' },

  /* ================= shorts ================= */
  { brand: 'Uniqlo', name: 'Chino & sweat shorts', note: 'Consistent rise and thigh room across colours.',
    types: ['shorts'], gender: 'male', styles: ['coastal', 'minimalist', 'athleisure'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/men/bottoms/shorts', aff: '' },
  { brand: 'H&M', name: 'Shorts — regular & relaxed', note: 'Roomy thigh cuts if your thigh verdict keeps reading tight.',
    types: ['shorts'], gender: 'male', styles: ['coastal', 'streetwear', 'skater'], tier: 1,
    url: 'https://www2.hm.com/en_gb/men/shop-by-product/shorts.html', aff: '' },
  { brand: 'H&M', name: 'Women’s shorts', note: 'Denim, linen and bike shorts; check the rise against your waist verdict.',
    types: ['shorts'], gender: 'female', styles: ['coastal', 'y2k', 'athleisure'], tier: 1,
    url: 'https://www2.hm.com/en_gb/ladies/shop-by-product/shorts.html', aff: '' },
  { brand: 'Uniqlo', name: 'Women’s shorts', note: 'Linen-blend and chino shorts with a consistent rise.',
    types: ['shorts'], gender: 'female', styles: ['coastal', 'minimalist'], tier: 1,
    url: 'https://www.uniqlo.com/se/en/women/bottoms/shorts-and-skorts', aff: '' },

  /* ================= skirts ================= */
  { brand: 'Monki', name: 'Skirts — minis to maxis', note: 'Elastic and A-line options forgive a between-sizes waist.',
    types: ['skirt'], gender: 'female', styles: ['y2k', 'romantic', 'streetwear'], tier: 1,
    url: 'https://www.monki.com/en-se/clothing/skirts/', aff: '' },
  { brand: '& Other Stories', name: 'Tailored skirts', note: 'Sized to the waist — trust your waist verdict over the label.',
    types: ['skirt'], gender: 'female', styles: ['office', 'romantic', 'minimalist'], tier: 2,
    url: 'https://www.stories.com/en_sek/clothing/skirts.html', aff: '' },

  /* ================= streetwear & skate ================= */
  { brand: 'Carhartt WIP', name: 'Men’s streetwear & workwear', note: 'Boxy hoodies, canvas jackets and double-knee trousers; size down for a neat fit.',
    types: ['hoodie', 'jacket', 'jeans', 'tshirt'], gender: 'male', styles: ['streetwear', 'workwear', 'skater'], tier: 2,
    url: 'https://www.carhartt-wip.com/en-gb/c/men', aff: '' },
  { brand: 'Carhartt WIP', name: 'Women’s streetwear & workwear', note: 'Workwear shapes cut for women — the jackets run cropped.',
    types: ['hoodie', 'jacket', 'jeans', 'tshirt'], gender: 'female', styles: ['streetwear', 'workwear', 'skater'], tier: 2,
    url: 'https://www.carhartt-wip.com/en-gb/c/women', aff: '' },
  { brand: 'Stüssy', name: 'Tees, hoodies & outerwear', note: 'Unisex sizing that runs large — go by the chest measurement, not the letter.',
    types: ['tshirt', 'hoodie', 'jacket'], fits: ['relaxed', 'regular'], gender: 'unisex', styles: ['streetwear', 'skater'], tier: 3,
    url: 'https://www.stussy.com/', aff: '' },
  { brand: 'Vans', name: 'Skate clothing', note: 'Loose skate cuts and fleece; the tees run long in the body.',
    types: ['tshirt', 'hoodie', 'shorts'], gender: 'unisex', styles: ['skater', 'streetwear'], tier: 2,
    url: 'https://www.vans.eu/', aff: '' },
  { brand: 'Dickies', name: 'Work trousers & shirts', note: 'The 874 work pant is sized by waist and runs straight through the leg.',
    types: ['jeans', 'shirt', 'jacket'], gender: 'unisex', styles: ['workwear', 'skater', 'streetwear'], tier: 1,
    url: 'https://www.dickieslife.com/', aff: '' },
  { brand: 'Pull&Bear', name: 'Trend pieces on a budget', note: 'Fast-changing streetwear and Y2K cuts; sizing runs small, go up one.',
    types: ['tshirt', 'hoodie', 'jeans'], gender: 'unisex', styles: ['y2k', 'streetwear'], tier: 1,
    url: 'https://www.pullandbear.com/', aff: '' },
  { brand: 'Bershka', name: 'Y2K & going-out', note: 'Low-rise, baby tees and party pieces; cut slim, size up if between.',
    types: ['tshirt', 'jeans', 'skirt', 'dress'], gender: 'female', styles: ['y2k', 'goingout', 'streetwear'], tier: 1,
    url: 'https://www.bershka.com/', aff: '' },

  /* ================= office, smart & old money ================= */
  { brand: 'Suitsupply', name: 'Suits, shirts & tailoring', note: 'Jacket sizes by chest with free alterations in store — the best route to a sharp fit.',
    types: ['jacket', 'shirt', 'jeans'], fits: ['slim', 'regular'], gender: 'male', styles: ['office', 'oldmoney', 'smartcasual'], tier: 3,
    url: 'https://suitsupply.com/', aff: '' },
  { brand: 'COS', name: 'Men’s modern essentials', note: 'Architectural basics with generous ease — often a size down from your verdict.',
    types: ['tshirt', 'shirt', 'jacket', 'jeans'], gender: 'male', styles: ['minimalist', 'office', 'smartcasual'], tier: 2,
    url: 'https://www.cos.com/en-se/men', aff: '' },
  { brand: 'COS', name: 'Women’s modern essentials', note: 'Clean tailoring and knits; the relaxed cuts are cut very full.',
    types: ['tshirt', 'shirt', 'dress', 'skirt', 'jacket'], gender: 'female', styles: ['minimalist', 'office', 'smartcasual'], tier: 2,
    url: 'https://www.cos.com/en-se/women', aff: '' },
  { brand: 'Arket', name: 'Men’s everyday basics', note: 'Nordic basics built to last, with product measurements on every page.',
    types: ['tshirt', 'shirt', 'hoodie', 'jacket'], gender: 'male', styles: ['minimalist', 'smartcasual', 'classic'], tier: 2,
    url: 'https://www.arket.com/en-se/men', aff: '' },
  { brand: 'Arket', name: 'Women’s everyday basics', note: 'Considered staples with measurements listed — easy to check against your verdict.',
    types: ['tshirt', 'shirt', 'dress', 'jacket'], gender: 'female', styles: ['minimalist', 'smartcasual', 'classic'], tier: 2,
    url: 'https://www.arket.com/en-se/women', aff: '' },
  { brand: 'Filippa K', name: 'Scandinavian tailoring', note: 'Precise Stockholm cuts — the trousers are sized small and slim.',
    types: ['jacket', 'shirt', 'jeans', 'dress'], fits: ['slim', 'regular'], gender: 'unisex', styles: ['minimalist', 'office', 'oldmoney'], tier: 3,
    url: 'https://www.filippa-k.com/', aff: '' },
  { brand: 'Ralph Lauren', name: 'Menswear — polos, knits, blazers', note: 'The quiet-luxury reference; Custom Fit sits between slim and classic.',
    types: ['tshirt', 'shirt', 'jacket'], gender: 'male', styles: ['oldmoney', 'classic', 'coastal'], tier: 3,
    url: 'https://www.ralphlauren.eu/se/en/men', aff: '' },
  { brand: 'Ralph Lauren', name: 'Womenswear — knits, shirts, dresses', note: 'Cable knits and pressed shirting; sleeves run long.',
    types: ['tshirt', 'shirt', 'dress', 'jacket'], gender: 'female', styles: ['oldmoney', 'classic', 'coastal'], tier: 3,
    url: 'https://www.ralphlauren.eu/se/en/women', aff: '' },
  { brand: 'GANT', name: 'Menswear — oxfords, knits, chinos', note: 'Swedish-American preppy; the Regular Fit shirt is roomier than most.',
    types: ['shirt', 'jacket', 'jeans'], gender: 'male', styles: ['classic', 'oldmoney', 'smartcasual'], tier: 2,
    url: 'https://www.gant.se/c/herr', aff: '' },
  { brand: 'GANT', name: 'Womenswear — shirts, knits, dresses', note: 'Preppy staples; the shirts are cut straight rather than fitted.',
    types: ['shirt', 'dress', 'jacket'], gender: 'female', styles: ['classic', 'oldmoney', 'smartcasual'], tier: 2,
    url: 'https://www.gant.se/c/dam', aff: '' },
  { brand: 'Tommy Hilfiger', name: 'Preppy essentials', note: 'Classic stripes and polos; regular fits run true to chart.',
    types: ['tshirt', 'shirt', 'jacket'], gender: 'unisex', styles: ['classic', 'coastal'], tier: 2,
    url: 'https://se.tommy.com/', aff: '' },

  /* ================= athleisure ================= */
  { brand: 'Nike', name: 'Men’s clothing', note: 'Tech Fleece and training kit; the Standard Fit is roomier than Slim.',
    types: ['hoodie', 'tshirt', 'shorts', 'jacket'], gender: 'male', styles: ['athleisure', 'streetwear'], tier: 2,
    url: 'https://www.nike.com/w/mens-clothing-6ymx6znik1', aff: '' },
  { brand: 'Nike', name: 'Women’s clothing', note: 'Leggings, fleece and training tops; sports bras size by band and cup.',
    types: ['hoodie', 'tshirt', 'shorts', 'jacket'], gender: 'female', styles: ['athleisure', 'streetwear'], tier: 2,
    url: 'https://www.nike.com/w/womens-clothing-5e1x6z6ymx6', aff: '' },
  { brand: 'adidas', name: 'Men’s clothing', note: 'Track tops and training kit; Originals pieces cut looser than Performance.',
    types: ['hoodie', 'tshirt', 'jacket', 'shorts'], gender: 'male', styles: ['athleisure', 'streetwear', 'y2k'], tier: 2,
    url: 'https://www.adidas.se/man-klader', aff: '' },
  { brand: 'adidas', name: 'Women’s clothing', note: 'Track jackets and leggings; the Originals line runs a size large.',
    types: ['hoodie', 'tshirt', 'jacket', 'shorts'], gender: 'female', styles: ['athleisure', 'streetwear', 'y2k'], tier: 2,
    url: 'https://www.adidas.se/dam-klader', aff: '' },
  { brand: 'Gymshark', name: 'Training wear', note: 'Fitted gym cuts — go by your chest and waist verdicts, not the letter.',
    types: ['tshirt', 'hoodie', 'shorts'], fits: ['slim', 'regular'], gender: 'unisex', styles: ['athleisure'], tier: 2,
    url: 'https://eu.gymshark.com/', aff: '' },
  { brand: 'lululemon', name: 'Premium athleisure', note: 'Sizes numerically for women (0–20) and S–XXL for men; the ABC trouser has a roomy thigh.',
    types: ['tshirt', 'hoodie', 'jacket', 'jeans', 'shorts'], gender: 'unisex', styles: ['athleisure', 'smartcasual'], tier: 3,
    url: 'https://eu.lululemon.com/', aff: '' },

  /* ================= outdoor & techwear ================= */
  { brand: "Arc'teryx", name: 'Technical shells & layers', note: 'Trim, athletic cuts — size up if you layer a fleece underneath.',
    types: ['jacket', 'hoodie'], fits: ['slim', 'regular'], gender: 'unisex', styles: ['gorpcore', 'techwear'], tier: 3,
    url: 'https://arcteryx.com/', aff: '' },
  { brand: 'Fjällräven', name: 'Outdoor jackets & trousers', note: 'Durable G-1000 pieces; the Vidda trousers size by waist and run long.',
    types: ['jacket', 'jeans', 'hoodie'], gender: 'unisex', styles: ['gorpcore', 'workwear', 'minimalist'], tier: 3,
    url: 'https://www.fjallraven.com/', aff: '' },
  { brand: 'The North Face', name: 'Puffers & outdoor layers', note: 'Nuptse puffers run boxy and short; check your garment-length verdict.',
    types: ['jacket', 'hoodie'], gender: 'unisex', styles: ['gorpcore', 'streetwear', 'techwear'], tier: 2,
    url: 'https://www.thenorthface.com/', aff: '' },

  /* ================= vintage, grunge & second-hand ================= */
  { brand: 'Beyond Retro', name: 'Curated vintage', note: 'Real vintage: check each listing’s measurements against your size passport.',
    types: ['jacket', 'jeans', 'shirt', 'dress'], gender: 'unisex', styles: ['vintage', 'grunge', 'y2k'], tier: 1,
    url: 'https://www.beyondretro.com/', aff: '' },
  { brand: 'Vinted', name: 'Second-hand marketplace', note: 'Use FitChecker’s second-hand screen: paste a listing and it judges the fit.',
    types: ['tshirt', 'shirt', 'hoodie', 'jacket', 'jeans', 'dress'], gender: 'unisex', styles: ['vintage', 'y2k', 'grunge', 'boho'], tier: 1,
    url: 'https://www.vinted.se/', aff: '' },
  { brand: 'AllSaints', name: 'Leather, band tees & dark denim', note: 'Slim, long-bodied cuts; leather jackets are sized to wear close.',
    types: ['jacket', 'tshirt', 'jeans'], fits: ['slim', 'regular'], gender: 'unisex', styles: ['grunge', 'goingout'], tier: 3,
    url: 'https://www.allsaints.com/', aff: '' }
];

if (typeof module !== 'undefined' && module.exports) module.exports = RECS;
