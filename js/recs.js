'use strict';
/* ============================================================
   RECS — the "You'd like this…" catalogue.

   This file is YOURS to edit. Each entry is one recommendation
   shown on the For You page, matched by garment type (and,
   optionally, fit preference).

   Fields:
     brand  — shown as a small tag on the row
     name   — the link's title
     note   — one line on why it's worth a look
     types  — which garment types it appears for:
              tshirt, shirt, hoodie, jacket, dress, jeans, shorts, skirt
     fits   — optional: only show for these fit prefs
              ['slim','regular','relaxed']; omit for all
     url    — the plain link
     img    — OPTIONAL real product photo (the brand's own image).
              How to get it: open the product on the brand's site in
              your browser, right-click the product photo → "Copy
              image address" → paste here. Shown instead of the
              coloured garment tile; if it ever breaks, the app
              falls back automatically. Affiliate networks also
              provide these URLs in their product feeds.
     aff    — OPTIONAL affiliate link. When you get approved by a
              network (Awin, Adtraction, Tradedoubler, Amazon…),
              paste the tracking link here — it is used instead of
              url automatically. Leave '' until then.

   NOTE: most retail sites bot-block automated scraping, so FitChecker
   cannot fetch these photos by itself for category links — but any
   image URL you paste from your own browser will load fine.

   Legal note: when any aff link is active, the disclosure line on
   the For You page is required (FTC / EU rules). It renders
   automatically — do not remove it.
   ============================================================ */

