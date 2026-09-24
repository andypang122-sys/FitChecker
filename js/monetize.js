'use strict';
/* ============================================================
   Money — the monetisation layer (shared across all six apps).

   REWRITTEN. The old model was a daily limit: you got N free
   actions a day and hit a wall. That annoys people before they
   have seen anything worth paying for, and it caps nothing that
   matters — the scan is cheap, the advice is the product.

   The model now:

     1. The core action stays free. You always get your result.
     2. The *fix* is what's paid — the routine, the plan, the
        exact readings, the history. Free users see it blurred
        behind a lock, so they know precisely what they're
        buying. `Money.lock(el)` is the whole mechanic.
     3. A 3-day free trial converts far better than a hard wall.
     4. Annual is the headline price, monthly is the fallback.
        Most revenue in this category is annual.
     5. All Access unlocks every app for one price — the point
        of the shared Account layer.

   Entitlement is owned by Account (account.js) so one purchase
   follows the user across apps. Money is the UI on top of it.

   To go live: paste your Paddle / Lemon Squeezy / Stripe links
   into CFG.checkout, and your AdSense ids into CFG.adClient.
   Real purchases must be confirmed server-side — the local flag
   alone is trivially faked.

   Until that is true, set `paid: false` in app-config's money
   block. Everything Pro would unlock is simply open, and no
   price, trial, meter, lock or ad is ever shown. A paywall with
   nothing behind it charges honest users in friction and earns
   nothing from anyone else.
   ============================================================ */

