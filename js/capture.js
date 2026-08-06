'use strict';
/* ============================================================
   Capture — email capture + sign-in, in one sheet.

   The apps had no owned audience: every user acquired was a
   user lost the moment they closed the tab. This is the fix,
   and it is deliberately the same flow as signing in, so one
   ask does two jobs — you get the address, they get their
   result saved across devices.

   Placement matters. Ask at the moment of peak value: right
   after a result lands, framed as "save this", never as a
   gate on the way in. Call:

     Capture.offer({
       reason: 'Save your glow score',
       sub:    'Get it back on any device, plus your progress.',
       onDone: (email) => { … }
     })

   It no-ops if they've already given an address, and it stores
   a "not now" so a declined prompt doesn't nag on every result.
   ============================================================ */

const Capture = (() => {

  /* Byte-identical across apps; per-app values live in app-config.js. */
  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const CFG = {
    app: APP.id || 'app',
    // Days to wait before asking again after a dismissal.
    cooldownDays: APP.captureCooldownDays || 7,
    // Paste a Mailchimp / ConvertKit / Buttondown endpoint into
    // app-config.js to forward addresses to your list. Blank =
    // stored locally (and on the backend, if one is configured).
    listEndpoint: APP.listEndpoint || ''
  };

  const LS_DISMISS = 'capture_dismissed';
  const LS_LOCAL   = 'capture_emails';

  function read(k)     { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function acct()      { return (typeof Account !== 'undefined') ? Account : null; }

  function hasEmail() {
    const a = acct();
    if (a && a.user() && a.user().email) return true;
    return !!read(LS_LOCAL);
  }
  function email() {
    const a = acct();
    if (a && a.user()) return a.user().email;
    const l = read(LS_LOCAL);
    return l && l.email;
  }

  function inCooldown() {
    const d = read(LS_DISMISS);
    if (!d || !d.at) return false;
    return (Date.now() - d.at) < CFG.cooldownDays * 86400000;
  }
  function dismiss() { write(LS_DISMISS, { at: Date.now() }); }

  /* Should we ask right now? */
  function shouldOffer() { return !hasEmail() && !inCooldown(); }

  /* Fire-and-forget forward to a mailing list provider. */
  function forward(addr) {
    if (!CFG.listEndpoint) return Promise.resolve();
    return fetch(CFG.listEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addr, app: CFG.app, at: new Date().toISOString() })
    }).catch(() => {});
  }

  /* ==========================================================
     The sheet.
     Two states: enter email → (live backend only) enter code.
     ========================================================== */
  function open(opts) {
    const o = opts || {};
    const root = document.getElementById('modal-root') || document.body;
    const scrim = document.createElement('div');
    scrim.className = 'acct-sheet-scrim';
    scrim.innerHTML = `
      <div class="acct-sheet" role="dialog" aria-modal="true" aria-label="${esc(o.reason || 'Save your result')}">
        <button class="acct-x" aria-label="Close">×</button>
        <div class="acct-head">
          <div class="acct-emoji">${esc(o.emoji || '✦')}</div>
          <h3>${esc(o.reason || 'Save your result')}</h3>
          <p>${esc(o.sub || 'Enter your email and we\'ll keep it safe — pick up on any device.')}</p>
        </div>
        <div data-step="email">
          <input class="acct-field" type="email" inputmode="email" autocomplete="email"
                 placeholder="you@email.com" aria-label="Email address" />
          <button class="btn btn-accent btn-lg" data-act="send">${esc(o.cta || 'Save it')}</button>
          <div class="acct-err" role="alert"></div>
          <p class="acct-fine">No spam — your result, occasional product news, and nothing else. Unsubscribe any time.</p>
          <button class="acct-alt" data-act="skip">Not now</button>
        </div>
        <div data-step="code" hidden>
          <p class="acct-fine" style="margin:0 0 12px">We sent a 6-digit code to <strong data-slot="addr"></strong></p>
          <input class="acct-field code" type="text" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="······" aria-label="Verification code" />
          <button class="btn btn-accent btn-lg" data-act="verify">Confirm</button>
          <div class="acct-err" role="alert"></div>
          <button class="acct-alt" data-act="back">Use a different email</button>
        </div>
      </div>`;
    root.appendChild(scrim);
    document.body.classList.add('modal-open');

    const sheet   = scrim.querySelector('.acct-sheet');
    const stepEml = sheet.querySelector('[data-step="email"]');
    const stepCode= sheet.querySelector('[data-step="code"]');
    const input   = stepEml.querySelector('.acct-field');
    const codeIn  = stepCode.querySelector('.acct-field');
    let addr = '';

    const close = (saved) => {
      scrim.classList.add('leaving');
      setTimeout(() => { scrim.remove(); document.body.classList.remove('modal-open'); }, 200);
      if (!saved) { dismiss(); if (o.onSkip) o.onSkip(); }
    };
    scrim.addEventListener('click', e => { if (e.target === scrim) close(false); });
    sheet.querySelector('.acct-x').onclick = () => close(false);
    sheet.querySelector('[data-act="skip"]').onclick = () => close(false);

    const err = (el, msg) => { el.querySelector('.acct-err').textContent = msg || ''; };
    const busy = (btn, on, label) => { btn.disabled = on; btn.textContent = on ? (label || 'One moment…') : btn.dataset.label; };

    const sendBtn = sheet.querySelector('[data-act="send"]');
    sendBtn.dataset.label = sendBtn.textContent;
    sendBtn.onclick = () => {
      addr = input.value.trim().toLowerCase();
      err(stepEml, '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { err(stepEml, 'That email doesn\'t look right.'); input.focus(); return; }
      busy(sendBtn, true, 'Sending…');

      const a = acct();
      const p = a ? a.signIn(addr) : Promise.resolve({ localOnly: true });
      p.then(res => {
        write(LS_LOCAL, { email: addr, at: Date.now() });
        forward(addr);
        if (res && res.localOnly) {
          // No backend yet — the address is captured, that's the job done.
          close(true);
          toast('Saved ✦');
          if (o.onDone) o.onDone(addr);
        } else {
          stepEml.hidden = true; stepCode.hidden = false;
          stepCode.querySelector('[data-slot="addr"]').textContent = addr;
          setTimeout(() => codeIn.focus(), 60);
        }
      }).catch(e => {
        busy(sendBtn, false);
        err(stepEml, (e && e.message) || 'Something went wrong — try again.');
      });
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });

    const verifyBtn = sheet.querySelector('[data-act="verify"]');
    verifyBtn.dataset.label = verifyBtn.textContent;
    verifyBtn.onclick = () => {
      const code = codeIn.value.trim();
      err(stepCode, '');
      if (code.length < 6) { err(stepCode, 'Enter the 6-digit code.'); return; }
      busy(verifyBtn, true, 'Checking…');
      const a = acct();
      a.verify(addr, code).then(() => {
        close(true);
        toast('You\'re signed in ✦');
        if (o.onDone) o.onDone(addr);
        if (window.__render) window.__render();
      }).catch(e => {
        busy(verifyBtn, false);
        err(stepCode, (e && e.message) || 'That code didn\'t work.');
      });
    };
    codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') verifyBtn.click(); });

    sheet.querySelector('[data-act="back"]').onclick = () => {
      stepCode.hidden = true; stepEml.hidden = false;
      busy(sendBtn, false); err(stepCode, ''); input.focus();
    };

    setTimeout(() => input.focus(), 80);
    return { close };
  }

  /* Only opens when it's welcome — safe to call after every result. */
  function offer(opts) {
    if (!shouldOffer()) return null;
    // Let the result land before asking.
    const delay = (opts && opts.delay != null) ? opts.delay : 1400;
    return setTimeout(() => { if (shouldOffer()) open(opts); }, delay);
  }

  /* ==========================================================
     Settings row — shows who's signed in, or invites them to.
     ========================================================== */
  function rowHTML() {
    const a = acct();
    const e = email();
    if (e) {
      const snap = a ? a.snapshot() : null;
      const badge = snap && snap.allAccess ? 'All Access' : snap && snap.trial ? 'Trial' : snap && snap.pro ? 'Pro' : 'Free';
      return `<div class="acct-row">
        <div class="acct-avatar">${esc(e[0].toUpperCase())}</div>
        <div class="acct-who"><strong>${esc(e)}</strong><span>${a && a.snapshot().live ? 'Synced across your apps' : 'Saved on this device'}</span></div>
        <span class="acct-badge">${esc(badge)}</span>
      </div>
      <button class="btn btn-ghost" id="acct-out" style="margin-top:10px">Sign out</button>`;
    }
    return `<div class="acct-row">
        <div class="acct-avatar">✦</div>
        <div class="acct-who"><strong>Not signed in</strong><span>Save your results across devices</span></div>
      </div>
      <button class="btn btn-accent" id="acct-in" style="margin-top:10px">Sign in with email</button>`;
  }
  function wireRow(container) {
    if (!container) return;
    const inBtn = container.querySelector('#acct-in');
    if (inBtn) inBtn.onclick = () => open({
      reason: 'Sign in',
      sub: 'One login works across every app — and keeps your history safe.',
      cta: 'Continue'
    });
    const outBtn = container.querySelector('#acct-out');
    if (outBtn) outBtn.onclick = () => {
      const a = acct(); if (a) a.signOut();
      try { localStorage.removeItem(LS_LOCAL); } catch (e) {}
      toast('Signed out'); setTimeout(() => location.reload(), 400);
    };
  }

  function esc(s) { if (window.__esc) return window.__esc(s); return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(m) { if (window.__toast) return window.__toast(m); }

  return { open, offer, shouldOffer, hasEmail, email, dismiss, rowHTML, wireRow, config: () => CFG };
})();

if (typeof window !== 'undefined') window.Capture = Capture;