const RECS = [
  /* ---------- t-shirts ---------- */
  { brand: 'Uniqlo', name: 'AIRism Cotton Oversized Tee', note: 'The boxy staple — half sizes of ease built in, breathes well.',
    types: ['tshirt'], fits: ['relaxed'], url: 'https://www.uniqlo.com/se/en/men/tops/t-shirts', aff: '' },
  { brand: 'Uniqlo', name: 'Supima Cotton Crew Neck', note: 'A clean regular-fit tee that holds its shape wash after wash.',
    types: ['tshirt'], url: 'https://www.uniqlo.com/se/en/men/tops/t-shirts',
    img: 'https://image.uniqlo.com/UQ/ST3/eu/imagesgoods/455365/item/eugoods_17_455365_3x4.jpg', aff: '' },
  { brand: 'Weekday', name: 'Relaxed & standard tees', note: 'Scandi cuts with honest sizing — good between-size options.',
    types: ['tshirt'], url: 'https://www.weekday.com/en-se/c/men/t-shirts-tops/', aff: '' },
  { brand: 'ASOS', name: 'T-shirt edit — all fits', note: 'Huge range with fit filters: slim, regular, oversized in one place.',
    types: ['tshirt'], url: 'https://www.asos.com/men/t-shirts-vests/cat/?cid=7616', aff: '' },

  /* ---------- shirts ---------- */
  { brand: 'Uniqlo', name: 'Oxford & linen shirts', note: 'Reliable collar-to-hem proportions; the size chart runs true.',
    types: ['shirt'], url: 'https://www.uniqlo.com/se/en/men/shirts-and-polos', aff: '' },
  { brand: 'H&M', name: 'Shirts in regular & relaxed', note: 'Budget-friendly, generous cut — size down if you like it neat.',
    types: ['shirt'], url: 'https://www2.hm.com/en_gb/men/shop-by-product/shirts.html', aff: '' },
  { brand: 'Massimo Dutti', name: 'Tailored shirting', note: 'Sharper shoulders and a longer hem — suits a slim preference.',
    types: ['shirt'], fits: ['slim', 'regular'], url: 'https://www.massimodutti.com/se/men/clothing/shirts-n1904', aff: '' },

  /* ---------- hoodies & sweats ---------- */
  { brand: 'Uniqlo', name: 'Sweat pullover hoodie', note: 'Mid-weight, true to chart — a safe first-size buy.',
    types: ['hoodie'], url: 'https://www.uniqlo.com/se/en/men/sweatshirts-and-hoodies', aff: '' },
  { brand: 'Weekday', name: 'Oversized hoodies', note: 'Dropped shoulders by design — trust the relaxed verdict here.',
    types: ['hoodie'], fits: ['relaxed'], url: 'https://www.weekday.com/en-se/c/men/hoodies-sweatshirts/', aff: '' },
  { brand: 'H&M', name: 'Basics hoodie range', note: 'Everyday sweats — check the garment-length verdict; they run short.',
    types: ['hoodie'], url: 'https://www2.hm.com/en_gb/men/shop-by-product/hoodies-sweatshirts.html', aff: '' },

  /* ---------- jackets & coats ---------- */
  { brand: 'Lacoste', name: 'Jackets & coats', note: 'Sporty cuts with published product measurements — easy to verify.',
    types: ['jacket'], url: 'https://www.lacoste.com/se/lacoste/men/clothing/jackets-coats/', aff: '' },
  { brand: 'Zalando', name: 'Jacket edit — all brands', note: 'Filter by size and fit; free returns make between-sizes safer.',
    types: ['jacket'], url: 'https://www.zalando.se/herrklader-jackor/', aff: '' },
  { brand: 'Uniqlo', name: 'Outerwear & blousons', note: 'Light shells and hybrid down — sized for a tee underneath.',
    types: ['jacket'], url: 'https://www.uniqlo.com/se/en/men/outerwear', aff: '' },

  /* ---------- dresses ---------- */
  { brand: 'H&M', name: 'Dresses — every length', note: 'Wide size run; check the garment-length verdict against your height.',
    types: ['dress'], url: 'https://www2.hm.com/en_gb/ladies/shop-by-product/dresses.html', aff: '' },
  { brand: '& Other Stories', name: 'Dresses with real waists', note: 'Cut for a defined waist — good when your hip-waist drop is large.',
    types: ['dress'], url: 'https://www.stories.com/en_sek/clothing/dresses.html', aff: '' },
  { brand: 'ASOS', name: 'Dress edit — petite & tall', note: 'Dedicated petite and tall lines when standard lengths fail you.',
    types: ['dress'], url: 'https://www.asos.com/women/dresses/cat/?cid=8799', aff: '' },

  /* ---------- jeans & trousers ---------- */
  { brand: "Levi's", name: '501 & tapered fits', note: 'The reference size chart — waist and inseam sold separately.',
    types: ['jeans'], url: 'https://www.levi.com/SE/en/clothing/men/jeans/c/levi_clothing_men_jeans', aff: '' },
  { brand: 'Weekday', name: 'Jeans in exact waist/leg', note: 'Numeric waist × length sizing beats S/M/L guessing every time.',
    types: ['jeans'], url: 'https://www.weekday.com/en-se/c/men/jeans/', aff: '' },
  { brand: 'Zalando', name: 'Trouser edit — all brands', note: 'Filter by waist and inseam from your profile numbers.',
    types: ['jeans'], url: 'https://www.zalando.se/herrklader-jeans/', aff: '' },

  /* ---------- shorts ---------- */
  { brand: 'Uniqlo', name: 'Chino & sweat shorts', note: 'Consistent rise and thigh room across colours.',
    types: ['shorts'], url: 'https://www.uniqlo.com/se/en/men/bottoms/shorts', aff: '' },
  { brand: 'H&M', name: 'Shorts — regular & relaxed', note: 'Roomy thigh cuts if your thigh verdict keeps reading tight.',
    types: ['shorts'], url: 'https://www2.hm.com/en_gb/men/shop-by-product/shorts.html', aff: '' },

  /* ---------- skirts ---------- */
  { brand: 'Monki', name: 'Skirts — minis to maxis', note: 'Elastic and A-line options forgive a between-sizes waist.',
    types: ['skirt'], url: 'https://www.monki.com/en-se/clothing/skirts/', aff: '' },
  { brand: '& Other Stories', name: 'Tailored skirts', note: 'Sized to the waist — trust your waist verdict over the label.',
    types: ['skirt'], url: 'https://www.stories.com/en_sek/clothing/skirts.html', aff: '' }
];
