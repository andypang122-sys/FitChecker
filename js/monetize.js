'use strict';
/* ============================================================
   Money — the monetisation layer (shared across Dewy / Swoon /
   FitCheck). Two revenue streams, both device-local:

     1. A daily free limit on the core action. Past the limit a
        user either waits until tomorrow, watches a rewarded ad
        for one more, or upgrades to Pro (removes limit + ads).
     2. Ad slots (banner / in-content) shown only to free users.

   Everything here is a working placeholder you can demo today.
   To go live you swap two things:
     • CFG.checkoutUrl → your Paddle / Lemon Squeezy / Stripe link
     • CFG.adClient + the slot ids → your Google AdSense units
       (and paste the AdSense <script> into index.html <head>).
   Real purchases should be confirmed server-side before calling
   Money.setPro(true); the local flag alone is easy to fake.
   ============================================================ */

const Money = (() => {

  /* ---- per-app configuration (the ONLY block that changes app to app) ---- */
  const CFG = {
    app:        'fitcheck',
    noun:       'fit check',         // singular label for the gated action
    nounPlural: 'fit checks',
    freePerDay: 2,                   // free uses of the core action per day
    proName:    'FitCheck Pro',
    proPrice:   '$5',
    proPeriod:  'month',
    checkoutUrl:'',                  // ← paste your Paddle / Lemon Squeezy link
    accentFallback: '#b86436',
    perks: [
      'Unlimited fit checks',
      'No ads, ever',
      'Every size recommendation & saved analysis',
      'Support an independent maker'
    ],
    // Google AdSense — paste your publisher id + slot ids to switch ads on.
    adClient: '',                    // e.g. 'ca-pub-1234567890123456'
    adSlots:  { home: '', content: '' }
  };

  const METER_KEY = CFG.app + '_meter';
  const PRO_KEY   = CFG.app + '_pro';

  /* ---- day + meter -------------------------------------------------------- */
  function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function readMeter() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(METER_KEY)); } catch (e) {}
    if (!m || m.day !== today()) m = { day: today(), used: 0, bonus: 0 };
    return m;
  }
  function writeMeter(m) { try { localStorage.setItem(METER_KEY, JSON.stringify(m)); } catch (e) {} }

  /* ---- Pro state ---------------------------------------------------------- */
  function isPro() { try { const p = JSON.parse(localStorage.getItem(PRO_KEY)); return !!(p && p.active); } catch (e) { return false; } }
  function setPro(on) { try { localStorage.setItem(PRO_KEY, JSON.stringify({ active: !!on, since: Date.now() })); } catch (e) {} }

  /* ---- allowance ---------------------------------------------------------- */
  function remaining() { if (isPro()) return Infinity; const m = readMeter(); return Math.max(0, CFG.freePerDay + m.bonus - m.used); }
  function canUse()   { return isPro() || remaining() > 0; }
  function consume()  { if (isPro()) return; const m = readMeter(); m.used += 1; writeMeter(m); }
  function grantBonus(n) { const m = readMeter(); m.bonus += (n || 1); writeMeter(m); }
  function config()   { return CFG; }

  /* small pill you can drop next to the "start" button */
  function creditsBadgeHTML() {
    if (isPro()) return `<span class="credit-pill pro">✦ ${esc(CFG.proName)}</span>`;
    const r = remaining();
    return `<span class="credit-pill ${r === 0 ? 'empty' : ''}">${r} free ${r === 1 ? CFG.noun : CFG.nounPlural} left today</span>`;
  }

  /* ==========================================================
     Ad slots — shown to free users only.
     Renders a styled placeholder now; becomes a real AdSense
     unit the moment CFG.adClient + the slot id are filled in.
     ========================================================== */
  function bannerHTML(slot) {
    if (isPro()) return '';
    const unit = CFG.adSlots[slot] || '';
    if (CFG.adClient && unit) {
      return `<div class="ad-wrap"><span class="ad-tag">Ad</span>
        <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(CFG.adClient)}" data-ad-slot="${esc(unit)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
      </div>`;
    }
    return `<div class="ad-wrap ad-ph" role="complementary" aria-label="Advertisement">
      <span class="ad-tag">Ad</span>
      <div class="ad-ph-inner"><span>Your ad here</span><span class="ad-ph-sub">${esc(CFG.proName)} removes ads</span></div>
    </div>`;
  }
  function wireAds(container) {
    if (isPro() || !CFG.adClient) return;
    container.querySelectorAll('ins.adsbygoogle').forEach(() => {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
    container.querySelectorAll('.ad-ph[data-upsell]').forEach(el => el.onclick = () => showPaywall());
  }

  /* ==========================================================
     Paywall — shown when a free user is out of daily uses.
     Two escapes: watch a rewarded ad for +1, or go Pro.
     ========================================================== */
  function showPaywall(onGranted) {
    const root = document.getElementById('modal-root') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'paywall-scrim';
    wrap.innerHTML = `
      <div class="paywall" role="dialog" aria-modal="true" aria-label="Daily limit reached">
        <button class="paywall-x" aria-label="Close">×</button>
        <div class="paywall-top">
          <div class="paywall-emoji">✦</div>
          <h3>You've used today's free ${esc(CFG.nounPlural)}</h3>
          <p class="muted">You get <strong>${CFG.freePerDay} free every day</strong>. Come back tomorrow, watch a short ad for one more, or go unlimited.</p>
        </div>

        <button class="btn btn-lg paywall-watch" id="pw-watch">
          <span class="pw-play">▶</span> Watch a short ad — unlock 1 more
        </button>

        <div class="paywall-or"><span>or</span></div>

        <div class="paywall-pro">
          <div class="pro-head"><strong>${esc(CFG.proName)}</strong><span class="pro-price">${esc(CFG.proPrice)}<span>/${esc(CFG.proPeriod)}</span></span></div>
          <ul class="pro-perks">${CFG.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
          <button class="btn btn-accent btn-lg" id="pw-pro">Go ${esc(CFG.proName)}</button>
        </div>

        <p class="paywall-fine">Cancel anytime. ${CFG.checkoutUrl ? '' : 'Checkout not wired yet — this is a preview.'}</p>
      </div>`;
    root.appendChild(wrap);
    document.body.classList.add('modal-open');

    const close = () => { wrap.classList.add('leaving'); setTimeout(() => { wrap.remove(); document.body.classList.remove('modal-open'); }, 200); };
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.querySelector('.paywall-x').onclick = close;

    wrap.querySelector('#pw-watch').onclick = () => {
      playRewardedAd(() => { grantBonus(1); close(); if (onGranted) onGranted(); });
    };
    wrap.querySelector('#pw-pro').onclick = () => { close(); startCheckout(); };
    return { close };
  }

  /* Rewarded ad — simulated placeholder. Replace the body with an
     AdMob / AdSense rewarded call; invoke `done()` on completion. */
  function playRewardedAd(done) {
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
    const finish = () => { ov.classList.add('leaving'); setTimeout(() => ov.remove(), 200); toast('+1 unlocked — enjoy ✦'); done(); };
    const t = setInterval(() => {
      left--; countEl.textContent = left + 's';
      if (left <= 0) { clearInterval(t); skip.disabled = false; skip.textContent = 'Claim reward ✦'; skip.classList.add('ready'); skip.onclick = finish; }
    }, 1000);
  }

  function startCheckout() {
    if (CFG.checkoutUrl) { window.open(CFG.checkoutUrl, '_blank', 'noopener'); confirmAfterCheckout(); return; }
    // No checkout wired yet — preview flow so you can see the Pro state.
    const root = document.getElementById('modal-root') || document.body;
    const w = document.createElement('div'); w.className = 'paywall-scrim';
    w.innerHTML = `<div class="paywall"><button class="paywall-x">×</button>
      <div class="paywall-top"><div class="paywall-emoji">🔗</div><h3>Checkout not connected yet</h3>
      <p class="muted">Paste your Paddle / Lemon Squeezy / Stripe link into <code>CFG.checkoutUrl</code> in <code>monetize.js</code> and this button sends buyers straight there.</p></div>
      <button class="btn btn-accent btn-lg" id="pw-preview">Preview ${esc(CFG.proName)} (unlock for testing)</button>
      <button class="btn btn-ghost" id="pw-cancel">Not now</button></div>`;
    root.appendChild(w); document.body.classList.add('modal-open');
    const close = () => { w.remove(); document.body.classList.remove('modal-open'); };
    w.querySelector('.paywall-x').onclick = close; w.querySelector('#pw-cancel').onclick = close;
    w.querySelector('#pw-preview').onclick = () => { setPro(true); close(); toast(CFG.proName + ' unlocked — ads off, no limits ✦'); setTimeout(() => location.reload(), 500); };
  }

  /* After returning from an external checkout, let the buyer confirm. */
  function confirmAfterCheckout() {
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
      w.querySelector('#pw-done').onclick = () => { setPro(true); close(); location.reload(); };
    }, 800);
  }

  /* ==========================================================
     Settings card — manage Pro / see today's allowance.
     ========================================================== */
  function proCardHTML() {
    if (isPro()) {
      return `<div class="card pro-card is-pro">
        <div class="pro-badge">✦ ${esc(CFG.proName)}</div>
        <h3>You're on ${esc(CFG.proName)}</h3>
        <p class="muted">Unlimited ${esc(CFG.nounPlural)}, no ads. Thank you for supporting the app ✦</p>
        <button class="btn btn-ghost" id="pro-cancel">Cancel / restore free</button>
      </div>`;
    }
    const r = remaining();
    return `<div class="card pro-card">
      <div class="pro-head"><h3>${esc(CFG.proName)}</h3><span class="pro-price">${esc(CFG.proPrice)}<span>/${esc(CFG.proPeriod)}</span></span></div>
      <p class="muted">${r} free ${r === 1 ? CFG.noun : CFG.nounPlural} left today · Pro removes the limit and all ads.</p>
      <ul class="pro-perks">${CFG.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <button class="btn btn-accent btn-lg" id="pro-go">Go ${esc(CFG.proName)}</button>
    </div>`;
  }
  function wireProCard(container) {
    const go = container.querySelector('#pro-go');
    if (go) go.onclick = () => startCheckout();
    const cancel = container.querySelector('#pro-cancel');
    if (cancel) cancel.onclick = () => { setPro(false); toast('Back on the free plan'); setTimeout(() => location.reload(), 400); };
  }

  /* esc/toast fall back to the host app's helpers when present. */
  function esc(s) { if (window.__esc) return window.__esc(s); return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(m) { if (window.__toast) return window.__toast(m); }

  return {
    isPro, setPro, remaining, canUse, consume, grantBonus, config,
    creditsBadgeHTML, bannerHTML, wireAds, showPaywall, startCheckout,
    proCardHTML, wireProCard
  };
})();
