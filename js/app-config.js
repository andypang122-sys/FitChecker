'use strict';
/* FitCheck — see Aura/js/app-config.js for the full field guide.

   Note on pricing: the consumer sub is deliberately cheap here.
   FitCheck's real revenue is the merchant side (per-store
   integration to cut returns) — consumer scans are the data that
   makes the fit engine worth paying for. Don't over-monetise the
   consumer and starve the dataset. */

window.APP_CONFIG = {
  id:     'fitcheck',     // storage-key prefix — never rename, it would orphan saved data
  name:   'FitChecker',
  accent: '#b86436',
  icon:   'icons/icon-192.png',

  backend: { url: '', anonKey: '' },

  /* Screens that stay out of the nav, home and More until they have
     something in them. An empty community feed in the main tab bar
     tells every new user nobody else is here. The routes still work,
     so flipping one back on is all it takes (community also needs its
     Outfits tab restored in index.html's nav). */
  features: {
    community: false,   // Outfits feed + Outfit Battle
    progress:  false,   // body-scan trend over time
    colours:   false    // seasonal colour palette
  },

  trialDays: 3,
  listEndpoint: '',
  adClient: '',

  money: {
    /* No paid tier until checkout is wired AND purchases are confirmed
       server-side. With paid:false every Pro feature is open and no
       price, trial, daily meter, lock or ad is shown. See monetize.js. */
    paid: false,
    noun: 'check', nounPlural: 'checks',
    proName: 'FitChecker Pro',
    freePerDay: 5,
    perks: [
      'Fit verdict on any item, at any brand',
      'Where it will pull — shoulders, waist, length',
      'Saved profiles for the people you shop for',
      'Full wardrobe history & no ads ✦'
    ],
    plans: {
      annual:    { id: 'annual',    label: 'Annual',     price: '€24.99', period: 'year',  note: 'Just €2.08/mo — best value', save: 'Save 58%' },
      monthly:   { id: 'monthly',   label: 'Monthly',    price: '€4.99',  period: 'month', note: 'Cancel anytime' },
      allaccess: { id: 'allaccess', label: 'All Access', price: '€9.99',  period: 'month', note: 'Unlocks all six apps with one login' }
    },
    defaultPlan: 'annual',
    checkout: { annual: '', monthly: '', allaccess: '' },
    /* AdSense unit ids, keyed by the slot names the screens actually
       use. Every name passed to Ads.slot() must appear here or that
       placement falls back to the generic unit — previously an
       unlisted name could never serve a real ad, silently, forever. */
    adSlots: {
      home: '',
      content: '',
      more: '',
      progress: '',
      wardrobe: '',
      result: '',
      anchor: '',
      interstitial: ''
    },

    /* Optional VAST tag (Google Ad Manager or an outstream network)
       for real video demand. Blank = house creatives only. */
    vastTag: '',
    anchorEveryMin: 4,
    interstitialMin: 20
  },

  /* ============================================================
     House ads — your own creatives, image or video.

     These fill any slot the ad network doesn't, which at low traffic
     is most of them. They are worth far more than display: one
     affiliate click can pay more than a thousand display impressions.

     Each creative:
       id      unique; used for rotation and the local impression count
       type    'image' | 'video'
       src     image path, or an .mp4/.webm — keep it local so the app
               still works offline and no third party gets a request
       poster  first frame for video, shown before it plays
       slots   which placements it may appear in; omit for anywhere
       weight  relative frequency (2 = shown twice as often as 1)
       label   the disclosure text — 'Sponsored' or 'Partner'
       url     where the click goes; add your affiliate tag here

     Empty by default: an ad with a dead link is worse than no ad.
     ============================================================ */
  houseAds: [],

  /* ============================================================
     AFFILIATE — fill this in ONCE and every product link in the app
     starts earning. Previously the tag lived on each of ~50 products,
     which is why it never got done.

     Easiest first step by a wide margin:
       sovrnId  — Sovrn Commerce (was Skimlinks). One id, and links to
                  thousands of merchants are monetised automatically
                  with no per-merchant applications. Get this working
                  before the others: the direct programmes want traffic
                  you do not have yet.

     Then, when they will have you:
       amazonTag — Amazon Associates, e.g. 'yourname-21'. Applied to
                   every amazon.* link automatically.
       awinAffId / shareasaleUserId / rakutenId — your publisher id on
                   each network. These also need the MERCHANT id per
                   retailer, which goes in `merchants` below.

     Leave anything blank and links pass through untouched. A missing
     tag must never produce a broken link.
     ============================================================ */
  affiliate: {
    /* ---- YOUR publisher ids, one per network. See AFFILIATE.md. ---- */
    sovrnId: '',                // Sovrn Commerce key — the catch-all for every shop below that is not switched on
    awinAffId: '',              // Awin publisher id
    adtractionChannelId: '',    // Adtraction channel id (the "as" number in your tracking links)
    tradedoublerSiteId: '',     // Tradedoubler site id (the "a" number)
    amazonTag: '',
    shareasaleUserId: '',
    rakutenId: '',

    /* ---- the shops FitChecker links to, by domain (no www.) ----
       Nothing here earns until BOTH are true:
         1. your publisher id for that network is filled in above, and
         2. you have been ACCEPTED into that shop's programme and set on: true.
       Until then the shop's links go through Sovrn (if set) or stay plain.

       mid / p / a values marked "public" are the shops' own programme ids,
       read from the networks' public directories on 2026-09-14. Confirm
       them in your network dashboard after joining — programmes move.

       Networks:  awin → mid      adtraction → a (ad id from your link)
                  tradedoubler → p     impact → link (your tracking link)  */
    merchants: {
      // Awin
      'uniqlo.com':   { network: 'awin', mid: '21364', on: false },   // public: Uniqlo SE
      'nike.com':     { network: 'awin', mid: '16339', on: false },   // public: Nike SE
      'adidas.se':    { network: 'awin', mid: '77020', on: false },   // public: adidas SE
      'asos.com':     { network: 'awin', mid: '',      on: false },   // on Awin — find ASOS's id after joining
      'zalando.se':   { network: 'awin', mid: '',      on: false },   // Zalando runs on Awin in most of Europe; confirm for SE

      // Adtraction (the big Nordic network)
      'junkyard.com': { network: 'adtraction', a: '', on: false },    // Junkyard SE — 8% reported; copy the ad id from your link

      // Tradedoubler
      'boozt.com':    { network: 'tradedoubler', p: '227648', on: false }, // public: Boozt.com Nordic programme

      // Impact — each brand gives you a whole tracking link
      'levi.com':     { network: 'impact', link: '', on: false },     // Levi's EU is managed on Impact
      'carhartt-wip.com': { network: 'impact', link: '', on: false }  // check: Carhartt (US) is on Impact; WIP may differ

      /* Not listed on purpose — Sovrn covers them if it accepts you:
         H&M, COS, Arket, Weekday, & Other Stories, Monki (H&M Group),
         Mango, GANT, Lacoste, Ralph Lauren, Arc'teryx, Fjällräven,
         The North Face, lululemon, Gymshark, Reformation, Free People,
         AllSaints, Stüssy, Suitsupply, Filippa K, Tommy Hilfiger.
         Zara has no affiliate programme; Bershka, Pull&Bear and Massimo
         Dutti (also Inditex) could not be confirmed. Vinted and Beyond
         Retro are second-hand — kept because they help people, not
         because they pay. */
    }
  },

  /* ============================================================
     THE OTHER APPS — where each one lives once deployed.

     Cross-promotion renders NOTHING while these are blank, because a
     card that cannot be tapped is just clutter. Fill them in as each
     app goes live and the family links itself together.
     ============================================================ */
  familyUrls: {
    aura: '', dewy: '', muse: '', fitcheck: '',
    pantri: '', swoon: '', nuzzle: ''
  }
};
