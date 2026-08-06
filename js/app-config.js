'use strict';
/* FitCheck — see Aura/js/app-config.js for the full field guide.

   Note on pricing: the consumer sub is deliberately cheap here.
   FitCheck's real revenue is the merchant side (per-store
   integration to cut returns) — consumer scans are the data that
   makes the fit engine worth paying for. Don't over-monetise the
   consumer and starve the dataset. */

window.APP_CONFIG = {
  id:     'fitcheck',
  name:   'FitCheck',
  accent: '#b86436',
  icon:   'icons/icon-192.png',

  backend: { url: '', anonKey: '' },

  trialDays: 3,
  listEndpoint: '',
  adClient: '',

  money: {
    noun: 'check', nounPlural: 'checks',
    proName: 'FitCheck Pro',
    freePerDay: 5,
    perks: [
      'Fit verdict on any item, at any brand',
      'Where it will pull — shoulders, waist, length',
      'Saved profiles for the people you shop for',
      'Full wardrobe history & no ads ✦'
    ],
    plans: {
      annual:    { id: 'annual',    label: 'Annual',     price: '$24.99', period: 'year',  note: 'Just $2.08/mo — best value', save: 'Save 58%' },
      monthly:   { id: 'monthly',   label: 'Monthly',    price: '$4.99',  period: 'month', note: 'Cancel anytime' },
      allaccess: { id: 'allaccess', label: 'All Access', price: '$9.99',  period: 'month', note: 'Unlocks all six apps with one login' }
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
    sovrnId: '',
    amazonTag: '',
    awinAffId: '',
    shareasaleUserId: '',
    rakutenId: '',
    /* Per-merchant overrides, keyed by domain (no www.):
         'boots.com': { network: 'awin', mid: '1234' }          */
    merchants: {}
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