const Money = (() => {

  /* ---- configuration ----
     This file is byte-identical in every app. Everything that varies
     lives in js/app-config.js, which each app loads first. ---------- */
  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const M   = APP.money || {};
  const CFG = Object.assign({
    app:        APP.id      || 'app',
    noun:       'scan',
    nounPlural: 'scans',
    proName:    (APP.name ? APP.name + ' Pro' : 'Pro'),
    accentFallback: APP.accent || '#c9a6f0',

    // Anti-abuse backstop only. The real paywall is the result lock,
    // not this number — keep it generous.
    freePerDay: 3,

    // What Pro actually unlocks, in the user's words.
    perks: ['Everything unlocked', 'Your full history', 'No ads, ever ✦'],

    plans: {
      annual:    { id: 'annual',    label: 'Annual',     price: '$39.99', period: 'year',  note: 'Best value', save: 'Save 52%' },
      monthly:   { id: 'monthly',   label: 'Monthly',    price: '$6.99',  period: 'month', note: 'Cancel anytime' },
      allaccess: { id: 'allaccess', label: 'All Access', price: '$9.99',  period: 'month', note: 'Unlocks all six apps with one login' }
    },
    defaultPlan: 'annual',

    // ← paste your Paddle / Lemon Squeezy / Stripe checkout links
    checkout: { annual: '', monthly: '', allaccess: '' },

    adClient: APP.adClient || '',
    adSlots:  { home: '', content: '' }
  }, M);

  /* Derived, for the call sites written against the old single-price
     config. `plans` replaced proPrice/proPeriod, but several views
     still read them — keeping them in step costs nothing and means no
     app.js had to be edited to accommodate the rewrite. */
  CFG.proPrice  = CFG.proPrice  || CFG.plans.monthly.price;
  CFG.proPeriod = CFG.proPeriod || CFG.plans.monthly.period;

  const METER_KEY = CFG.app + '_meter';

  /* ---- entitlement is Account's job; fall back if it isn't loaded --------- */
  function acct() { return (typeof Account !== 'undefined') ? Account : null; }

  /* Muse and Pantri kept Pro on their own Store prefs rather than a
     localStorage flag. CFG.legacyPro lets those apps hand us a reader
     so existing paying users aren't silently downgraded. */
  function legacyPro() {
    if (typeof CFG.legacyPro === 'function') { try { return !!CFG.legacyPro(); } catch (e) { return false; } }
    try { const p = JSON.parse(localStorage.getItem(CFG.app + '_pro')); return !!(p && p.active); } catch (e) { return false; }
  }
  // false = no paid tier at all: every Pro feature is open, and nothing
  // that sells (price, trial, meter, lock, ad) is rendered.
  function paidOn() { return CFG.paid !== false; }

  // Dev-only affordances (the "unlock for testing" preview) must never
  // reach a real user just because checkout isn't wired yet.
  function isLocalDev() {
    try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch (e) { return false; }
  }

  function isPro() {
    if (!paidOn()) return true;
    const a = acct();
    if (a && a.hasPro()) return true;
    return legacyPro();
  }
  function setPro(on) {
    const a = acct();
    if (a) { on ? a.grant('pro') : a.revoke(); return; }
    try { localStorage.setItem(CFG.app + '_pro', JSON.stringify({ active: !!on, since: Date.now() })); } catch (e) {}
  }
  function inTrial()      { const a = acct(); return a ? a.inTrial() : false; }
  function trialDaysLeft(){ const a = acct(); return a ? a.trialDaysLeft() : 0; }
  function trialAvailable(){ const a = acct(); return a ? (!a.trialUsed() && !a.hasPro()) : true; }

  /* ---- day + meter (backstop only) --------------------------------------- */
  function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function readMeter() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(METER_KEY)); } catch (e) {}
    if (!m || m.day !== today()) m = { day: today(), used: 0, bonus: 0 };
    return m;
  }
  function writeMeter(m) { try { localStorage.setItem(METER_KEY, JSON.stringify(m)); } catch (e) {} }
  function remaining() { if (isPro()) return Infinity; const m = readMeter(); return Math.max(0, CFG.freePerDay + m.bonus - m.used); }
  function canUse()   { return isPro() || remaining() > 0; }
  function consume()  { if (isPro()) return; const m = readMeter(); m.used += 1; writeMeter(m); }
  function grantBonus(n) { const m = readMeter(); m.bonus += (n || 1); writeMeter(m); }
  function config()   { return CFG; }

  function creditsBadgeHTML() {
    if (!paidOn()) return '';
    if (isPro()) {
      if (inTrial()) { const d = trialDaysLeft(); return `<span class="credit-pill pro">✦ Trial — ${d} day${d === 1 ? '' : 's'} left</span>`; }
      return `<span class="credit-pill pro">✦ ${esc(CFG.proName)}</span>`;
    }
    const r = remaining();
    return `<span class="credit-pill ${r === 0 ? 'empty' : ''}">${r} free ${r === 1 ? CFG.noun : CFG.nounPlural} left today</span>`;
  }

  /* ==========================================================
     THE LOCK — the core of the new model.

     Wrap any element that holds the paid payload. Free users
     see it blurred with a clear label of what's underneath;
     Pro users see it untouched.

       Money.lock(el, { title, sub })

     Call it after you render the result. It is idempotent, so
     re-rendering the same view is safe.
     ========================================================== */
  function lock(el, opts) {
    if (!el) return false;
    const o = opts || {};
    const existing = el.querySelector(':scope > .lock-veil');
    if (isPro()) { if (existing) existing.remove(); el.classList.remove('is-locked'); return false; }
    if (existing) return true;

    el.classList.add('is-locked');
    const veil = document.createElement('div');
    veil.className = 'lock-veil';
    veil.innerHTML = `
      <div class="lock-card">
        <div class="lock-icon">✦</div>
        <h4>${esc(o.title || 'Your full result is ready')}</h4>
        <p class="muted">${esc(o.sub || 'Unlock ' + CFG.proName + ' to see it.')}</p>
        <button class="btn btn-accent btn-lg lock-cta">${trialAvailable() ? 'Start 3-day free trial' : 'Unlock ' + esc(CFG.proName)}</button>
        <button class="btn btn-ghost btn-sm lock-alt">See what's included</button>
      </div>`;
    el.appendChild(veil);
    veil.querySelector('.lock-cta').onclick = () => trialAvailable() ? beginTrial() : showPaywall({ reason: o.title });
    veil.querySelector('.lock-alt').onclick = () => showPaywall({ reason: o.title });
    return true;
  }

  /* Remove every lock on the page — call after an upgrade. */
  function unlockAll() {
    document.querySelectorAll('.lock-veil').forEach(v => v.remove());
    document.querySelectorAll('.is-locked').forEach(e => e.classList.remove('is-locked'));
  }

  function beginTrial() {
    const a = acct();
    if (!a) { setPro(true); unlockAll(); toast('Unlocked ✦'); return; }
    if (a.startTrial()) {
      unlockAll();
      toast(`Trial started — ${a.trialDaysLeft()} days of ${CFG.proName} ✦`);
      celebrate();
      setTimeout(() => { if (window.__render) window.__render(); }, 300);
    } else {
      showPaywall({ reason: 'Your trial has ended' });
    }
  }

  function celebrate() {
    const n = document.createElement('div');
    n.className = 'trial-pop';
    n.innerHTML = `<div class="trial-pop-in"><div class="tp-mark">✦</div><strong>${esc(CFG.proName)} unlocked</strong><span>Everything's open for ${trialDaysLeft()} days.</span></div>`;
    (document.getElementById('modal-root') || document.body).appendChild(n);
    setTimeout(() => { n.classList.add('leaving'); setTimeout(() => n.remove(), 300); }, 2200);
  }

  /* ==========================================================
     Ad slots — free users only.

     The implementation moved to ads.js, which added lazy loading, five
     placement types, video creatives and a fill chain that backs up an
     unsold network slot with your own affiliate creative. These two
     functions stay as the public names because every screen in every
     app already calls them; delegating here meant no app.js had to be
     touched to gain all of that.

     ads.js is optional. If it isn't loaded, this falls back to the
     original single display unit so nothing breaks.
     ========================================================== */
  function bannerHTML(slot) {
    if (isPro()) return '';
    if (typeof Ads !== 'undefined') return Ads.bannerHTML(slot);
    return legacyBanner(slot);
  }
  function wireAds(container) {
    if (isPro() || !container) return;
    if (typeof Ads !== 'undefined') { Ads.wire(container); return; }
    container.querySelectorAll('.ad-ph[data-upsell]').forEach(el => el.onclick = () => showPaywall({ reason: 'Remove ads' }));
  }
  function legacyBanner(slot) {
    const unit = (CFG.adSlots && CFG.adSlots[slot]) || '';
    if (CFG.adClient && unit) {
      return `<div class="ad-wrap"><span class="ad-tag">Ad</span>
        <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(CFG.adClient)}" data-ad-slot="${esc(unit)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
      </div>`;
    }
    return `<div class="ad-wrap ad-ph" role="complementary" aria-label="Advertisement" data-upsell="1">
      <span class="ad-tag">Ad</span>
      <div class="ad-ph-inner"><span>Your ad here</span><span class="ad-ph-sub">${esc(CFG.proName)} removes ads</span></div>
    </div>`;
  }

  /* ==========================================================
     Paywall — now a plan picker, not a wall.
     ========================================================== */
  let picked = CFG.defaultPlan;

  function planRowHTML(p, isPicked) {
    return `<button class="plan-row${isPicked ? ' picked' : ''}" data-plan="${esc(p.id)}" role="radio" aria-checked="${isPicked}">
        <span class="plan-tick" aria-hidden="true"></span>
        <span class="plan-main">
          <span class="plan-label">${esc(p.label)}${p.save ? ` <span class="plan-save">${esc(p.save)}</span>` : ''}</span>
          <span class="plan-note">${esc(p.note || '')}</span>
        </span>
        <span class="plan-price">${esc(p.price)}<span>/${esc(p.period)}</span></span>
      </button>`;
  }

  function showPaywall(optsOrCb) {
    // Back-compat: old call sites pass a callback.
    const onGranted = typeof optsOrCb === 'function' ? optsOrCb : (optsOrCb && optsOrCb.onGranted);
    const o = (typeof optsOrCb === 'object' && optsOrCb) ? optsOrCb : {};
    if (!paidOn()) { if (onGranted) onGranted(); return { close() {} }; }
    picked = CFG.defaultPlan;

    const root = document.getElementById('modal-root') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'paywall-scrim';
    const canTrial = trialAvailable();
    wrap.innerHTML = `
      <div class="paywall" role="dialog" aria-modal="true" aria-label="${esc(CFG.proName)}">
        <button class="paywall-x" aria-label="Close">×</button>
        <div class="paywall-top">
          <div class="paywall-emoji">✦</div>
          <h3>${esc(o.reason || 'Unlock your full result')}</h3>
          <p class="muted">${canTrial
            ? `Try <strong>${esc(CFG.proName)}</strong> free for 3 days. Cancel before it ends and you pay nothing.`
            : `Get everything ${esc(CFG.proName)} unlocks.`}</p>
        </div>

        <ul class="pro-perks">${CFG.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>

        <div class="plan-picker" role="radiogroup" aria-label="Choose a plan">
          ${planRowHTML(CFG.plans.annual,  picked === 'annual')}
          ${planRowHTML(CFG.plans.monthly, picked === 'monthly')}
          <div class="plan-sep"><span>or unlock everything</span></div>
          ${planRowHTML(CFG.plans.allaccess, picked === 'allaccess')}
        </div>

        <button class="btn btn-accent btn-lg" id="pw-go">${canTrial ? 'Start free trial' : 'Continue'}</button>
        ${canTrial ? `<p class="paywall-fine">3 days free, then <span id="pw-then">${esc(CFG.plans[picked].price)}/${esc(CFG.plans[picked].period)}</span>. Cancel anytime.</p>`
                   : `<p class="paywall-fine">Cancel anytime.${CFG.checkout[picked] ? '' : ' Checkout not wired yet — this is a preview.'}</p>`}
      </div>`;
    root.appendChild(wrap);
    document.body.classList.add('modal-open');

    const close = () => { wrap.classList.add('leaving'); setTimeout(() => { wrap.remove(); document.body.classList.remove('modal-open'); }, 200); };
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.querySelector('.paywall-x').onclick = close;

    wrap.querySelectorAll('.plan-row').forEach(row => {
      row.onclick = () => {
        picked = row.dataset.plan;
        wrap.querySelectorAll('.plan-row').forEach(r => {
          const on = r.dataset.plan === picked;
          r.classList.toggle('picked', on); r.setAttribute('aria-checked', String(on));
        });
        const then = wrap.querySelector('#pw-then');
        if (then) then.textContent = CFG.plans[picked].price + '/' + CFG.plans[picked].period;
      };
    });

    wrap.querySelector('#pw-go').onclick = () => {
      close();
      if (canTrial) { beginTrial(); if (onGranted) onGranted(); return; }
      startCheckout(picked, onGranted);
    };
    return { close };
  }

  /* Rewarded ad kept for the free tier's "one more today" escape.
     ads.js upgrades this to play a real video creative when one is
     configured; without it the simulated countdown below still runs so
     the reward path works in development. */
  function playRewardedAd(done) {
    if (typeof Ads !== 'undefined' && Ads.CFG && (Ads.CFG.house || []).some(h => h.type === 'video')) {
      return Ads.rewarded(done);
    }
    return simulatedRewardedAd(done);
  }
  function simulatedRewardedAd(done) {
    const ov = document.createElement('div');
    ov.className = 'rewarded-scrim';
    let left = 5;
    ov.innerHTML = `
      <div class="rewarded">
        <div class="rw-badge">Ad</div>
        <div class="rw-body">
          <div class="rw-spin"></div>
          <div class="rw-title">Your reward is loading…</div>
          <div class="rw-count" id="rw-count">${left}s</div>
          <div class="rw-hint">A real rewarded video plays here once AdMob is connected.</div>
        </div>
        <button class="rw-skip" id="rw-skip" disabled>Skip</button>
      </div>`;
    (document.getElementById('modal-root') || document.body).appendChild(ov);
    const countEl = ov.querySelector('#rw-count');
    const skip = ov.querySelector('#rw-skip');
    const finish = () => { ov.classList.add('leaving'); setTimeout(() => ov.remove(), 200); toast('+1 unlocked — enjoy ✦'); if (done) done(); };
    const t = setInterval(() => {
      left--; countEl.textContent = left + 's';
      if (left <= 0) { clearInterval(t); skip.disabled = false; skip.textContent = 'Claim reward ✦'; skip.classList.add('ready'); skip.onclick = finish; }
    }, 1000);
  }

  function startCheckout(planId, onDone) {
    const plan = CFG.plans[planId || picked] || CFG.plans[CFG.defaultPlan];
    const url = CFG.checkout[plan.id];
    if (url) {
      const u = new URL(url);
      const a = acct();
      if (a && a.user()) u.searchParams.set('checkout[email]', a.user().email);
      window.open(u.toString(), '_blank', 'noopener');
      confirmAfterCheckout(plan, onDone);
      return;
    }
    // No checkout link: a real user gets an honest "not yet", never the
    // developer's instructions or a free unlock button.
    if (!isLocalDev()) { toast(CFG.proName + ' isn\'t on sale yet.'); return; }
    const root = document.getElementById('modal-root') || document.body;
    const w = document.createElement('div'); w.className = 'paywall-scrim';
    w.innerHTML = `<div class="paywall"><button class="paywall-x">×</button>
      <div class="paywall-top"><div class="paywall-emoji">🔗</div><h3>Checkout not connected yet</h3>
      <p class="muted">Paste your ${esc(plan.label)} link into <code>CFG.checkout.${esc(plan.id)}</code> in <code>monetize.js</code> and this button sends buyers straight there.</p></div>
      <button class="btn btn-accent btn-lg" id="pw-preview">Preview ${esc(plan.label)} (unlock for testing)</button>
      <button class="btn btn-ghost" id="pw-cancel">Not now</button></div>`;
    root.appendChild(w); document.body.classList.add('modal-open');
    const close = () => { w.remove(); document.body.classList.remove('modal-open'); };
    w.querySelector('.paywall-x').onclick = close; w.querySelector('#pw-cancel').onclick = close;
    w.querySelector('#pw-preview').onclick = () => {
      const a = acct();
      if (a) a.setEntitlement({ plan: plan.id === 'allaccess' ? 'allaccess' : 'pro', apps: plan.id === 'allaccess' ? [] : [CFG.app], source: 'preview' });
      else setPro(true);
      close(); unlockAll(); toast(CFG.proName + ' unlocked — ads off, no limits ✦');
      if (onDone) onDone();
      setTimeout(() => location.reload(), 600);
    };
  }

  function confirmAfterCheckout(plan, onDone) {
    setTimeout(() => {
      const root = document.getElementById('modal-root') || document.body;
      const w = document.createElement('div'); w.className = 'paywall-scrim';
      w.innerHTML = `<div class="paywall"><div class="paywall-top"><div class="paywall-emoji">✦</div>
        <h3>Finished checkout?</h3><p class="muted">Once your payment clears, ${esc(CFG.proName)} unlocks here.</p></div>
        <button class="btn btn-accent btn-lg" id="pw-done">I've upgraded — unlock</button>
        <button class="btn btn-ghost" id="pw-later">Later</button></div>`;
      root.appendChild(w); document.body.classList.add('modal-open');
      const close = () => { w.remove(); document.body.classList.remove('modal-open'); };
      w.querySelector('#pw-later').onclick = close;
      w.querySelector('#pw-done').onclick = () => {
        const a = acct();
        if (a) a.setEntitlement({ plan: plan.id === 'allaccess' ? 'allaccess' : 'pro', apps: plan.id === 'allaccess' ? [] : [CFG.app], source: 'checkout' });
        else setPro(true);
        close(); if (onDone) onDone(); location.reload();
      };
    }, 800);
  }

  /* ==========================================================
     Settings card
     ========================================================== */
  function proCardHTML() {
    if (!paidOn()) return '';
    if (isPro()) {
      const trial = inTrial();
      return `<div class="card pro-card is-pro">
        <div class="pro-badge">✦ ${trial ? 'Free trial' : esc(CFG.proName)}</div>
        <h3>${trial ? `${trialDaysLeft()} day${trialDaysLeft() === 1 ? '' : 's'} of ${esc(CFG.proName)} left` : `You're on ${esc(CFG.proName)}`}</h3>
        <p class="muted">${trial
          ? 'Everything is unlocked. Pick a plan any time to keep it after the trial.'
          : 'Unlimited ' + esc(CFG.nounPlural) + ', no ads. Thank you for supporting the app ✦'}</p>
        ${trial ? `<button class="btn btn-accent" id="pro-go">Choose a plan</button>` : ''}
        <button class="btn btn-ghost" id="pro-cancel">${trial ? 'End trial' : 'Cancel / restore free'}</button>
      </div>`;
    }
    return `<div class="card pro-card">
      <div class="pro-head"><h3>${esc(CFG.proName)}</h3><span class="pro-price">${esc(CFG.plans.annual.price)}<span>/${esc(CFG.plans.annual.period)}</span></span></div>
      <p class="muted">${trialAvailable() ? 'Try it free for 3 days — cancel before it ends and you pay nothing.' : 'Unlock the full fix, your history and an ad-free app.'}</p>
      <ul class="pro-perks">${CFG.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <button class="btn btn-accent btn-lg" id="pro-go">${trialAvailable() ? 'Start 3-day free trial' : 'Go ' + esc(CFG.proName)}</button>
    </div>`;
  }
  function wireProCard(container) {
    if (!container) return;
    const go = container.querySelector('#pro-go');
    if (go) go.onclick = () => (trialAvailable() && !isPro()) ? beginTrial() : showPaywall({ reason: 'Choose your plan' });
    const cancel = container.querySelector('#pro-cancel');
    if (cancel) cancel.onclick = () => {
      const a = acct(); if (a) a.revoke(); else setPro(false);
      toast('Back on the free plan'); setTimeout(() => location.reload(), 400);
    };
  }

  function esc(s) { if (window.__esc) return window.__esc(s); return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(m) { if (window.__toast) return window.__toast(m); }

  return {
    isPro, paidOn, setPro, remaining, canUse, consume, grantBonus, config,
    creditsBadgeHTML, bannerHTML, wireAds, showPaywall, startCheckout,
    proCardHTML, wireProCard, playRewardedAd, toast,

    /* the lock model */
    lock, unlockAll, beginTrial, inTrial, trialDaysLeft, trialAvailable,

    /* ---- compatibility aliases ----
       Muse and Pantri were built against an earlier, differently
       named API. Aliasing here means one monetize.js serves all six
       apps and none of their call sites need touching. */
    left:       remaining,
    canAnalyze: canUse,
    canMatch:   canUse,
    spend:      consume,
    rewarded:   playRewardedAd,
    wirePro:    (view, after) => { wireProCard(view); if (typeof after === 'function') after(); },
    get PRICE() { return CFG.plans.monthly.price; }
  };
})();

if (typeof window !== 'undefined') window.Money = Money;
