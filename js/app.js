'use strict';
/* ============================================================
   App — views, routing, analyze wizard, results.
   Guest-first: anyone can run a fit check by typing their
   measurements. Logging in is only required to SAVE things —
   body profiles ("diameter"), photos, camera use and history.
   Depends on: Store, Auth, FitEngine, Camera (loaded before).
   ============================================================ */

(() => {
  const view = document.getElementById('view');
  const topbar = document.getElementById('topbar');
  const mainnav = document.getElementById('mainnav');
  const profileChip = document.getElementById('active-profile-chip');
  const logoutBtn = document.getElementById('logout-btn');
  const loginBtn = document.getElementById('login-btn');

  // Guest session state (in memory only — saving requires an account)
  let guestBody = Store.getGuestBody(); // guest measurements — auto-saved on device
  let guestResult = null;  // last guest fit check
  let returnTo = null;     // where to go back to after logging in

  /* ==========================================================
     Small helpers
     ========================================================== */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ['chest','waist','sleeves'] -> "chest, waist and sleeves"
  function listJoin(arr) {
    if (arr.length <= 1) return arr[0] || '';
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.classList.add('leaving'), 2800);
    setTimeout(() => el.remove(), 3200);
  }
  // let the shared Money module reuse these
  window.__esc = esc; window.__toast = toast;

  function openModal(html) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    root.appendChild(overlay);
    return overlay;
  }

  function confirmModal(title, body, confirmLabel, onConfirm) {
    const overlay = openModal(`
      <h3 class="card-title">${esc(title)}</h3>
      <p class="muted" style="margin-bottom:16px">${esc(body)}</p>
      <div class="btn-row">
        <button class="btn btn-secondary" data-act="cancel">Cancel</button>
        <button class="btn btn-danger" data-act="ok">${esc(confirmLabel)}</button>
      </div>`);
    overlay.querySelector('[data-act="cancel"]').onclick = () => overlay.remove();
    overlay.querySelector('[data-act="ok"]').onclick = () => { overlay.remove(); onConfirm(); };
  }

  // Gate an action behind login. Returns true if already logged in.
  function requireAuth(title, body) {
    if (Auth.user()) return true;
    const overlay = openModal(`
      <h3 class="card-title">${esc(title)}</h3>
      <p class="muted" style="margin-bottom:16px">${esc(body)}</p>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn btn-primary btn-block btn-lg" data-act="login">Log in / Create free account</button>
        <button class="btn btn-ghost btn-block" data-act="later">Not now</button>
      </div>`);
    overlay.querySelector('[data-act="later"]').onclick = () => overlay.remove();
    overlay.querySelector('[data-act="login"]').onclick = () => {
      overlay.remove();
      returnTo = location.hash || '#/home';
      go('login');
    };
    return false;
  }

  function saveOrWarn() {
    const res = Auth.save();
    if (!res.ok && res.quota) {
      toast('Device storage is full — delete old photos or analyses to free space.', 'err');
      return false;
    }
    return true;
  }

  /* ---------- units ---------- */

  function units() {
    const u = Auth.user();
    if (u) return (u.prefs && u.prefs.units) || 'cm';
    return Store.getGuestPrefs().units || 'cm';
  }

  function setUnits(val) {
    const u = Auth.user();
    if (u) { u.prefs.units = val; return saveOrWarn(); }
    Store.saveGuestPrefs({ units: val });
    return true;
  }

  // cm (stored) → display value
  function disp(cm) {
    if (cm == null || cm === '') return '';
    return units() === 'in' ? FitEngine.cmToIn(Number(cm)) : Math.round(Number(cm) * 10) / 10;
  }

  // input value → cm (stored)
  function toCm(val) {
    if (val == null || val === '') return null;
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    return units() === 'in' ? FitEngine.inToCm(n) : n;
  }

  /* ==========================================================
     Router
     ========================================================== */

  const routes = {
    home: renderHome,
    analyze: renderAnalyze,
    profiles: renderProfiles,
    history: renderHistory,
    foryou: renderForYou,
    colours: renderColours,
    outfits: renderOutfits,
    moderate: renderModerate, // hidden admin page — not in the nav
    dashboard: renderDashboard,
    settings: renderSettings,
    help: renderHelp,
    login: renderAuth
  };

  function currentRoute() {
    const hash = location.hash.replace(/^#\//, '') || 'home';
    return hash.split('/');
  }

  function go(path) {
    if (location.hash === '#/' + path) render();
    else location.hash = '#/' + path;
  }

  function render() {
    const u = Auth.user();
    // keep personal text (names, email) out of the machine translator
    if (u && window.I18n && I18n.protect) {
      I18n.protect([u.name, u.email].concat((u.profiles || []).map(p => p.name)));
    }
    const parts = currentRoute();
    const name = parts[0];
    const chrome = name !== 'login'; // login page is a focused full screen

    document.body.classList.toggle('authed', chrome);
    topbar.classList.toggle('hidden', !chrome);
    mainnav.classList.toggle('hidden', !chrome);

    // topbar right side: chip + logout when authed, login button when guest
    const active = u ? getActiveProfile() : null;
    if (active) {
      profileChip.textContent = active.name;
      profileChip.classList.remove('hidden');
    } else {
      profileChip.classList.add('hidden');
    }
    logoutBtn.classList.toggle('hidden', !u);
    loginBtn.classList.toggle('hidden', !!u);

    // nav highlight
    mainnav.querySelectorAll('a[data-nav]').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-nav') === name);
    });

    if (name === 'result' && parts[1]) { renderResultPage(parts[1]); }
    else (routes[name] || renderHome)();

    if (name === 'home') injectInstallBanner();

    view.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ==========================================================
     Profile helpers
     ========================================================== */

  function getActiveProfile() {
    const u = Auth.user();
    if (!u || !u.profiles.length) return null;
    return u.profiles.find(p => p.id === u.activeProfileId) || u.profiles[0];
  }

  /* ==========================================================
     LOGIN / REGISTER (only needed to save things)
     ========================================================== */

  let authTab = 'login';

  function renderAuth() {
    view.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-hero">
          <span class="brand-mark">
            <svg viewBox="0 0 24 24" fill="none"><path d="M8 3 4 6l2 3 1.5-1V19h9V8L18 9l2-3-4-3c-.8 1.2-2.2 2-4 2s-3.2-.8-4-2Z" fill="currentColor"/></svg>
          </span>
          <h1>FitCheck account</h1>
          <p>An account lets you save your measurements, photos and fit-check history on this device — and use the camera.</p>
        </div>
        <div class="auth-card">
          <div class="auth-tabs">
            <button data-tab="login" class="${authTab === 'login' ? 'active' : ''}">Log in</button>
            <button data-tab="register" class="${authTab === 'register' ? 'active' : ''}">Create account</button>
          </div>
          <form id="auth-form" novalidate>
            ${authTab === 'register' ? `
            <div class="field">
              <label for="af-name">Name <span class="req">*</span></label>
              <input class="input" id="af-name" type="text" autocomplete="name" placeholder="Your name">
            </div>` : ''}
            <div class="field">
              <label for="af-email">Email <span class="req">*</span></label>
              <input class="input" id="af-email" type="email" autocomplete="email" placeholder="you@example.com">
            </div>
            <div class="field">
              <label for="af-pass">Password <span class="req">*</span></label>
              <input class="input" id="af-pass" type="password" autocomplete="${authTab === 'login' ? 'current-password' : 'new-password'}" placeholder="${authTab === 'register' ? 'At least 6 characters' : 'Your password'}">
            </div>
            ${authTab === 'login' ? `
            <div class="field" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="af-remember" checked style="width:16px;height:16px;accent-color:var(--primary)">
              <label for="af-remember" style="margin:0;font-weight:500">Keep me logged in</label>
            </div>` : ''}
            <button type="submit" class="btn btn-primary btn-block btn-lg mt-8">
              ${authTab === 'login' ? 'Log in' : 'Create my account'}
            </button>
          </form>
          <button class="btn btn-ghost btn-block mt-8" id="auth-skip">← Continue without an account</button>
          <p class="auth-footnote">Your account, measurements and photos are stored only on this device. Nothing is uploaded to a server.</p>
        </div>
      </div>`;

    view.querySelectorAll('.auth-tabs button').forEach(btn => {
      btn.onclick = () => { authTab = btn.getAttribute('data-tab'); renderAuth(); };
    });

    document.getElementById('auth-skip').onclick = () => {
      const dest = returnTo;
      returnTo = null;
      location.hash = dest || '#/home';
    };

    document.getElementById('auth-form').onsubmit = async e => {
      e.preventDefault();
      const email = document.getElementById('af-email').value;
      const password = document.getElementById('af-pass').value;
      const submit = e.target.querySelector('[type="submit"]');
      submit.disabled = true;

      let res;
      const isRegister = authTab === 'register';
      if (isRegister) {
        res = await Auth.register({ name: document.getElementById('af-name').value, email, password });
      } else {
        res = await Auth.login({ email, password, remember: document.getElementById('af-remember').checked });
      }
      submit.disabled = false;

      if (!res.ok) { toast(res.error, 'err'); return; }

      // If a guest typed measurements before signing up, save them as a profile.
      if (guestBody && !res.user.profiles.length) {
        res.user.profiles.push({ id: Store.uid(), name: 'Me', body: guestBody, photos: { face: null, body: null }, createdAt: Date.now() });
        res.user.activeProfileId = res.user.profiles[0].id;
        Auth.save();
        toast('Your measurements were saved to your new account.', 'ok');
      } else {
        toast(isRegister ? 'Welcome to FitCheck!' : 'Welcome back, ' + res.user.name + '!', 'ok');
      }

      const dest = returnTo;
      returnTo = null;
      location.hash = dest || '#/home';
      render();
    };
  }

  /* ---------- reusable "create account" promo ---------- */

  function promoCard(text) {
    return `
      <div class="promo-card">
        <div class="promo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>
        </div>
        <div class="promo-body">
          <div class="promo-title">Save it for next time</div>
          <div class="promo-text">${esc(text)}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-promo-login>Log in / Sign up</button>
      </div>`;
  }

  function wirePromo() {
    view.querySelectorAll('[data-promo-login]').forEach(b => b.onclick = () => {
      returnTo = location.hash || '#/home';
      go('login');
    });
  }

  /* ==========================================================
     HOME
     ========================================================== */

  /* ---- installable-PWA prompt: drives the installs that unlock the share sheet ---- */
  let deferredInstallPrompt = null;

  function isStandalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }

  function injectInstallBanner() {
    if (!deferredInstallPrompt || isStandalone()) return;
    try { if (localStorage.getItem('fc_install_dismissed') === '1') return; } catch (e) {}
    if (view.querySelector('.install-banner')) return;
    const bar = document.createElement('div');
    bar.className = 'install-banner';
    bar.innerHTML = `
      <div class="ib-text">
        <strong>Install FitCheck</strong>
        <span>Check sizes from any store — straight from your phone's share button.</span>
      </div>
      <div class="ib-actions">
        <button class="btn btn-primary btn-sm" id="ib-install">Install</button>
        <button class="ib-close" id="ib-dismiss" aria-label="Dismiss">&times;</button>
      </div>`;
    view.prepend(bar);
    bar.querySelector('#ib-install').onclick = () => triggerInstall(bar);
    bar.querySelector('#ib-dismiss').onclick = () => {
      try { localStorage.setItem('fc_install_dismissed', '1'); } catch (e) {}
      bar.remove();
    };
  }

  async function triggerInstall(el) {
    const dp = deferredInstallPrompt;
    if (!dp) return;
    dp.prompt();
    try { await dp.userChoice; } catch (e) {}
    deferredInstallPrompt = null;
    if (el) el.remove();
  }

  function renderHome() {
    const u = Auth.user();

    if (!u) {
      view.innerHTML = `
        <div class="hero-cta">
          <h2>Know your fit before you buy</h2>
          <p>Type your measurements, pick a garment, and get a size verdict in 30 seconds — no account needed.</p>
          <a href="#/analyze" class="btn btn-lg">Try a fit check</a>
          <div style="margin-top:12px">${Money.creditsBadgeHTML()}</div>
        </div>

        ${promoCard('Create a free account to save your measurements, use the camera, add photos and keep your fit-check history.')}

        <div class="card">
          <div class="card-title">How FitCheck works</div>
          <div class="zone-list">
            <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">1 · Enter your measurements</div><div class="zone-msg">Height, chest, waist, hips — a soft measuring tape is all you need.</div></div></div>
            <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">2 · Pick the garment</div><div class="zone-msg">Choose the type and the fit you like — slim, regular or relaxed.</div></div></div>
            <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">3 · Get your verdict</div><div class="zone-msg">FitCheck scores every size, flags what's too tight, loose, short or long — and tells you the best size to buy.</div></div></div>
          </div>
        </div>

        ${Money.bannerHTML('home')}`;
      wirePromo();
      Money.wireAds(view);
      return;
    }

    const active = getActiveProfile();
    const analyses = u.analyses.slice().reverse();
    const avg = analyses.length
      ? Math.round(analyses.reduce((s, a) => s + a.score, 0) / analyses.length)
      : null;

    view.innerHTML = `
      <div class="hero-cta">
        <h2>Hi ${esc(u.name.split(' ')[0])}</h2>
        <p>${active
          ? `Ready to check a garment against <strong>${esc(active.name)}</strong>?`
          : 'Start by creating a body profile with your measurements.'}</p>
        <a href="#/${active ? 'analyze' : 'profiles'}" class="btn btn-lg">${active ? 'Check a fit' : 'Create my profile'}</a>
        <div style="margin-top:12px">${Money.creditsBadgeHTML()}</div>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="num">${u.profiles.length}</div><div class="lbl">Profiles</div></div>
        <div class="stat"><div class="num">${analyses.length}</div><div class="lbl">Fit checks</div></div>
        <div class="stat"><div class="num">${avg == null ? '—' : avg}</div><div class="lbl">Avg fit score</div></div>
      </div>

      <div class="card">
        <div class="card-title">Recent fit checks</div>
        ${analyses.length ? `<div class="row-list">${analyses.slice(0, 3).map(analysisRow).join('')}</div>` : `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="m9 7 1.5-3h3L15 7"/><circle cx="12" cy="13" r="3.5"/></svg>
          <h3>The tape is ready</h3>
          <p>Run your first garment past the tape — a verdict takes half a minute.</p>
          <a href="#/analyze" class="btn btn-primary">Start a fitting</a>
        </div>`}
      </div>

      ${Money.bannerHTML('home')}`;

    wireAnalysisRows();
    Money.wireAds(view);
  }

  function analysisRow(a) {
    const cls = a.score >= 82 ? 's-good' : a.score >= 65 ? 's-warn' : 's-bad';
    const date = new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `
      <div class="list-row" data-analysis="${esc(a.id)}" role="button" tabindex="0">
        <span class="row-thumb">${a.garmentPhoto
          ? `<img src="${a.garmentPhoto}" alt="">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3 4 6l2 3 1.5-1V19h9V8L18 9l2-3-4-3c-.8 1.2-2.2 2-4 2s-3.2-.8-4-2Z"/></svg>`}</span>
        <span class="row-main">
          <span class="title">${esc(a.garmentLabel)} · size ${esc(a.size)}</span>
          <span class="sub">${esc(a.profileName)} · ${date}</span>
        </span>
        <span class="score-pill ${cls}">${a.score}</span>
      </div>`;
  }

  function wireAnalysisRows() {
    view.querySelectorAll('[data-analysis]').forEach(row => {
      const open = () => go('result/' + row.getAttribute('data-analysis'));
      row.onclick = open;
      row.onkeydown = e => { if (e.key === 'Enter') open(); };
    });
  }

  /* ==========================================================
     PROFILES (saved measurements — account required)
     ========================================================== */

  function renderProfiles(editId) {
    const u = Auth.user();

    if (!u) {
      view.innerHTML = `
        <div class="card">
          <div class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
            <h3>Measure once, use forever</h3>
            <p>Body profiles store your measurements and photos so every fit check is one tap. That needs a free account, so your data is kept safely on this device.</p>
            <button class="btn btn-primary btn-lg" data-promo-login>Log in / Create free account</button>
          </div>
        </div>`;
      wirePromo();
      return;
    }

    if (editId !== undefined) { renderProfileForm(editId); return; }

    view.innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Body profiles</span>
          <button class="btn btn-primary btn-sm" id="add-profile">+ New profile</button>
        </div>
        <p class="muted small mb-16">Each profile stores measurements and photos. Set one active — it's used for fit checks.</p>
        ${u.profiles.length ? `<div class="row-list">${u.profiles.map(p => {
          const isActive = getActiveProfile() && getActiveProfile().id === p.id;
          return `
          <div class="list-row">
            <span class="row-thumb">${p.photos && p.photos.face
              ? `<img src="${p.photos.face}" alt="">`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>`}</span>
            <span class="row-main">
              <span class="title">${esc(p.name)} ${isActive ? '<span class="badge">Active</span>' : ''}</span>
              <span class="sub">${disp(p.body.height)} ${units()} · chest ${disp(p.body.chest)} · waist ${disp(p.body.waist)} · hips ${disp(p.body.hips)}</span>
            </span>
            <span class="btn-row">
              ${isActive ? '' : `<button class="btn btn-secondary btn-sm" data-activate="${esc(p.id)}">Use</button>`}
              <button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">Edit</button>
            </span>
          </div>`;
        }).join('')}</div>` : `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
          <h3>No one on the books yet</h3>
          <p>Take your measurements once — after that, every fitting is one tap.</p>
        </div>`}
      </div>`;

    document.getElementById('add-profile').onclick = () => renderProfiles(null);
    view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderProfiles(b.getAttribute('data-edit')));
    view.querySelectorAll('[data-activate]').forEach(b => b.onclick = () => {
      u.activeProfileId = b.getAttribute('data-activate');
      if (saveOrWarn()) { toast('Active profile updated.', 'ok'); render(); }
    });
  }

  /* ---------- measurement fields (shared by profile form + guest form) ---------- */

  function measurementFields(idPrefix, body) {
    const uLabel = units();
    return FitEngine.BODY_FIELDS.map(f => {
      const isWeight = f.key === 'weight';
      const unit = isWeight ? (f.unit || 'kg') : uLabel;
      const val = isWeight ? (body[f.key] != null ? body[f.key] : '') : disp(body[f.key]);
      return `
      <div class="field">
        <label for="${idPrefix}-${f.key}">${esc(f.label)} ${f.required ? '<span class="req">*</span>' : ''}</label>
        <span class="input-suffix">
          <input class="input" id="${idPrefix}-${f.key}" type="number" step="0.1" inputmode="decimal" value="${val}">
          <span class="suffix">${unit}</span>
        </span>
        <span class="hint">${esc(f.hint)}</span>
      </div>`;
    }).join('');
  }

  // Reads + validates the fields. Returns body object or null (toasts the problem).
  function collectMeasurements(idPrefix) {
    const body = {};
    for (const f of FitEngine.BODY_FIELDS) {
      const raw = document.getElementById(idPrefix + '-' + f.key).value;
      let val;
      if (f.key === 'weight') {
        val = raw === '' ? null : parseFloat(raw);
        if (val != null && isNaN(val)) val = null;
      } else {
        val = toCm(raw);
      }
      if (f.required && val == null) { toast(`Please fill in ${f.label.toLowerCase()}.`, 'err'); return null; }
      if (val != null && (val < f.min || val > f.max)) {
        toast(`${f.label} looks off. Expected ${f.key === 'weight' ? f.min + '–' + f.max + ' kg' : disp(f.min) + '–' + disp(f.max) + ' ' + units()}.`, 'err');
        return null;
      }
      body[f.key] = val;
    }
    return body;
  }

  function renderProfileForm(editId) {
    const u = Auth.user();
    const existing = editId ? u.profiles.find(p => p.id === editId) : null;
    const p = existing || { id: null, name: '', body: {}, photos: { face: null, body: null } };

    view.innerHTML = `
      <div class="card">
        <div class="card-title">${existing ? 'Edit profile' : 'New body profile'}</div>

        <div class="field">
          <label for="pf-name">Profile name <span class="req">*</span></label>
          <input class="input" id="pf-name" type="text" value="${esc(p.name)}" placeholder="Name this profile — anything you like">
        </div>
        <div class="section-label">Female or male sizing? <span class="req">*</span></div>
        <div class="chip-row mb-16" id="pf-sex">
          <button class="chip ${p.sex === 'female' ? 'selected' : ''}" data-sex="female">Female</button>
          <button class="chip ${p.sex === 'male' ? 'selected' : ''}" data-sex="male">Male</button>
        </div>

        <div class="section-label">Measurements (${units()})</div>
        <p class="hint mb-16">Use a soft measuring tape. Fields marked * are required — the rest sharpen the verdict.</p>
        <div class="form-grid">${measurementFields('pf', p.body)}</div>

        <div class="divider"></div>
        <div class="section-label">Photos (optional)</div>
        <p class="hint mb-16">A face photo labels the profile; a full-body photo appears next to garment photos in your results.</p>
        <div class="photo-grid">
          ${photoSlot('face', 'Face photo', p.photos.face)}
          ${photoSlot('body', 'Full-body photo', p.photos.body)}
        </div>

        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-primary btn-lg" id="pf-save">${existing ? 'Save changes' : 'Create profile'}</button>
          <button class="btn btn-secondary" id="pf-cancel">Cancel</button>
          ${existing ? '<button class="btn btn-danger" id="pf-delete" style="margin-left:auto">Delete</button>' : ''}
        </div>
      </div>`;

    // photo state lives here until save
    const photos = { face: p.photos.face || null, body: p.photos.body || null };

    function photoSlot(key, label, src) {
      return `
      <div class="photo-slot" id="slot-${key}">
        <div class="slot-label">${label}</div>
        ${src ? `<img class="thumb" src="${src}" alt="">` : `
        <div class="placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="m9 7 1.5-3h3L15 7"/><circle cx="12" cy="13" r="3.5"/></svg>
        </div>`}
        <div class="btn-row">
          <button class="btn btn-secondary btn-sm" data-photo="${key}">${src ? 'Replace' : 'Add photo'}</button>
          ${src ? `<button class="btn btn-ghost btn-sm" data-photo-del="${key}">Remove</button>` : ''}
        </div>
      </div>`;
    }

    function refreshSlot(key) {
      document.getElementById('slot-' + key).outerHTML = photoSlot(key, key === 'face' ? 'Face photo' : 'Full-body photo', photos[key]);
      wireSlots();
    }

    function wireSlots() {
      view.querySelectorAll('[data-photo]').forEach(b => b.onclick = () => {
        const key = b.getAttribute('data-photo');
        Camera.pickImage({
          onImage: dataUrl => { photos[key] = dataUrl; refreshSlot(key); },
          onError: msg => toast(msg, 'err')
        });
      });
      view.querySelectorAll('[data-photo-del]').forEach(b => b.onclick = () => {
        const key = b.getAttribute('data-photo-del');
        photos[key] = null;
        refreshSlot(key);
      });
    }
    wireSlots();

    let sexVal = p.sex || null;
    document.getElementById('pf-sex').onclick = e => {
      const c = e.target.closest('[data-sex]');
      if (!c) return;
      sexVal = c.getAttribute('data-sex');
      document.querySelectorAll('#pf-sex .chip').forEach(ch => ch.classList.toggle('selected', ch === c));
    };

    document.getElementById('pf-cancel').onclick = () => renderProfiles();

    if (existing) {
      document.getElementById('pf-delete').onclick = () => confirmModal(
        'Delete this profile?',
        `"${p.name}" and its photos will be removed. Past fit checks are kept.`,
        'Delete profile',
        () => {
          u.profiles = u.profiles.filter(x => x.id !== p.id);
          if (u.activeProfileId === p.id) u.activeProfileId = u.profiles.length ? u.profiles[0].id : null;
          if (saveOrWarn()) { toast('Profile deleted.'); renderProfiles(); render(); }
        });
    }

    document.getElementById('pf-save').onclick = () => {
      const name = document.getElementById('pf-name').value.trim();
      if (!name) { toast('Please give the profile a name.', 'err'); return; }
      if (!sexVal) { toast('Pick female or male sizing.', 'err'); return; }
      const body = collectMeasurements('pf');
      if (!body) return;

      if (existing) {
        existing.name = name;
        existing.sex = sexVal;
        existing.body = body;
        existing.photos = photos;
      } else {
        const np = { id: Store.uid(), name, sex: sexVal, body, photos, createdAt: Date.now() };
        u.profiles.push(np);
        if (!u.activeProfileId) u.activeProfileId = np.id;
      }

      if (saveOrWarn()) {
        toast(existing ? 'Profile saved.' : 'Profile created!', 'ok');
        renderProfiles();
        render();
      }
    };
  }

  /* ==========================================================
     ANALYZE (wizard) — works for guests too
     ========================================================== */

  let wiz = null;

  function renderAnalyze() {
    const u = Auth.user();

    // gate a fresh fit check when the daily free limit is spent
    if (!wiz && !Money.canUse()) { renderAnalyzeLocked(); return; }

    if (!wiz) {
      // If the user arrived via the share sheet, a product link is waiting.
      let sharedUrl = '';
      try { sharedUrl = sessionStorage.getItem('fc_shared_url') || ''; if (sharedUrl) sessionStorage.removeItem('fc_shared_url'); } catch (e) {}
      wiz = {
        step: 1,
        profileId: u && u.profiles.length ? (getActiveProfile() || u.profiles[0]).id : null,
        garmentType: 'tshirt',
        fitPref: 'regular',
        pickedSize: '',
        garmentPhoto: null,
        garmentName: '',
        chartUrl: sharedUrl,
        customChart: null,
        newSex: null,
        autoFetchShare: !!sharedUrl
      };
    }

    if (wiz.step === 1) {
      if (u) renderWizWho();
      else renderWizMeasure();
    } else {
      renderWizStep2();
    }
  }

  function renderAnalyzeLocked() {
    const c = Money.config();
    const view = document.getElementById('view');
    view.innerHTML = `<div class="empty">
      <div class="empty-emoji">👕</div>
      <h3>That's your ${c.freePerDay} free fit checks for today</h3>
      <p>Come back tomorrow for ${c.freePerDay} more, watch a short ad to unlock one now, or go unlimited with ${esc(c.proName)}.</p>
      <div class="btn-row" style="justify-content:center;gap:10px;flex-wrap:wrap;margin-top:6px">
        <button class="btn btn-primary" id="ql-more">Unlock one more</button>
        <a class="btn btn-ghost" href="#/home">Back home</a>
      </div></div>`;
    document.getElementById('ql-more').onclick = () => Money.showPaywall(() => render());
    Money.showPaywall(() => render());
  }

  function stepsBar(step) {
    const s = n => `step ${step === n ? 'active' : step > n ? 'done' : ''}`;
    const d = n => step > n ? '✓' : n;
    return `
      <div class="steps">
        <span class="${s(1)}"><span class="dot">${d(1)}</span> Who's wearing it</span>
        <span class="bar"></span>
        <span class="${s(2)}"><span class="dot">${d(2)}</span> The garment</span>
        <span class="bar"></span>
        <span class="${s(3)}"><span class="dot">3</span> Verdict</span>
      </div>`;
  }

  /* ---- step 1a: logged in — profile dropdown, measurements pre-filled ----
     Pick a saved profile and everything auto-fills: press Continue and go.
     Pick "+ Create another profile" to add someone new, named anything. */

  function renderWizWho() {
    const u = Auth.user();
    const isNew = !u.profiles.length || wiz.profileId === '__new';
    const prof = isNew ? null : (u.profiles.find(p => p.id === wiz.profileId) || u.profiles[0]);
    if (prof) wiz.profileId = prof.id;

    view.innerHTML = `
      ${stepsBar(1)}
      <div class="card">
        <div class="card-title">Who's wearing it? (${units()})</div>

        ${u.profiles.length ? `
        <div class="field">
          <label for="who-select">Profile</label>
          <select class="input" id="who-select">
            ${u.profiles.map(p => `<option value="${esc(p.id)}" ${prof && p.id === prof.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            <option value="__new" ${isNew ? 'selected' : ''}>+ Create another profile</option>
          </select>
          ${prof ? `<span class="hint">${esc(prof.name)}'s saved measurements are filled in below — press Continue, or adjust them first.</span>` : ''}
        </div>` : ''}

        ${isNew ? `
        <div class="field">
          <label for="gm-name">Profile name <span class="req">*</span></label>
          <input class="input" id="gm-name" type="text" placeholder="Name this profile — anything you like">
        </div>
        <div class="section-label">Female or male sizing? <span class="req">*</span></div>
        <div class="chip-row mb-16" id="gm-sex">
          <button class="chip ${wiz.newSex === 'female' ? 'selected' : ''}" data-sex="female">Female</button>
          <button class="chip ${wiz.newSex === 'male' ? 'selected' : ''}" data-sex="male">Male</button>
        </div>
        <p class="hint mb-16">Use a soft measuring tape. Fields marked * are required — the rest sharpen the verdict. Everything is saved to this profile, so it's typed once.</p>` : ''}

        <div class="form-grid">${measurementFields('gm', prof ? prof.body : {})}</div>
        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-primary btn-lg" id="wiz-next">${isNew ? 'Save & continue' : 'Continue'}</button>
        </div>
      </div>`;

    const sel = document.getElementById('who-select');
    if (sel) sel.onchange = () => { wiz.profileId = sel.value; renderWizWho(); };

    const sexRow = document.getElementById('gm-sex');
    if (sexRow) sexRow.onclick = e => {
      const c = e.target.closest('[data-sex]');
      if (!c) return;
      wiz.newSex = c.getAttribute('data-sex');
      sexRow.querySelectorAll('.chip').forEach(ch => ch.classList.toggle('selected', ch === c));
    };

    document.getElementById('wiz-next').onclick = () => {
      const body = collectMeasurements('gm');
      if (!body) return;

      if (isNew) {
        const name = document.getElementById('gm-name').value.trim();
        if (!name) { toast('Give this profile a name first.', 'err'); return; }
        if (!wiz.newSex) { toast('Pick female or male sizing.', 'err'); return; }
        const np = { id: Store.uid(), name, sex: wiz.newSex, body, photos: { face: null, body: null }, createdAt: Date.now() };
        u.profiles.push(np);
        if (!u.activeProfileId) u.activeProfileId = np.id;
        if (!saveOrWarn()) return;
        wiz.profileId = np.id;
        toast(`${name} is on the books — next time it's one tap.`, 'ok');
      } else {
        prof.body = body; // any adjustments flow back into the saved profile
        if (!saveOrWarn()) return;
      }

      wiz.step = 2;
      renderAnalyze();
    };
  }

  /* ---- step 1b: guest (or authed user without profiles) types measurements ---- */

  function renderWizMeasure() {
    view.innerHTML = `
      ${stepsBar(1)}
      <div class="card">
        <div class="card-title">Your measurements (${units()})</div>
        <p class="hint mb-16">Use a soft measuring tape. Fields marked * are required — the rest sharpen the verdict. No account needed — what you type is saved on this device automatically.</p>
        <div class="form-grid">${measurementFields('gm', guestBody || {})}</div>
        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-primary btn-lg" id="wiz-next">Take my measure</button>
          <button class="btn btn-ghost" id="wiz-save-hint">Log in for named profiles</button>
        </div>
      </div>`;

    const saveHint = document.getElementById('wiz-save-hint');
    if (saveHint) saveHint.onclick = () => {
      const typed = collectMeasurements('gm');
      if (typed) { guestBody = typed; Store.saveGuestBody(typed); } // keep what they typed
      requireAuth('Save named profiles', 'Your measurements are already saved on this device. A free account adds named profiles for several people, plus photos and history.');
    };

    document.getElementById('wiz-next').onclick = () => {
      const body = collectMeasurements('gm');
      if (!body) return;
      guestBody = body;
      Store.saveGuestBody(body); // auto-save: a refresh never loses these
      wiz.step = 2;
      renderAnalyze();
    };
  }

  /* ---- step 2: the garment ---- */

  function renderWizStep2() {
    const u = Auth.user();
    const types = Object.entries(FitEngine.SIZE_CHARTS);

    view.innerHTML = `
      ${stepsBar(2)}
      <div class="card">
        <div class="card-title">Tell us about the garment</div>

        <div class="section-label">Garment type</div>
        <div class="chip-row mb-16" id="type-chips">
          ${types.map(([key, c]) => `<button class="chip ${wiz.garmentType === key ? 'selected' : ''}" data-type="${key}">${esc(c.label)}</button>`).join('')}
        </div>

        <div class="field">
          <label for="wz-name">Name it (optional)</label>
          <input class="input" id="wz-name" type="text" value="${esc(wiz.garmentName)}" placeholder="e.g. Blue linen shirt from Zara">
        </div>

        <div class="section-label">How do you like it to fit?</div>
        <div class="chip-row mb-16" id="fit-chips">
          <button class="chip ${wiz.fitPref === 'slim' ? 'selected' : ''}" data-fit="slim">Slim / fitted</button>
          <button class="chip ${wiz.fitPref === 'regular' ? 'selected' : ''}" data-fit="regular">Regular</button>
          <button class="chip ${wiz.fitPref === 'relaxed' ? 'selected' : ''}" data-fit="relaxed">Relaxed / oversized</button>
        </div>

        <div class="section-label">Use the brand's size guide (optional)</div>
        ${wiz.customChart ? `
        <div class="reco-banner good" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="flex:1;min-width:200px">✓ Using <strong>${esc(wiz.customChart.brand)}</strong>'s own size guide — sizes ${esc(wiz.customChart.sizeOrder.join(', '))}</span>
          <button class="btn btn-ghost btn-sm" id="chart-remove">Remove</button>
        </div>` : `
        <p class="hint mb-8">Paste a link to the product or the brand's size-guide page. FitCheck reads their chart and judges the fit by the brand's own numbers.</p>
        <div class="btn-row mb-8">
          <input class="input" id="wz-url" type="url" inputmode="url" placeholder="https://brand.com/size-guide" value="${esc(wiz.chartUrl)}" style="flex:1;min-width:200px">
          <button class="btn btn-secondary" id="chart-fetch">Fetch guide</button>
        </div>
        <p class="hint mb-16" id="chart-msg"></p>`}

        <div class="section-label">Size you're considering (optional)</div>
        <p class="hint mb-8">Leave empty and FitCheck will simply recommend your best size.</p>
        <div class="chip-row mb-16" id="size-chips">
          <button class="chip ${wiz.pickedSize === '' ? 'selected' : ''}" data-size="">Not sure</button>
          ${(wiz.customChart ? wiz.customChart.sizeOrder : FitEngine.SIZE_ORDER).map(s => `<button class="chip ${wiz.pickedSize === s ? 'selected' : ''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>

        <div class="section-label">Photo of the garment (optional)</div>
        ${u ? '' : '<p class="hint mb-8">Photos are saved with your results, so they need an account.</p>'}
        <div class="photo-grid" style="grid-template-columns:1fr">
          <div class="photo-slot" id="garment-slot">
            <div class="slot-label">Garment photo</div>
            ${wiz.garmentPhoto ? `<img class="thumb" src="${wiz.garmentPhoto}" alt="">` : `
            <div class="placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="m9 7 1.5-3h3L15 7"/><circle cx="12" cy="13" r="3.5"/></svg>
            </div>`}
            <div class="btn-row">
              <button class="btn btn-secondary btn-sm" id="garment-photo-btn">${wiz.garmentPhoto ? 'Replace photo' : (u ? 'Take or upload photo' : 'Log in to add a photo')}</button>
              ${wiz.garmentPhoto ? '<button class="btn btn-ghost btn-sm" id="garment-photo-del">Remove</button>' : ''}
            </div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="wiz-back">Back</button>
          <button class="btn btn-primary btn-lg" id="wiz-run">Get the verdict</button>
        </div>
      </div>`;

    // persist everything typed on this step before any re-render,
    // so chip clicks don't wipe the name or a pasted size-guide link
    const saveName = () => {
      wiz.garmentName = document.getElementById('wz-name').value;
      const urlEl = document.getElementById('wz-url');
      if (urlEl) wiz.chartUrl = urlEl.value;
    };

    document.getElementById('type-chips').onclick = e => {
      const c = e.target.closest('[data-type]');
      if (!c) return;
      saveName();
      wiz.garmentType = c.getAttribute('data-type');
      renderWizStep2();
    };
    document.getElementById('fit-chips').onclick = e => {
      const c = e.target.closest('[data-fit]');
      if (!c) return;
      saveName();
      wiz.fitPref = c.getAttribute('data-fit');
      renderWizStep2();
    };
    document.getElementById('size-chips').onclick = e => {
      const c = e.target.closest('[data-size]');
      if (!c) return;
      saveName();
      wiz.pickedSize = c.getAttribute('data-size');
      renderWizStep2();
    };
    const fetchBtn = document.getElementById('chart-fetch');
    if (fetchBtn) fetchBtn.onclick = async () => {
      const urlInput = document.getElementById('wz-url');
      const msg = document.getElementById('chart-msg');
      const url = urlInput.value.trim();
      if (!url) { toast('Paste a link first.', 'err'); return; }
      saveName();
      wiz.chartUrl = url;
      fetchBtn.disabled = true;
      fetchBtn.textContent = 'Reading…';
      msg.textContent = 'Opening the page and looking for a size chart…';
      try {
        const resp = await fetch('api/size-chart?url=' + encodeURIComponent(url));
        if (!resp.ok) throw new Error('server');
        const data = await resp.json();
        if (!data.ok) { msg.textContent = '✕ ' + data.error; fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch guide'; return; }
        const chart = FitEngine.buildCustomChart(data);
        if (!chart) throw new Error('bad chart');
        wiz.customChart = chart;
        if (wiz.pickedSize && !chart.sizes[wiz.pickedSize]) wiz.pickedSize = '';
        toast('Found ' + data.brand + "'s size guide!", 'ok');
        renderWizStep2();
      } catch (e) {
        msg.textContent = location.protocol === 'file:'
          ? '✕ This feature needs a connection — open FitCheck from its web address, not a local file.'
          : '✕ Could not reach the size-guide reader — check your connection and try again.';
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch guide';
      }
    };
    // arrived via the share sheet with a link waiting → read it automatically
    if (fetchBtn && wiz.autoFetchShare && wiz.chartUrl && !wiz.customChart) {
      wiz.autoFetchShare = false;
      fetchBtn.click();
    }
    const removeBtn = document.getElementById('chart-remove');
    if (removeBtn) removeBtn.onclick = () => {
      saveName();
      wiz.customChart = null;
      if (wiz.pickedSize && !FitEngine.SIZE_CHARTS[wiz.garmentType].sizes[wiz.pickedSize]) wiz.pickedSize = '';
      renderWizStep2();
    };

    document.getElementById('garment-photo-btn').onclick = () => {
      saveName();
      // Camera + photos require an account (photos are saved to it)
      if (!requireAuth('Camera & photos need an account', 'Photos are saved with your profile and history, so FitCheck asks you to log in before using the camera or uploading images.')) return;
      Camera.pickImage({
        onImage: dataUrl => { wiz.garmentPhoto = dataUrl; renderWizStep2(); },
        onError: msg => toast(msg, 'err')
      });
    };
    const delBtn = document.getElementById('garment-photo-del');
    if (delBtn) delBtn.onclick = () => { saveName(); wiz.garmentPhoto = null; renderWizStep2(); };

    document.getElementById('wiz-back').onclick = () => { saveName(); wiz.step = 1; renderAnalyze(); };
    document.getElementById('wiz-run').onclick = () => { saveName(); runAnalysis(); };
  }

  function runAnalysis() {
    const u = Auth.user();
    let body, profileName, profileId;

    if (u && u.profiles.length && wiz.profileId) {
      const profile = u.profiles.find(p => p.id === wiz.profileId) || u.profiles[0];
      body = profile.body;
      profileName = profile.name;
      profileId = profile.id;
    } else {
      if (!guestBody) { wiz.step = 1; renderAnalyze(); return; }
      body = guestBody;
      profileName = 'You';
      profileId = null;
    }

    if (!Money.canUse()) { Money.showPaywall(() => render()); return; }
    const result = FitEngine.analyze(wiz.garmentType, body, wiz.fitPref, wiz.pickedSize || null, wiz.customChart);
    if (!result) { toast('Could not analyze this garment.', 'err'); return; }
    Money.consume(); // a fit check was produced
    Store.recordResponse({ garmentType: wiz.garmentType, fitPref: wiz.fitPref, pickedSize: wiz.pickedSize || '', newSex: wiz.newSex });

    const analysis = {
      id: u ? Store.uid() : 'guest',
      date: Date.now(),
      profileId,
      profileName,
      garmentLabel: result.garmentLabel,
      garmentName: wiz.garmentName.trim(),
      garmentPhoto: wiz.garmentPhoto,
      size: result.evaluatedSize,
      score: result.score,
      result
    };

    if (u) {
      u.analyses.push(analysis);
      if (u.analyses.length > 40) u.analyses = u.analyses.slice(-40); // keep photos from filling the device
      saveOrWarn();
    } else {
      guestResult = analysis;
    }

    wiz = null; // reset wizard for the next run
    ceremony(() => go('result/' + analysis.id));
  }

  /* The verdict ceremony — a short "taking your measure" beat before
     the reveal. The result renders behind it, then the curtain thins. */
  function ceremony(done) {
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { done(); return; }

    const el = document.createElement('div');
    el.className = 'ceremony';
    el.innerHTML = `
      <div class="ceremony-inner">
        <div class="ceremony-tape" aria-hidden="true"></div>
        <div class="ceremony-phrase" id="cer-phrase">Taking your measure…</div>
      </div>`;
    document.body.appendChild(el);

    const phrases = ['Chalking the pattern…', 'Pinning the seams…'];
    let i = 0;
    const cycle = setInterval(() => {
      const p = el.querySelector('#cer-phrase');
      if (p && phrases[i]) {
        p.classList.remove('swap');
        void p.offsetWidth; // restart the swap animation
        p.textContent = phrases[i];
        p.classList.add('swap');
      }
      i++;
    }, 640);

    setTimeout(() => {
      clearInterval(cycle);
      done();
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 500);
    }, 1850);
  }

  /* ==========================================================
     RESULT PAGE
     ========================================================== */

  const STATUS_COLOR = {
    good: 'var(--good)', tight: 'var(--bad)', loose: 'var(--warn)',
    short: 'var(--info)', long: 'var(--info)', info: 'var(--text-3)'
  };

  function renderResultPage(id) {
    const u = Auth.user();
    const isGuest = id === 'guest';
    const a = isGuest ? guestResult : (u ? u.analyses.find(x => x.id === id) : null);
    if (!a) { go(isGuest ? 'analyze' : 'history'); return; }

    const r = a.result;
    const profile = u && a.profileId ? u.profiles.find(p => p.id === a.profileId) : null;

    const ringColor = r.score >= 82 ? 'var(--good)' : r.score >= 65 ? 'var(--warn)' : 'var(--bad)';
    const RADIUS = 52, C = 2 * Math.PI * RADIUS;
    const dashOffset = C * (1 - r.score / 100);

    const recoGood = r.bestSize === r.evaluatedSize && r.score >= 65;

    view.innerHTML = `
      ${stepsBar(3)}
      <div class="card result-card">
        ${r.score >= 90 ? '<div class="stamp" aria-hidden="true">Well fitted</div>' : ''}
        <div class="result-head">
          <div class="score-ring">
            <svg width="118" height="118" viewBox="0 0 118 118">
              <circle class="ring-bg" cx="59" cy="59" r="${RADIUS}" fill="none" stroke-width="9"/>
              <circle class="ring-val" cx="59" cy="59" r="${RADIUS}" fill="none" stroke-width="9"
                stroke="${ringColor}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
            </svg>
            <div class="ring-center">
              <div class="ring-num" style="color:${ringColor}" id="ring-num">0</div>
              <div class="ring-cap">FIT SCORE</div>
            </div>
          </div>
          <div style="flex:1;min-width:220px">
            <div class="verdict-line">${esc(r.verdict)}</div>
            <p class="muted small" style="margin-top:6px">
              ${esc(a.garmentName || r.garmentLabel)} · ${esc(r.fitPref)} fit · for ${esc(a.profileName)}
            </p>
            ${r.brand ? `<p class="small" style="margin-top:4px">Judged against <a href="${esc(r.source || '#')}" target="_blank" rel="noopener">${esc(r.brand)}'s own size guide</a></p>` : ''}
            <div class="small muted" style="margin-top:10px">Confidence — based on how many measurements you've provided</div>
            <div class="conf-track"><div class="conf-fill" style="width:${r.confidence}%"></div></div>
            <div class="small muted" style="margin-top:4px">${r.confidence}%${r.confidence < 80 ? ' · add more measurements to raise this' : ''}</div>
          </div>
        </div>

        <div class="reco-banner ${recoGood ? 'good' : 'warn'}">
          ${recoGood
            ? `✓ <strong>Size ${esc(r.bestSize)}</strong> is your best size for this garment — go with it.`
            : `→ Recommended size: <strong>${esc(r.bestSize)}</strong> (fit score ${r.bestScore})${r.pickedSize ? ` — better than ${esc(r.pickedSize)} for your measurements.` : '.'}`}
        </div>
      </div>

      ${r.tiebreaker ? `
      <div class="card">
        <div class="section-label">The tiebreaker</div>
        <h3 class="mb-8">You're between ${esc(r.tiebreaker.a)} and ${esc(r.tiebreaker.b)}</h3>
        <p class="muted small mb-8">
          ${r.tiebreaker.aWins.length ? `<strong>${esc(r.tiebreaker.a)}</strong> wins the ${esc(listJoin(r.tiebreaker.aWins))}. ` : ''}
          ${r.tiebreaker.bWins.length ? `<strong>${esc(r.tiebreaker.b)}</strong> wins the ${esc(listJoin(r.tiebreaker.bWins))}. ` : ''}
          ${!r.tiebreaker.aWins.length && !r.tiebreaker.bWins.length ? 'They land almost identically on the tape.' : ''}
        </p>
        <p class="small" style="font-weight:600">${esc(r.tiebreaker.call)}</p>
      </div>` : ''}

      ${isGuest ? promoCard('This result isn’t saved. Create a free account to keep your history, measurements and photos.') : ''}

      ${(a.garmentPhoto || (profile && profile.photos && profile.photos.body)) ? `
      <div class="card">
        <div class="card-title">Side by side</div>
        <div class="photo-pair">
          ${profile && profile.photos && profile.photos.body ? `<figure><img src="${profile.photos.body}" alt=""><figcaption>${esc(a.profileName)}</figcaption></figure>` : ''}
          ${a.garmentPhoto ? `<figure><img src="${a.garmentPhoto}" alt=""><figcaption>${esc(a.garmentName || r.garmentLabel)}</figcaption></figure>` : ''}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-title">Fit map — size ${esc(r.evaluatedSize)}</div>
        <div class="fitmap-wrap">
          ${fitmapSvg(r)}
          <div class="fitmap-legend">
            ${Object.entries(r.zones).map(([zk, z]) => `
              <div class="legend-item">
                <span class="zone-dot ${z.status}"></span>
                ${esc(FitEngine.ZONES[zk].label)} — <strong style="color:${STATUS_COLOR[z.status]}">${z.status === 'good' ? 'good' : z.status === 'info' ? 'no data' : FitEngine.statusWord(z.status)}</strong>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Zone by zone</div>
        <div class="zone-list">
          ${Object.entries(r.zones).map(([zk, z]) => `
          <div class="zone-card">
            <span class="zone-dot ${z.status}"></span>
            <div class="zone-body">
              <div class="zone-name">
                <span>${esc(FitEngine.ZONES[zk].label)}</span>
                <span class="zone-status ${z.status}">${z.status === 'info' ? 'no data' : z.status === 'good' ? 'good fit' : FitEngine.statusWord(z.status)}</span>
              </div>
              <div class="zone-msg">${esc(z.message)}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>

      ${r.silhouette && r.silhouette.length ? `
      <div class="card">
        <div class="section-label">Your silhouette</div>
        <p class="muted small mb-16">What your proportions mean for how clothes fit you — any garment, any brand.</p>
        <div class="zone-list">
          ${r.silhouette.map(s => `
          <div class="zone-card">
            <span class="zone-dot" style="background:var(--accent)"></span>
            <div class="zone-body">
              <div class="zone-name"><span>${esc(s.label)}</span></div>
              <div class="zone-msg">${esc(s.note)}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-title">Every size, scored for you</div>
        <table class="size-table">
          <thead><tr><th>Size</th><th style="width:55%">Fit score</th><th></th></tr></thead>
          <tbody>
            ${r.allSizes.map(s => {
              const color = s.score >= 82 ? 'var(--good)' : s.score >= 65 ? 'var(--warn)' : 'var(--bad)';
              return `
              <tr class="${s.size === r.bestSize ? 'best-row' : ''} ${s.size === r.evaluatedSize ? 'picked-row' : ''}">
                <td>${s.size}${s.size === r.bestSize ? ' <span class="badge">Best</span>' : ''}${s.size === r.evaluatedSize && r.pickedSize ? ' (your pick)' : ''}</td>
                <td><div class="bar-track"><div class="bar-fill" style="width:${s.score}%;background:${color}"></div></div></td>
                <td style="text-align:right;font-weight:700">${s.score}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${(typeof RECS !== 'undefined' && Array.isArray(RECS) && RECS.some(i => i.types.includes(r.garmentType))) ? `
      <div class="promo-card">
        <span class="promo-icon">${REC_ICON}</span>
        <div class="promo-body">
          <div class="promo-title">You'd like these</div>
          <div class="promo-text">${esc((FitEngine.SIZE_CHARTS[r.garmentType] || {}).label || 'Garment')} picks matched to your size ${esc(r.bestSize)} — hand-chosen brands.</div>
        </div>
        <a class="btn btn-primary" href="#/foryou">See the picks</a>
      </div>` : ''}

      <div class="btn-row mb-16">
        <button class="btn btn-primary btn-lg" id="res-again">Check another garment</button>
        ${isGuest ? '' : '<button class="btn btn-secondary" id="res-history">View history</button>'}
        ${isGuest ? '' : '<button class="btn btn-danger btn-sm" id="res-delete" style="margin-left:auto">Delete</button>'}
      </div>

      ${Money.bannerHTML('content')}`;

    wirePromo();
    Money.wireAds(view);

    // animate ring + count the number up
    requestAnimationFrame(() => {
      const ring = view.querySelector('.ring-val');
      if (ring) requestAnimationFrame(() => ring.setAttribute('stroke-dashoffset', dashOffset.toFixed(1)));
      const numEl = document.getElementById('ring-num');
      const t0 = performance.now(), DUR = 850;
      (function tick(now) {
        const p = Math.min(1, (now - t0) / DUR);
        const eased = 1 - Math.pow(1 - p, 3);
        numEl.textContent = Math.round(r.score * eased);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });

    document.getElementById('res-again').onclick = () => { wiz = null; go('analyze'); };
    const histBtn = document.getElementById('res-history');
    if (histBtn) histBtn.onclick = () => go('history');
    const delBtn = document.getElementById('res-delete');
    if (delBtn) delBtn.onclick = () => confirmModal(
      'Delete this fit check?', 'This result will be removed from your history.', 'Delete',
      () => {
        u.analyses = u.analyses.filter(x => x.id !== a.id);
        saveOrWarn();
        go('history');
      });
  }

  /* ---------- fit map: body silhouette with colored zones ---------- */

  function fitmapSvg(r) {
    const col = zk => r.zones[zk] ? STATUS_COLOR[r.zones[zk].status] : 'transparent';
    const has = zk => !!r.zones[zk];
    const band = (y, h, zk, rx) => has(zk)
      ? `<rect x="52" y="${y}" width="76" height="${h}" rx="${rx || 8}" fill="${col(zk)}" opacity="0.55"/>` : '';

    return `
    <svg class="fitmap-svg" width="180" height="300" viewBox="0 0 180 300" aria-hidden="true">
      <g fill="#e6dfd0">
        <circle cx="90" cy="30" r="17"/>
        <path d="M62 55 Q90 46 118 55 L126 62 Q133 66 135 78 L142 130 Q143 139 136 141 Q130 142 128 135 L121 96 L121 160 Q121 168 113 168 L67 168 Q59 168 59 160 L59 96 L52 135 Q50 142 44 141 Q37 139 38 130 L45 78 Q47 66 54 62 Z"/>
        <path d="M62 172 L84 172 L84 262 Q84 270 76 270 L70 270 Q64 270 64 262 Z"/>
        <path d="M96 172 L118 172 L116 262 Q116 270 110 270 L104 270 Q96 270 96 262 Z"/>
      </g>
      ${has('shoulders') ? `<rect x="54" y="53" width="72" height="10" rx="5" fill="${col('shoulders')}" opacity="0.6"/>` : ''}
      ${band(78, 22, 'chest')}
      ${band(108, 20, 'waist')}
      ${band(136, 22, 'hips')}
      ${has('thigh') ? `<rect x="60" y="176" width="26" height="26" rx="8" fill="${col('thigh')}" opacity="0.6"/><rect x="94" y="176" width="26" height="26" rx="8" fill="${col('thigh')}" opacity="0.6"/>` : ''}
      ${has('sleeveLength') ? `
        <rect x="38" y="70" width="11" height="68" rx="5" fill="${col('sleeveLength')}" opacity="0.6"/>
        <rect x="131" y="70" width="11" height="68" rx="5" fill="${col('sleeveLength')}" opacity="0.6"/>` : ''}
      ${has('torsoLength') ? `<rect x="86" y="58" width="8" height="108" rx="4" fill="${col('torsoLength')}" opacity="0.7"/>` : ''}
      ${has('inseam') ? `
        <rect x="70" y="176" width="8" height="88" rx="4" fill="${col('inseam')}" opacity="0.7"/>
        <rect x="102" y="176" width="8" height="88" rx="4" fill="${col('inseam')}" opacity="0.7"/>` : ''}
    </svg>`;
  }

  /* ==========================================================
     HISTORY (saved results — account required)
     ========================================================== */

  function renderHistory() {
    const u = Auth.user();

    if (!u) {
      view.innerHTML = `
        <div class="card">
          <div class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
            <h3>Your fit checks, remembered</h3>
            <p>With a free account every verdict is saved here, so you can compare garments and come back anytime.</p>
            <button class="btn btn-primary btn-lg" data-promo-login>Log in / Create free account</button>
          </div>
        </div>`;
      wirePromo();
      return;
    }

    const analyses = u.analyses.slice().reverse();
    view.innerHTML = `
      <div class="card">
        <div class="card-title">Fit check history</div>
        ${analyses.length ? `<div class="row-list">${analyses.map(analysisRow).join('')}</div>` : `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
          <h3>No fittings on the books yet</h3>
          <p>Every verdict is pinned here, so you can come back and compare garments anytime.</p>
          <a href="#/analyze" class="btn btn-primary">Start a fitting</a>
        </div>`}
      </div>`;

    wireAnalysisRows();
  }

  /* ==========================================================
     FOR YOU — "You'd like this…" curated picks
     (links live in js/recs.js; aff field = affiliate link slot)
     ========================================================== */

  const REC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12 12 3.5h8.5V12L12 20.5 3.5 12Z"/><circle cx="16" cy="8" r="1.4"/></svg>';

  function latestAnalysis() {
    const u = Auth.user();
    if (u && u.analyses.length) return u.analyses[u.analyses.length - 1];
    return guestResult;
  }

  function recRow(item) {
    const link = item.aff || item.url;
    return `
      <a class="list-row rec-row" href="${esc(link)}" target="_blank" rel="noopener sponsored">
        <span class="row-thumb">${REC_ICON}</span>
        <span class="row-main">
          <span class="title">${esc(item.name)}</span>
          <span class="sub">${esc(item.note)}</span>
        </span>
        <span class="badge">${esc(item.brand)}</span>
        <span class="rec-arrow" aria-hidden="true">&#8599;</span>
      </a>`;
  }

  function renderForYou() {
    const recs = (typeof RECS !== 'undefined' && Array.isArray(RECS)) ? RECS : [];
    const last = latestAnalysis();
    const lastType = last && last.result ? last.result.garmentType : null;
    const lastPref = last && last.result ? last.result.fitPref : null;
    const lastBest = last && last.result ? last.result.bestSize : null;

    const fitOk = item => !item.fits || !lastPref || item.fits.includes(lastPref);
    const primary = lastType ? recs.filter(i => i.types.includes(lastType) && fitOk(i)) : [];
    const shown = new Set(primary);

    // the rest, grouped by garment type in chart order
    const groups = [];
    for (const [key, chart] of Object.entries(FitEngine.SIZE_CHARTS)) {
      if (key === lastType) continue;
      const items = recs.filter(i => !shown.has(i) && i.types.includes(key));
      items.forEach(i => shown.add(i));
      if (items.length) groups.push({ label: chart.label, items });
    }

    const typeLabel = lastType && FitEngine.SIZE_CHARTS[lastType] ? FitEngine.SIZE_CHARTS[lastType].label : null;

    view.innerHTML = `
      <div class="card">
        <h2 class="mb-8">You'd like these</h2>
        ${last && typeLabel
          ? `<p class="muted small">Matched to your last fitting — ${esc(typeLabel.toLowerCase())}${lastBest ? `, size <strong>${esc(lastBest)}</strong>` : ''}${lastPref ? `, ${esc(lastPref)} fit` : ''}. Links open the brand's site.</p>`
          : `<p class="muted small">Hand-picked places to shop each garment type. <a href="#/analyze">Run a fitting</a> and this page tailors itself to your size and taste.</p>`}
      </div>

      ${primary.length ? `
      <div class="card">
        <div class="section-label">Because you checked a ${esc(typeLabel.toLowerCase())}</div>
        <div class="row-list">${primary.map(recRow).join('')}</div>
      </div>` : ''}

      ${groups.map(g => `
      <div class="card">
        <div class="section-label">${esc(g.label)}</div>
        <div class="row-list">${g.items.map(recRow).join('')}</div>
      </div>`).join('')}

      ${recs.length ? '' : `
      <div class="card"><div class="empty">
        ${REC_ICON}
        <h3>Nothing on the rail yet</h3>
        <p>Add recommendations to js/recs.js and they appear here.</p>
      </div></div>`}

      <p class="disclosure">Some links may earn FitCheck a small commission. It never changes what's recommended.</p>`;
  }

  /* ==========================================================
     COLOURS — personal colour analysis (on-device, from a selfie)
     ========================================================== */

  function colourKey() {
    const p = getActiveProfile();
    return 'fc_colour_' + ((p && p.id) || 'guest');
  }
  function loadColour() {
    try { return JSON.parse(localStorage.getItem(colourKey()) || 'null'); } catch (e) { return null; }
  }
  function saveColour(res) {
    try { localStorage.setItem(colourKey(), JSON.stringify(res)); } catch (e) {}
  }

  function swatchRow(list) {
    return `<div class="swatch-row">${list.map(s =>
      `<div class="swatch"><span class="sw-chip" style="background:${esc(s.hex)}"></span><span class="sw-name">${esc(s.name)}</span></div>`
    ).join('')}</div>`;
  }

  function colourResultCard(res) {
    return `
      <div class="card">
        <div class="colour-head">
          ${res.skinHex ? `<span class="skin-dot" style="background:${esc(res.skinHex)}" title="Detected skin tone"></span>` : ''}
          <div>
            <div class="card-title" style="margin:0">${esc(res.season)}</div>
            <div class="muted small">${esc(res.tone)}${(res.confidence != null && !res.refined) ? ` · ${Math.round(res.confidence * 100)}% photo confidence` : ''}</div>
          </div>
        </div>
        <p class="muted small mb-16">${esc(res.why)}</p>

        <div class="section-label">Wear these — they flatter you</div>
        ${swatchRow(res.wear)}

        <div class="section-label">Your best neutrals</div>
        ${swatchRow(res.neutrals)}

        <div class="section-label">Go easy on these</div>
        ${swatchRow(res.avoid)}

        <div class="btn-row mt-16">
          <button class="btn btn-secondary" id="col-refine">Refine undertone</button>
          <button class="btn btn-ghost" id="col-redo">Start over</button>
        </div>
      </div>`;
  }

  function wireColourResult(res) {
    const refine = document.getElementById('col-refine');
    const redo = document.getElementById('col-redo');
    if (refine) refine.onclick = () => refineColourFlow(res);
    if (redo) redo.onclick = () => {
      try { localStorage.removeItem(colourKey()); } catch (e) {}
      renderColours();
    };
  }

  function startColourFlow() {
    Camera.pickImage({
      onImage: dataUrl => {
        const box = document.getElementById('col-result');
        if (box) box.innerHTML = '<div class="card"><div class="empty"><p>Reading your colouring…</p></div></div>';
        ColourAI.analyze(dataUrl, res => {
          if (!res) {
            if (box) box.innerHTML = '';
            toast('Could not read skin tone from that photo — try a clearer, well-lit selfie.', 'err');
            return;
          }
          saveColour(res);
          if (box) { box.innerHTML = colourResultCard(res); wireColourResult(res); }
          if (res.confidence < 0.4) toast('The light made this a rough estimate — tap "Refine undertone" to confirm.', 'ok');
        });
      },
      onError: msg => toast(msg, 'err')
    });
  }

  // Photo light lies — three physical checks pin down the undertone reliably.
  function refineColourFlow(res) {
    const overlay = openModal(`
      <h3 class="card-title">Confirm your undertone</h3>
      <p class="muted small mb-16">Cameras and lighting can mislead — these three checks are more reliable than any photo.</p>

      <div class="section-label">The veins on your inner wrist look…</div>
      <div class="chip-row mb-16" id="q-veins">
        <button class="chip" data-v="cool">Blue / purple</button>
        <button class="chip" data-v="warm">Green</button>
        <button class="chip" data-v="neutral">Hard to tell</button>
      </div>

      <div class="section-label">Which metal suits you better?</div>
      <div class="chip-row mb-16" id="q-metal">
        <button class="chip" data-v="cool">Silver</button>
        <button class="chip" data-v="warm">Gold</button>
        <button class="chip" data-v="neutral">Both look fine</button>
      </div>

      <div class="section-label">In the sun your skin usually…</div>
      <div class="chip-row mb-16" id="q-sun">
        <button class="chip" data-v="cool">Burns, rarely tans</button>
        <button class="chip" data-v="warm">Tans easily</button>
        <button class="chip" data-v="neutral">A bit of both</button>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" id="q-cancel">Cancel</button>
        <button class="btn btn-primary" id="q-apply" disabled>Update my palette</button>
      </div>`);

    const answers = { veins: null, metal: null, sun: null };
    ['veins', 'metal', 'sun'].forEach(gid => {
      const row = overlay.querySelector('#q-' + gid);
      row.onclick = e => {
        const c = e.target.closest('[data-v]');
        if (!c) return;
        row.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        answers[gid] = c.getAttribute('data-v');
        overlay.querySelector('#q-apply').disabled = !(answers.veins && answers.metal && answers.sun);
      };
    });

    overlay.querySelector('#q-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#q-apply').onclick = () => {
      let warm = 0, cool = 0;
      Object.keys(answers).forEach(g => {
        if (answers[g] === 'warm') warm++; else if (answers[g] === 'cool') cool++;
      });
      const undertone = warm > cool ? 'warm' : cool > warm ? 'cool' : 'neutral';
      const next = ColourAI.fromChoice(undertone, res.depth, res.skinHex);
      Store.recordResponse({ veins: answers.veins, metal: answers.metal, sun: answers.sun, _colour: true });
      saveColour(next);
      overlay.remove();
      renderColours();
      toast('Palette updated to ' + next.season + '.', 'ok');
    };
  }

  function renderColours() {
    const saved = loadColour();
    const active = getActiveProfile();
    const whose = active ? esc(active.name) : 'you';

    view.innerHTML = `
      <div class="card">
        <h2 class="mb-8">Your colours</h2>
        <p class="muted small mb-16">FitCheck reads your skin tone from a selfie — entirely on your device, nothing is uploaded — and finds the colours that flatter ${whose} most. Works best in soft, natural daylight with no filter.</p>
        <button class="btn btn-primary" id="col-start">${saved ? 'Analyse a new photo' : 'Analyse my colours'}</button>
      </div>
      <div id="col-result">${saved ? colourResultCard(saved) : ''}</div>`;

    document.getElementById('col-start').onclick = startColourFlow;
    if (saved) wireColourResult(saved);
  }

  /* ==========================================================
     OUTFITS — community outfit ideas (server-side, moderated)
     ========================================================== */

  function scorePillClass(s) { return s >= 80 ? 's-good' : s >= 60 ? 's-warn' : 's-bad'; }

  /* ---- community safety: stable poster id, block list, reporting ---- */
  function posterUid() {
    const u = Auth.user();
    if (!u || !u.email) return '';
    let h = 0; const s = 'fc:' + String(u.email).toLowerCase();
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'u' + (h >>> 0).toString(36);
  }
  function blockedSet() {
    try { return new Set(JSON.parse(localStorage.getItem('fc_blocked') || '[]')); }
    catch (e) { return new Set(); }
  }
  function blockUser(uid) {
    if (!uid) return;
    const s = blockedSet(); s.add(uid);
    try { localStorage.setItem('fc_blocked', JSON.stringify([...s])); } catch (e) {}
  }

  function outfitCard(p) {
    return `
      <div class="outfit-card" data-uid="${esc(p.uid || '')}">
        <div class="outfit-photo">
          <img src="${p.image}" alt="${esc(p.caption)}" loading="lazy">
          ${p.ai ? `<span class="outfit-score score-pill ${scorePillClass(p.ai.score)}">${p.ai.score}</span>` : ''}
        </div>
        <div class="outfit-body">
          <div class="outfit-caption">${esc(p.caption)}</div>
          <div class="outfit-meta">${esc(p.name)} · ${new Date(p.ts).toLocaleDateString()}</div>
          ${p.ai && p.ai.notes && p.ai.notes.length ? `
          <div class="outfit-notes">${p.ai.notes.slice(0, 2).map(t => `<div class="outfit-note">${esc(t)}</div>`).join('')}</div>` : ''}
          <div class="outfit-actions">
            <button class="of-act" data-report="${esc(p.id)}">Report</button>
            ${p.uid ? `<button class="of-act" data-block="${esc(p.uid)}" data-name="${esc(p.name)}">Block</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Any viewer can flag a post; it is hidden at once and re-checked by a human.
  function reportOutfitFlow(id, cardEl) {
    const reasons = ['Nudity or sexual content', 'Hate or harassment', 'Violence or dangerous acts', 'Spam or scam', 'Not my photo / copyright', 'Something else'];
    const overlay = openModal(`
      <h3 class="card-title">Report this outfit</h3>
      <p class="muted small mb-16">Reported posts are hidden immediately and re-checked by a moderator. What's wrong?</p>
      ${reasons.map(r => `<button class="btn btn-secondary btn-block mb-8" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}
      <div class="btn-row"><button class="btn btn-secondary" id="rp-cancel">Cancel</button></div>`);
    overlay.querySelector('#rp-cancel').onclick = () => overlay.remove();
    overlay.querySelectorAll('[data-reason]').forEach(b => b.onclick = () => {
      overlay.querySelectorAll('[data-reason]').forEach(x => { x.disabled = true; });
      fetch('api/outfits/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reason: b.getAttribute('data-reason') })
      }).then(r => r.json()).then(d => {
        overlay.remove();
        if (d.ok) { if (cardEl) cardEl.remove(); toast('Reported and hidden — thanks for flagging.', 'ok'); }
        else toast(d.error || 'Could not report.', 'err');
      }).catch(() => { overlay.remove(); toast('Could not reach FitCheck — check your connection.', 'err'); });
    });
  }

  function wireOutfitActions(container) {
    container.querySelectorAll('[data-report]').forEach(b => b.onclick = () =>
      reportOutfitFlow(b.getAttribute('data-report'), b.closest('.outfit-card')));
    container.querySelectorAll('[data-block]').forEach(b => b.onclick = () => {
      const uid = b.getAttribute('data-block');
      const nm = b.getAttribute('data-name') || 'this user';
      const overlay = openModal(`
        <h3 class="card-title">Block ${esc(nm)}?</h3>
        <p class="muted small mb-16">You won't see any posts from ${esc(nm)} again on this device.</p>
        <div class="btn-row">
          <button class="btn btn-secondary" id="bk-cancel">Cancel</button>
          <button class="btn btn-danger" id="bk-ok">Block</button>
        </div>`);
      overlay.querySelector('#bk-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#bk-ok').onclick = () => {
        blockUser(uid);
        container.querySelectorAll('.outfit-card[data-uid="' + uid + '"]').forEach(el => el.remove());
        overlay.remove();
        toast("Blocked. You won't see their posts.", 'ok');
      };
    });
  }

  function renderOutfits() {
    view.innerHTML = `
      <div class="card">
        <h2 class="mb-8">Outfit ideas</h2>
        <p class="muted small mb-16">Real outfits from the community, posted for inspiration. Every post is reviewed by a human before it appears here.</p>
        <button class="btn btn-primary" id="of-post">Share your outfit</button>
        <a href="terms.html" target="_blank" rel="noopener" class="muted small" style="margin-left:14px;text-decoration:underline">Community Guidelines</a>
      </div>
      <div id="of-feed"><div class="card"><div class="empty"><p>Loading outfits…</p></div></div></div>`;

    document.getElementById('of-post').onclick = postOutfitFlow;

    fetch('api/outfits')
      .then(r => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(d => {
        const feed = document.getElementById('of-feed');
        if (!feed || !d.ok) return;
        const blocked = blockedSet();
        const posts = (d.posts || []).filter(p => !p.uid || !blocked.has(p.uid));
        feed.innerHTML = posts.length
          ? `<div class="outfit-grid">${posts.map(outfitCard).join('')}</div>`
          : `<div class="card"><div class="empty">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v2"/><path d="m12 9 8.2 6.1a1.6 1.6 0 0 1-1 2.9H4.8a1.6 1.6 0 0 1-1-2.9L12 9Z"/></svg>
               <h3>Nothing on the rail yet</h3>
               <p>Be the first — share an outfit and give someone their next idea.</p>
             </div></div>`;
        wireOutfitActions(feed);
      })
      .catch(() => {
        const feed = document.getElementById('of-feed');
        if (feed) feed.innerHTML = `<div class="card"><div class="empty">
          <h3>Can't reach the outfit feed</h3>
          <p>Check your internet connection and try again in a moment.</p>
        </div></div>`;
      });
  }

  function postOutfitFlow() {
    const u = Auth.user();
    if (!requireAuth('Posting needs an account', 'Outfit posts carry your name and a photo, so FitCheck asks you to log in first. Posts are reviewed before they appear.')) return;

    Camera.pickImage({
      onImage: dataUrl => {
        let aiResult = null;

        const overlay = openModal(`
          <h3 class="card-title">Share your outfit</h3>
          <img src="${dataUrl}" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-bottom:14px">
          <div id="of-ai" class="of-ai"><span class="muted small">Rating your look…</span></div>
          <div class="field">
            <label for="of-caption">Caption <span class="req">*</span></label>
            <input class="input" id="of-caption" type="text" maxlength="200" placeholder="e.g. Relaxed linen for warm evenings">
          </div>
          <div class="field">
            <label for="of-name">Posted as</label>
            <input class="input" id="of-name" type="text" maxlength="40" value="${esc(u ? u.name : '')}">
          </div>
          <label class="agree mb-16">
            <input type="checkbox" id="of-agree">
            <span class="small">This is my own photo and it contains no nudity, hate, or content I'm not allowed to share. I agree to the <a href="terms.html" target="_blank" rel="noopener">Community Guidelines</a>, and understand a moderator reviews every post before it goes live.</span>
          </label>
          <div class="btn-row">
            <button class="btn btn-secondary" id="of-cancel">Cancel</button>
            <button class="btn btn-primary" id="of-send" disabled>Send for review</button>
          </div>`);

        // rate the look on-device; the poster sees the verdict before sending
        StyleAI.rate(dataUrl, res => {
          aiResult = res;
          const box = overlay.querySelector('#of-ai');
          if (!box) return;
          box.innerHTML = res
            ? `<div class="of-ai-head">
                 <span class="score-pill ${scorePillClass(res.score)}">${res.score} / 100</span>
                 <strong class="small">Style score</strong>
               </div>
               ${res.notes.map(t => `<div class="outfit-note">${esc(t)}</div>`).join('')}`
            : '';
        });

        overlay.querySelector('#of-cancel').onclick = () => overlay.remove();
        // Send stays locked until the poster agrees to the content policy.
        overlay.querySelector('#of-agree').onchange = e => {
          overlay.querySelector('#of-send').disabled = !e.target.checked;
        };
        overlay.querySelector('#of-send').onclick = () => {
          if (!overlay.querySelector('#of-agree').checked) { toast('Please confirm the guidelines first.', 'err'); return; }
          const caption = overlay.querySelector('#of-caption').value.trim();
          if (!caption) { toast('Add a short caption first.', 'err'); return; }
          const name = overlay.querySelector('#of-name').value.trim() || 'Anonymous';
          const btn = overlay.querySelector('#of-send');
          btn.disabled = true; btn.textContent = 'Sending…';
          fetch('api/outfits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, uid: posterUid(), caption, image: dataUrl, ai: aiResult })
          })
            .then(r => r.json())
            .then(d => {
              if (!d.ok) { toast(d.error || 'Could not send the post.', 'err'); btn.disabled = false; btn.textContent = 'Send for review'; return; }
              overlay.remove();
              toast('Sent for review — it appears once approved.', 'ok');
            })
            .catch(() => {
              toast('Could not reach FitCheck — check your connection and try again.', 'err');
              btn.disabled = false; btn.textContent = 'Send for review';
            });
        };
      },
      onError: msg => toast(msg, 'err')
    });
  }

  /* ---- hidden moderation inbox (#/moderate) — approve or reject posts ---- */

  function renderModerate() {
    const saved = (() => { try { return localStorage.getItem('fc_admin_key') || ''; } catch (e) { return ''; } })();

    view.innerHTML = `
      <div class="card">
        <h2 class="mb-8">Moderation</h2>
        <p class="muted small mb-16">Pending outfit posts wait here until you approve or reject them. The key is printed in the server terminal at startup (and kept in data/admin_key.txt).</p>
        <div class="btn-row mb-16">
          <input class="input" id="mod-key" type="password" placeholder="Moderation key" value="${esc(saved)}" style="flex:1;min-width:200px">
          <button class="btn btn-primary" id="mod-load">Load queue</button>
        </div>
        <div id="mod-list"></div>
      </div>`;

    const list = document.getElementById('mod-list');

    const act = (id, action, key) => {
      fetch('api/outfits/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, id, action })
      })
        .then(r => r.json())
        .then(d => {
          if (!d.ok) { toast(d.error || 'Failed.', 'err'); return; }
          toast(action === 'approve' ? 'Approved — it is live.' : 'Rejected and deleted.', 'ok');
          load();
        })
        .catch(() => toast('Server unreachable.', 'err'));
    };

    const load = () => {
      const key = document.getElementById('mod-key').value.trim();
      if (!key) { toast('Enter the moderation key.', 'err'); return; }
      try { localStorage.setItem('fc_admin_key', key); } catch (e) {}
      list.innerHTML = '<p class="muted small">Loading…</p>';
      fetch('api/outfits/pending?key=' + encodeURIComponent(key))
        .then(r => r.json())
        .then(d => {
          if (!d.ok) { list.innerHTML = `<p class="small" style="color:var(--bad)">${esc(d.error || 'Failed.')}</p>`; return; }
          if (!d.posts.length) { list.innerHTML = '<p class="muted small">Queue is empty — nothing waiting for review.</p>'; return; }
          list.innerHTML = d.posts.map(p => `
            <div class="mod-row">
              <img src="${p.image}" alt="">
              <div class="mod-body">
                <div class="outfit-caption">${esc(p.caption)} ${p.ai ? `<span class="score-pill ${scorePillClass(p.ai.score)}">${p.ai.score}</span>` : ''}</div>
                <div class="outfit-meta">${esc(p.name)} · ${new Date(p.ts).toLocaleString()}</div>
                ${p.status === 'reported' ? `<div class="mod-flag">Reported${p.reports > 1 ? ' ×' + p.reports : ''} — ${esc(p.report_reason || 'flagged for review')}</div>` : ''}
                ${p.ai && p.ai.notes && p.ai.notes.length ? `<div class="outfit-note">${esc(p.ai.notes[0])}</div>` : ''}
                <div class="btn-row mt-8">
                  <button class="btn btn-primary btn-sm" data-approve="${esc(p.id)}">${p.status === 'reported' ? 'Keep live' : 'Approve'}</button>
                  <button class="btn btn-danger btn-sm" data-reject="${esc(p.id)}">${p.status === 'reported' ? 'Remove' : 'Reject'}</button>
                </div>
              </div>
            </div>`).join('');
          const key2 = document.getElementById('mod-key').value.trim();
          list.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => act(b.getAttribute('data-approve'), 'approve', key2));
          list.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => act(b.getAttribute('data-reject'), 'reject', key2));
        })
        .catch(() => { list.innerHTML = '<p class="small" style="color:var(--bad)">Could not reach the server. Check your connection.</p>'; });
    };

    document.getElementById('mod-load').onclick = load;
    if (saved) load();
  }

  /* ==========================================================
     HELP — tutorial on using the app correctly
     ========================================================== */

  function renderHelp() {
    const u = Auth.user();
    const uL = units();
    const tip = (name, text) => `
      <div class="zone-card">
        <span class="zone-dot" style="background:var(--primary)"></span>
        <div class="zone-body">
          <div class="zone-name">${esc(name)}</div>
          <div class="zone-msg">${esc(text)}</div>
        </div>
      </div>`;

    view.innerHTML = `
      <div class="hero-cta">
        <h2>How to use FitCheck</h2>
        <p>Three minutes here saves you every wrong-size order later. Good measurements in — good verdicts out.</p>
        <a href="#/analyze" class="btn btn-lg">Jump straight in</a>
      </div>

      <div class="card">
        <div class="card-title">Quick start</div>
        <div class="help-row"><span class="num-dot">1</span><div><strong>Enter your measurements.</strong> Go to <a href="#/analyze">Analyze</a> and type them in — or save them once as a profile (free account) so it's one tap forever.</div></div>
        <div class="help-row"><span class="num-dot">2</span><div><strong>Describe the garment.</strong> Pick the type (t-shirt, jeans, dress…), how you like it to fit, and — if you're eyeing one — the size you're considering. Paste the shop's link and FitCheck reads the brand's own size chart. With an account you can also snap a photo of it.</div></div>
        <div class="help-row"><span class="num-dot">3</span><div><strong>Read the verdict.</strong> You get a fit score, a zone-by-zone breakdown of what's tight or loose, and the best size to buy.</div></div>
      </div>

      <div class="card">
        <div class="card-title">Measure yourself like a tailor</div>
        <p class="muted small mb-16">Use a <strong>soft measuring tape</strong> over thin clothing or bare skin. Keep the tape <strong>level and snug — never pulled tight</strong> — and breathe normally. If you don't have a tape, wrap a string and measure it against a ruler.</p>
        <div class="zone-list">
          ${tip('Height', 'Stand straight against a wall without shoes, heels touching it. Mark the top of your head and measure to the floor.')}
          ${tip('Chest / Bust', 'Wrap the tape around the fullest part of your chest, under the armpits, arms relaxed at your sides.')}
          ${tip('Waist', 'Measure around your natural waistline — the narrowest point, usually just above the belly button. Do not suck in!')}
          ${tip('Hips', 'Stand with feet together and measure around the widest part of your hips and seat.')}
          ${tip('Shoulder width', 'Across your upper back, from the bony tip of one shoulder to the other. Easier with a helper.')}
          ${tip('Arm length', 'From the shoulder tip, over a slightly bent elbow, down to the wrist bone.')}
          ${tip('Inseam', 'From the top of your inner thigh (crotch) straight down to your ankle bone. Trousers you own that fit well are a great reference.')}
          ${tip('Thigh', 'Around the widest part of your upper thigh, usually just below the seat.')}
        </div>
        <p class="hint mt-16">Measurements are shown in <strong>${uL}</strong> — you can switch between cm and inches in <a href="#/settings">Settings</a>.</p>
      </div>

      <div class="card">
        <div class="card-title">Reading your verdict</div>
        <p class="muted small mb-16">The <strong>fit score</strong> (0–100) says how well one size suits your body and fit preference:</p>
        <div class="row-list mb-16">
          <div class="list-row" style="cursor:default"><span class="score-pill s-good">82+</span><span class="row-main"><span class="title">Great fit</span><span class="sub">Buy with confidence.</span></span></div>
          <div class="list-row" style="cursor:default"><span class="score-pill s-warn">65–81</span><span class="row-main"><span class="title">Wearable, with compromises</span><span class="sub">Check which zones are off and decide if you can live with them.</span></span></div>
          <div class="list-row" style="cursor:default"><span class="score-pill s-bad">&lt;65</span><span class="row-main"><span class="title">Not your size</span><span class="sub">The recommended size in the banner will score better.</span></span></div>
        </div>
        <p class="muted small mb-8">Each body zone gets its own color-coded status:</p>
        <div class="zone-list">
          <div class="zone-card"><span class="zone-dot good"></span><div class="zone-body"><div class="zone-name">Good</div><div class="zone-msg">Close to the ideal amount of room for the fit you chose.</div></div></div>
          <div class="zone-card"><span class="zone-dot tight"></span><div class="zone-body"><div class="zone-name">Too tight</div><div class="zone-msg">Less room than your body needs there — it will pull, pinch or restrict.</div></div></div>
          <div class="zone-card"><span class="zone-dot loose"></span><div class="zone-body"><div class="zone-name">Too loose</div><div class="zone-msg">Noticeably more room than intended — expect bagginess.</div></div></div>
          <div class="zone-card"><span class="zone-dot short"></span><div class="zone-body"><div class="zone-name">Too short / too long</div><div class="zone-msg">Sleeves, length or inseam don't match your proportions.</div></div></div>
          <div class="zone-card"><span class="zone-dot info"></span><div class="zone-body"><div class="zone-name">No data</div><div class="zone-msg">You haven't given that measurement — add it to raise the confidence rating.</div></div></div>
        </div>
        <p class="hint mt-16">The "Best" tag in the size table marks your best size. <strong>Confidence</strong> reflects how many of your measurements FitCheck could use — more measurements, sharper verdict.</p>
      </div>

      <div class="card">
        <div class="card-title">What needs an account?</div>
        <p class="muted small mb-16">Fit checks are free to use with no account. You only need one (also free, stored on this device) for things that must be <em>remembered</em>:</p>
        <div class="help-row"><span class="num-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg></span><div><strong>Saving your measurements</strong> as body profiles — including profiles for family members.</div></div>
        <div class="help-row"><span class="num-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="m9 7 1.5-3h3L15 7"/><circle cx="12" cy="13" r="3.5"/></svg></span><div><strong>The camera and photos</strong> — face, full-body and garment photos are stored with your profile.</div></div>
        <div class="help-row"><span class="num-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span><div><strong>History</strong> — every verdict saved, so you can compare garments later.</div></div>
        ${u ? '' : '<button class="btn btn-primary mt-8" data-promo-login>Create my free account</button>'}
      </div>

      <div class="card">
        <div class="card-title">FAQ</div>
        <div class="faq">
          <details>
            <summary>How accurate is the verdict?</summary>
            <div class="faq-body">FitCheck compares your measurements against standard international size charts with tailoring "ease" rules — the extra room a slim, regular or relaxed fit should have. It's a strong guide, but brands do vary: when a shop publishes its own size chart, cross-check the winning size against it.</div>
          </details>
          <details>
            <summary>Can FitCheck use a brand's own size chart?</summary>
            <div class="faq-body">Yes — in the Analyze step, paste a link to the product page or the brand's size-guide page and press "Fetch guide". FitCheck opens the page, finds their size chart (following "size guide" links if needed) and judges every size by the brand's own numbers instead of the standard charts. Tip: if a product page doesn't work, open the brand's size-guide page in your browser and paste that link — some shops only load their chart with JavaScript, which can't be read.</div>
          </details>
          <details>
            <summary>Why does it disagree with the size I always buy?</summary>
            <div class="faq-body">Vanity sizing is real — an "M" at one brand is an "L" at another. FitCheck judges by centimetres, not labels. Also check your fit preference: a relaxed fit shifts the recommendation up compared to slim.</div>
          </details>
          <details>
            <summary>Is my data uploaded anywhere?</summary>
            <div class="faq-body">No. Your account, measurements, photos and history live only in this browser on this device. Nothing is sent to a server — which also means clearing browser data erases it, and accounts don't transfer between devices.</div>
          </details>
          <details>
            <summary>The camera doesn't open — what now?</summary>
            <div class="faq-body">First, you need to be logged in. Then the camera needs permission (check the icon in your address bar) and a secure connection (https or localhost). If it still won't start, use "Upload from device" — it works everywhere and does exactly the same job.</div>
          </details>
          <details>
            <summary>Some zones say "no data". Is that bad?</summary>
            <div class="faq-body">Not bad — just less precise. Only height, chest, waist and hips are required. Adding shoulders, arm length, inseam and thigh lets FitCheck judge sleeves, garment length and trouser fit too, and raises the confidence rating.</div>
          </details>
          <details>
            <summary>Can I use FitCheck as a phone app?</summary>
            <div class="faq-body">Yes — it installs like a native app. iPhone: Safari → Share → "Add to Home Screen". Android: Chrome → menu ⋮ → "Install app". Full steps are in <a href="#/settings">Settings</a>. Once installed it even works offline.</div>
          </details>
        </div>
      </div>

      <div class="card text-center">
        <h3 class="mb-8">Ready to check a fit?</h3>
        <p class="muted small mb-16">You now know everything you need.</p>
        <a href="#/analyze" class="btn btn-primary btn-lg">Start a fit check</a>
      </div>`;

    wirePromo();
  }

  /* ==========================================================
     ANALYTICS DASHBOARD
     ========================================================== */

  function renderDashboard() {
    view.innerHTML = Dashboard.renderDashboard(Store.getResponses());
  }

  /* ==========================================================
     SETTINGS
     ========================================================== */

  function renderSettings() {
    const u = Auth.user();

    view.innerHTML = `
      ${Money.proCardHTML()}
      <div class="card">
        <div class="card-title">Account</div>
        ${u ? `
        <div class="list-row" style="cursor:default">
          <span class="row-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg></span>
          <span class="row-main">
            <span class="title">${esc(u.name)}</span>
            <span class="sub">${esc(u.email)} · joined ${new Date(u.createdAt).toLocaleDateString()}</span>
          </span>
        </div>
        <div class="btn-row mt-16">
          <button class="btn btn-secondary" id="st-pass">Change password</button>
          <button class="btn btn-secondary" id="st-logout">Log out</button>
        </div>` : `
        <p class="muted small mb-16">You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.</p>
        <button class="btn btn-primary" data-promo-login>Log in / Create free account</button>`}
      </div>

      <div class="card">
        <div class="card-title">Units</div>
        <p class="muted small mb-16">Used everywhere you see or enter measurements.</p>
        <div class="chip-row">
          <button class="chip ${units() === 'cm' ? 'selected' : ''}" data-unit="cm">Centimetres (cm)</button>
          <button class="chip ${units() === 'in' ? 'selected' : ''}" data-unit="in">Inches (in)</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Language</div>
        <p class="muted small mb-16">The interface language for FitCheck on this device. Each screen is translated the first time you open it, then saved — so it gets faster (and works offline) the more you use it.</p>
        <div class="field">
          <select class="input" id="st-lang">
            ${I18n.LANGS.map(l => `<option value="${l.code}" ${I18n.current() === l.code ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-title">For you</div>
        <a class="list-row" href="#/dashboard">
          <span class="row-thumb">📊</span>
          <span class="row-main">
            <span class="title">Analytics</span>
            <span class="sub">See which fit preferences and colours matter most to our users</span>
          </span>
          <span class="rec-arrow">→</span>
        </a>
      </div>

      <div class="card">
        <div class="card-title">Install FitCheck</div>
        ${(!isStandalone() && deferredInstallPrompt) ? '<button class="btn btn-primary mb-16" id="st-install">Install now</button>' : ''}
        <p class="muted small">FitCheck works as an app on your phone:</p>
        <div class="zone-list mt-8">
          <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">iPhone / iPad</div><div class="zone-msg">Open in Safari → Share button → "Add to Home Screen".</div></div></div>
          <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">Android</div><div class="zone-msg">Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".</div></div></div>
          <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">Desktop</div><div class="zone-msg">Chrome / Edge → install icon in the address bar.</div></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Privacy & data</div>
        <p class="muted small mb-8">Your ${u ? 'account, measurements, profiles, photos and history live' : 'preferences live'} only in this browser on this device — never uploaded. Clearing browser data erases them.</p>
        <p class="muted small mb-16">Some features do use the internet: translating the interface, reading a brand's size guide, and posting to the community (your photo, caption and display name). Details in our <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> and <a href="terms.html" target="_blank" rel="noopener">Terms</a>.</p>
        ${u ? '<button class="btn btn-danger" id="st-delete">Delete my account & data</button>' : ''}
      </div>`;

    wirePromo();

    view.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => {
      if (setUnits(b.getAttribute('data-unit'))) {
        toast('Units set to ' + b.getAttribute('data-unit') + '.', 'ok');
        renderSettings();
      }
    });

    const langSel = document.getElementById('st-lang');
    if (langSel) langSel.onchange = () => { I18n.set(langSel.value); render(); };

    const stInstall = document.getElementById('st-install');
    if (stInstall) stInstall.onclick = () => triggerInstall(null);

    Money.wireProCard(view);

    if (!u) return;

    document.getElementById('st-logout').onclick = doLogout;

    document.getElementById('st-pass').onclick = () => {
      const overlay = openModal(`
        <h3 class="card-title">Change password</h3>
        <div class="field"><label>Current password</label><input class="input" id="cp-old" type="password"></div>
        <div class="field"><label>New password</label><input class="input" id="cp-new" type="password" placeholder="At least 6 characters"></div>
        <div class="btn-row mt-8">
          <button class="btn btn-secondary" id="cp-cancel">Cancel</button>
          <button class="btn btn-primary" id="cp-save">Update password</button>
        </div>`);
      overlay.querySelector('#cp-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#cp-save').onclick = async () => {
        const res = await Auth.changePassword(
          overlay.querySelector('#cp-old').value,
          overlay.querySelector('#cp-new').value
        );
        if (!res.ok) { toast(res.error, 'err'); return; }
        overlay.remove();
        toast('Password updated.', 'ok');
      };
    };

    document.getElementById('st-delete').onclick = () => confirmModal(
      'Delete your account?',
      'This permanently removes your account, profiles, photos and history from this device. It cannot be undone.',
      'Delete everything',
      () => {
        Auth.deleteAccount();
        toast('Account deleted.');
        go('home');
        render();
      });
  }

  /* ==========================================================
     Boot
     ========================================================== */

  function doLogout() {
    Auth.logout();
    wiz = null;
    guestResult = null;
    authTab = 'login';
    toast('Logged out — you can keep using FitCheck as a guest.');
    go('home');
    render();
  }

  logoutBtn.addEventListener('click', doLogout);
  loginBtn.addEventListener('click', () => {
    returnTo = location.hash || '#/home';
    authTab = 'login';
    go('login');
  });
  window.addEventListener('hashchange', render);

  // Web Share Target (Android): a product link shared from the browser lands
  // here as ?url=…&text=…&title=…  Stash it, drop the query so a refresh won't
  // re-fire, and open the Analyze flow — the wizard reads it at the garment step.
  (function () {
    try {
      const qs = new URLSearchParams(location.search);
      const raw = qs.get('url') || qs.get('text') || qs.get('title') || '';
      if (!raw) return;
      const m = raw.match(/https?:\/\/[^\s"']+/);
      if (m) {
        try { sessionStorage.setItem('fc_shared_url', m[0]); } catch (e) {}
        history.replaceState(null, '', location.pathname + '#/analyze');
      }
    } catch (e) { /* ignore malformed share payloads */ }
  })();

  // Capture the browser's install prompt so we can offer a tasteful affordance.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if ((currentRoute()[0] || 'home') === 'home') injectInstallBanner();
  });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; });

  Auth.restore();
  render();

  // Entry splash: build in (~1.8s), hold composed for 2s, then release —
  // removal lands just after the CSS exit animation completes
  const splash = document.getElementById('splash');
  if (splash) {
    // A silent reload after a service-worker update is not a new visit —
    // the flag is set just before that reload, so skip the second welcome.
    let skip = false;
    try {
      skip = sessionStorage.getItem('fc-skip-splash') === '1';
      sessionStorage.removeItem('fc-skip-splash');
    } catch (e) { /* private mode — just show the splash */ }

    if (skip) {
      splash.remove();
    } else {
      const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => splash.remove(), reduced ? 2300 : 4850);
    }
  }

  // PWA: register the service worker (needs http(s), not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // When an updated service worker replaces the old one, reload once
    // so the user immediately runs the new version of the app.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      // this reload is an app update, not a new visit — no second splash
      try { sessionStorage.setItem('fc-skip-splash', '1'); } catch (e) {}
      location.reload();
    });
  }
})();
