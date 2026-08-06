'use strict';
/* ============================================================
   Account — the shared identity + entitlement layer.
   Dropped into every app (Aura / FitCheck / Muse / Dewy /
   Pantri / Swoon) unchanged except the CFG block at the top.

   Why it exists: each app used to sell its own $5–7/mo Pro and
   keep the flag in its own localStorage. Five apps meant five
   payment decisions and five isolated users. This layer gives
   one account and one entitlement that every app reads, so a
   single "All Access" subscription unlocks the whole set.

   It is deliberately dependency-free and degrades safely:

     • No backend configured  → local driver. Everything still
       works exactly as before, entitlement lives on-device.
     • Backend configured     → the same API, but identity and
       entitlement come from the server and follow the user
       across apps, devices and reinstalls.

   To go live: create a Supabase project, paste url + anonKey
   into CFG.backend below, and run the SQL in SETUP.md.
   ============================================================ */

const Account = (() => {

  /* ---- configuration ----
     This file is byte-identical in every app. Everything that varies
     lives in js/app-config.js, which each app loads first. ---------- */
  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const CFG = {
    app: APP.id || 'app',

    // Paste your Supabase project details into app-config.js to switch
    // on real accounts. Blank = local-only, exactly as it works today.
    backend: {
      url:     (APP.backend && APP.backend.url)     || '',
      anonKey: (APP.backend && APP.backend.anonKey) || ''
    },

    // How long a new user gets full access before the paywall applies.
    trialDays: APP.trialDays || 3
  };

  const LS_SESSION = 'acct_session';       // shared key name across apps
  const LS_ENT     = 'acct_entitlement';
  const LS_LOCAL   = 'acct_local_user';

  let state = {
    user: null,          // { id, email }
    ent:  null,          // { plan, trialEndsAt, renewsAt, source }
    ready: false
  };
  const listeners = [];

  /* ---- tiny helpers ------------------------------------------------------- */
  function now()  { return Date.now(); }
  function read(k)      { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function drop(k)      { try { localStorage.removeItem(k); } catch (e) {} }
  function live()       { return !!(CFG.backend.url && CFG.backend.anonKey); }
  function emit()       { listeners.forEach(fn => { try { fn(snapshot()); } catch (e) {} }); }

  function api(path, opts) {
    const o = opts || {};
    const headers = Object.assign({
      'apikey': CFG.backend.anonKey,
      'Content-Type': 'application/json'
    }, o.headers || {});
    const s = read(LS_SESSION);
    if (s && s.access_token && !o.noAuth) headers['Authorization'] = 'Bearer ' + s.access_token;
    return fetch(CFG.backend.url + path, {
      method:  o.method || 'GET',
      headers: headers,
      body:    o.body ? JSON.stringify(o.body) : undefined
    }).then(r => r.text().then(t => {
      let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
      if (!r.ok) throw Object.assign(new Error((j && (j.msg || j.message || j.error_description)) || ('HTTP ' + r.status)), { status: r.status, body: j });
      return j;
    }));
  }

  /* ==========================================================
     Entitlement
     Shape: { plan, trialEndsAt, renewsAt, source }
       plan:  'free' | 'trial' | 'pro' | 'allaccess'
       'pro'       unlocks the app that sold it
       'allaccess' unlocks every app in the set
     ========================================================== */
  function blankEnt() { return { plan: 'free', trialEndsAt: 0, renewsAt: 0, source: 'local', apps: [] }; }

  function normalise(e) {
    const ent = Object.assign(blankEnt(), e || {});
    // An expired trial silently falls back to free.
    if (ent.plan === 'trial' && ent.trialEndsAt && ent.trialEndsAt < now()) {
      ent.plan = 'free';
      ent.trialExpired = true;
    }
    return ent;
  }

  function entitlement() { return normalise(state.ent || read(LS_ENT)); }

  /* The single question every app actually asks. */
  function hasPro() {
    const e = entitlement();
    if (e.plan === 'allaccess' || e.plan === 'trial') return true;
    if (e.plan === 'pro') return !e.apps.length || e.apps.indexOf(CFG.app) !== -1;
    return false;
  }
  function isAllAccess() { return entitlement().plan === 'allaccess'; }
  function inTrial()     { const e = entitlement(); return e.plan === 'trial' && e.trialEndsAt > now(); }
  function trialDaysLeft() {
    const e = entitlement();
    if (e.plan !== 'trial') return 0;
    return Math.max(0, Math.ceil((e.trialEndsAt - now()) / 86400000));
  }
  function trialUsed() { return !!read('acct_trial_used'); }

  function startTrial() {
    if (trialUsed() || hasPro()) return false;
    const ent = { plan: 'trial', trialEndsAt: now() + CFG.trialDays * 86400000, renewsAt: 0, source: 'local', apps: [] };
    setEntitlement(ent);
    write('acct_trial_used', { at: now() });
    return true;
  }

  function setEntitlement(ent, opts) {
    state.ent = normalise(ent);
    write(LS_ENT, state.ent);
    emit();
    if (live() && state.user && !(opts && opts.fromServer)) pushEntitlement().catch(() => {});
    return state.ent;
  }

  /* Local dev / preview unlock — the old Money.setPro(true) path. */
  function grant(plan) { return setEntitlement({ plan: plan || 'allaccess', source: 'local', apps: [] }); }
  function revoke()    { return setEntitlement(blankEnt()); }

  /* ==========================================================
     Identity
     Email one-time-code sign-in. No passwords to manage, and
     it doubles as the email capture the apps were missing.
     ========================================================== */
  function user()        { return state.user || read(LS_LOCAL); }
  function isSignedIn()  { return !!user(); }

  function signIn(email) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Promise.reject(new Error('That email doesn\'t look right'));

    if (!live()) {
      // Local mode: accept the address, remember it, no verification.
      const u = { id: 'local-' + btoa(email).replace(/=/g, ''), email: email, local: true };
      write(LS_LOCAL, u); state.user = u; emit();
      return Promise.resolve({ localOnly: true, user: u });
    }
    return api('/auth/v1/otp', {
      method: 'POST', noAuth: true,
      body: { email: email, create_user: true }
    }).then(() => ({ sent: true, email: email }));
  }

  function verify(email, code) {
    if (!live()) return Promise.resolve({ user: user() });
    return api('/auth/v1/verify', {
      method: 'POST', noAuth: true,
      body: { type: 'email', email: String(email).trim().toLowerCase(), token: String(code).trim() }
    }).then(session => {
      write(LS_SESSION, session);
      state.user = session.user ? { id: session.user.id, email: session.user.email } : null;
      write(LS_LOCAL, state.user);
      emit();
      return pullEntitlement().then(() => ({ user: state.user }));
    });
  }

  function signOut() {
    if (live()) { api('/auth/v1/logout', { method: 'POST' }).catch(() => {}); }
    drop(LS_SESSION); drop(LS_LOCAL); drop(LS_ENT);
    state.user = null; state.ent = null;
    emit();
  }

  function refreshSession() {
    const s = read(LS_SESSION);
    if (!live() || !s || !s.refresh_token) return Promise.resolve(null);
    return api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', noAuth: true, body: { refresh_token: s.refresh_token }
    }).then(session => {
      write(LS_SESSION, session);
      if (session.user) { state.user = { id: session.user.id, email: session.user.email }; write(LS_LOCAL, state.user); }
      return session;
    }).catch(() => { drop(LS_SESSION); return null; });
  }

  /* ==========================================================
     Sync — entitlement lives in one row per user, readable by
     every app. This is what makes All Access actually work.
     ========================================================== */
  function pullEntitlement() {
    if (!live() || !user()) return Promise.resolve(entitlement());
    return api('/rest/v1/entitlements?select=*&user_id=eq.' + encodeURIComponent(user().id) + '&limit=1')
      .then(rows => {
        const row = rows && rows[0];
        if (!row) return entitlement();
        return setEntitlement({
          plan:        row.plan || 'free',
          trialEndsAt: row.trial_ends_at ? Date.parse(row.trial_ends_at) : 0,
          renewsAt:    row.renews_at ? Date.parse(row.renews_at) : 0,
          apps:        row.apps || [],
          source:      'server'
        }, { fromServer: true });
      })
      .catch(() => entitlement());
  }

  function pushEntitlement() {
    if (!live() || !user()) return Promise.resolve();
    const e = entitlement();
    return api('/rest/v1/entitlements', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: [{
        user_id:       user().id,
        plan:          e.plan,
        apps:          e.apps,
        trial_ends_at: e.trialEndsAt ? new Date(e.trialEndsAt).toISOString() : null,
        renews_at:     e.renewsAt ? new Date(e.renewsAt).toISOString() : null,
        updated_at:    new Date().toISOString()
      }]
    });
  }

  /* ==========================================================
     Boot
     ========================================================== */
  function init() {
    if (state.ready) return Promise.resolve(snapshot());
    state.user = read(LS_LOCAL);
    state.ent  = normalise(read(LS_ENT));
    state.ready = true;

    // Migrate the old per-app Pro flag so existing users don't get downgraded.
    const legacy = read(CFG.app + '_pro');
    if (legacy && legacy.active && state.ent.plan === 'free') {
      setEntitlement({ plan: 'pro', apps: [CFG.app], source: 'legacy' });
    }

    emit();
    if (live()) {
      return refreshSession().then(pullEntitlement).then(() => snapshot()).catch(() => snapshot());
    }
    return Promise.resolve(snapshot());
  }

  function snapshot() {
    const e = entitlement();
    return {
      user: user(), signedIn: isSignedIn(), entitlement: e,
      pro: hasPro(), allAccess: isAllAccess(),
      trial: inTrial(), trialDaysLeft: trialDaysLeft(),
      live: live()
    };
  }

  function on(fn) { if (typeof fn === 'function') listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); }; }
  function config() { return CFG; }

  return {
    init, on, config, snapshot,
    user, isSignedIn, signIn, verify, signOut,
    entitlement, setEntitlement, hasPro, isAllAccess,
    inTrial, trialDaysLeft, trialUsed, startTrial,
    grant, revoke, pullEntitlement, pushEntitlement
  };
})();

if (typeof window !== 'undefined') window.Account = Account;

/* Self-booting so no app.js needs editing. Safe to call twice. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Account.init());
  else Account.init();
}
