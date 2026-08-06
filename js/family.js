'use strict';
/* ============================================================
   Family — the other apps, offered when they are actually relevant.

   Seven apps share one account layer and one All Access price, and
   none of them has ever mentioned the others. That is the cheapest
   growth channel in the whole portfolio going unused: a Dewy user
   tracking a skincare routine is *precisely* the person who wants
   Aura to tell them whether it is working, and they will never find
   out.

   It is also worth more than the ad slots. A house cross-promo
   converts at a rate display advertising cannot touch, and it pays
   100% instead of a fraction of a penny per impression — while
   pushing people towards All Access, which is the highest-value
   thing anyone can buy here.

   TWO RULES, because this is the sort of feature that ruins an app
   when done greedily:

   1. RELEVANCE OVER INVENTORY. Each app declares which other apps
      genuinely follow from it and why. Nuzzle does not advertise
      makeup shade-matching; it has nothing to do with pets, and
      offering it makes the app feel like a billboard.

   2. IT STOPS ASKING. If somebody dismisses a suggestion, it is not
      shown again. If they already own All Access, none of this
      renders at all — they have everything, and selling to a paying
      customer is how you annoy the person already paying you.
   ============================================================ */

const Family = (() => {

  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const ME = APP.id || 'app';

  /* The catalogue. `base` is where each app lives once deployed —
     filled in from config so the family works on any domain. */
  const APPS = {
    aura:     { name: 'Aura',     emoji: '✨', tag: 'AI skin analysis & glow score',
                blurb: 'Scores your skin from a selfie and tracks whether it is actually improving.' },
    dewy:     { name: 'Dewy',     emoji: '🧴', tag: 'Your skincare routine, built properly',
                blurb: 'Builds an AM and PM routine around your skin, and warns you when two products fight.' },
    muse:     { name: 'Muse',     emoji: '💄', tag: 'Recreate any makeup look',
                blurb: 'Reads the real shades out of a photo and finds them at every price.' },
    fitcheck: { name: 'FitCheck', emoji: '👕', tag: 'Know your size before you buy',
                blurb: 'Works out your size in a specific brand, and how likely it is to come back.' },
    pantri:   { name: 'Pantri',   emoji: '🍳', tag: 'Cook what you have',
                blurb: 'Turns what is in your fridge into something worth eating, and counts the calories.' },
    swoon:    { name: 'Swoon',    emoji: '💝', tag: 'Never forget a gift again',
                blurb: 'Remembers the dates that matter and knows what they would actually like.' },
    nuzzle:   { name: 'Nuzzle',   emoji: '🐾', tag: 'Pet health, feeding & care',
                blurb: 'Real vet feeding maths for 20 species, and tells you when something is urgent.' }
  };

  /* Which app follows from which, and — the important part — WHY.
     The reason is shown to the user, because "you might also like"
     is advertising and "this answers the next question you have" is
     a recommendation. */
  const PATHS = {
    aura:     [['dewy', 'Aura scores your skin. Dewy builds the routine that changes it.'],
               ['muse', 'Now you know your skin — Muse matches makeup to it.']],
    dewy:     [['aura', 'You have the routine. Aura measures whether it is working.'],
               ['muse', 'Skincare sorted? Muse handles the rest of the face.']],
    muse:     [['dewy', 'Good makeup sits better on skin that is looked after.'],
               ['aura', 'See what your skin is actually doing underneath.']],
    fitcheck: [['pantri', 'Tracking your body? Pantri tracks what goes in.'],
               ['swoon', 'You know their size now — Swoon knows what to buy.']],
    pantri:   [['fitcheck', 'Eating well and the clothes fit differently. FitCheck keeps up.'],
               ['nuzzle', 'Feeding yourself properly? Nuzzle does the maths for the pets.']],
    swoon:    [['muse', 'Stuck for a gift? Muse finds what they would actually wear.'],
               ['fitcheck', 'Buying them clothes is only safe if you know the size.']],
    nuzzle:   [['pantri', 'The pets are sorted. Pantri sorts dinner.'],
               ['swoon', 'Swoon remembers the human birthdays too.']]
  };

  const KEY = ME + '_family';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  function dismissed(id) { return !!(read().hidden || {})[id]; }
  function dismiss(id) {
    const s = read(); s.hidden = s.hidden || {}; s.hidden[id] = Date.now(); write(s);
  }

  function urlFor(id) {
    const bases = APP.familyUrls || {};
    return bases[id] || '';
  }

  function hasAllAccess() {
    try {
      if (window.Account && Account.hasPro) {
        /* All Access is the entitlement that spans apps; a single-app
           Pro should still see the family, because upgrading is
           exactly what we would want them to do. */
        const e = Account.entitlement ? Account.entitlement() : null;
        if (e && e.plan === 'allaccess') return true;
      }
    } catch (e) {}
    return false;
  }

  /* The next app to suggest, or null when there is nothing honest to
     say. Returns at most one — a wall of other apps reads as desperate. */
  function next() {
    if (hasAllAccess()) return null;
    const paths = PATHS[ME] || [];
    for (let i = 0; i < paths.length; i++) {
      const [id, why] = paths[i];
      if (dismissed(id)) continue;
      const url = urlFor(id);
      const app = APPS[id];
      if (!app) continue;
      return Object.assign({ id, why, url }, app);
    }
    return null;
  }

  function all() {
    return Object.keys(APPS).filter(id => id !== ME).map(id =>
      Object.assign({ id, url: urlFor(id) }, APPS[id]));
  }

  /* ---------- rendering ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* A single contextual card. Renders nothing at all when there is
     nothing relevant — an empty slot is better than a filled one. */
  function cardHTML(opts) {
    opts = opts || {};
    const n = next();
    if (!n) return '';
    /* Without a URL there is nowhere to send anyone, so saying nothing
       is the only honest option until the apps are actually deployed. */
    if (!n.url) return '';

    return `
      <div class="fam-card" data-fam="${esc(n.id)}">
        <button class="fam-x" data-fam-x="${esc(n.id)}" aria-label="Not interested">&times;</button>
        <div class="fam-top">
          <span class="fam-emoji">${n.emoji}</span>
          <div class="fam-head">
            <strong>${esc(n.name)}</strong>
            <span class="fam-tag">${esc(n.tag)}</span>
          </div>
        </div>
        <p class="fam-why">${esc(n.why)}</p>
        <a class="fam-go" href="${esc(n.url)}" target="_blank" rel="noopener">Open ${esc(n.name)} &rarr;</a>
        ${opts.allAccess !== false ? `<p class="fam-aa">Or unlock every app with one login &mdash;
          <button class="linklike" data-fam-aa="1">see All Access</button></p>` : ''}
      </div>`;
  }

  /* The full list, for a Settings screen — no dismissal, no pressure. */
  function listHTML() {
    const items = all().filter(a => a.url);
    if (!items.length) return '';
    return `
      <div class="fam-list">
        ${items.map(a => `
          <a class="fam-row" href="${esc(a.url)}" target="_blank" rel="noopener">
            <span class="fam-emoji">${a.emoji}</span>
            <span class="fam-row-main"><strong>${esc(a.name)}</strong><span>${esc(a.blurb)}</span></span>
            <span class="fam-arrow">&rarr;</span>
          </a>`).join('')}
      </div>`;
  }

  function wire(container) {
    if (!container) return;
    container.querySelectorAll('[data-fam-x]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      dismiss(b.getAttribute('data-fam-x'));
      const card = b.closest('.fam-card');
      if (card) card.remove();
    });
    container.querySelectorAll('[data-fam-aa]').forEach(b => b.onclick = e => {
      e.preventDefault();
      try { Money.showPaywall({ reason: 'All Access', plan: 'allaccess' }); } catch (err) {}
    });
  }

  return { APPS, PATHS, next, all, cardHTML, listHTML, wire, dismiss, dismissed, urlFor, hasAllAccess };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Family;
if (typeof window !== 'undefined') window.Family = Family;
