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

  // Gate an action behind Pro. Returns true if already Pro.
  function requirePro(title, body) {
    if (Money.isPro()) return true;
    const overlay = openModal(`
      <div class="pro-gate-top"><span class="pro-gate-badge">✦ Pro</span></div>
      <h3 class="card-title">${esc(title)}</h3>
      <p class="muted" style="margin-bottom:16px">${esc(body)}</p>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn btn-accent btn-block btn-lg" data-act="go">See ${esc(Money.config().proName)}</button>
        <button class="btn btn-ghost btn-block" data-act="later">Not now</button>
      </div>`);
    overlay.querySelector('[data-act="later"]').onclick = () => overlay.remove();
    overlay.querySelector('[data-act="go"]').onclick = () => { overlay.remove(); go('settings'); };
    return false;
  }

  // Many big retailers (Shein, ASOS, Zara…) either draw their size chart with
  // JavaScript or block server fetches, so the URL reader can't reach it. But
  // the numbers are right there on the shopper's screen — this lets them type
  // the chart in by hand. It produces the exact same shape the fetcher does,
  // so it flows through FitEngine.buildCustomChart → analyze identically.
  const MANUAL_ZONES = [
    ['chest', 'Chest / Bust'],
    ['waist', 'Waist'],
    ['hips', 'Hips'],
    ['shoulders', 'Shoulder'],
    ['sleeveLength', 'Sleeve'],
    ['torsoLength', 'Length'],
    ['inseam', 'Inseam']
  ];

  // '90-95', '90–95 cm', '37,5' → a single number (range → midpoint).
  // Mirrors the server's cell_value so manual and fetched charts agree.
  function parseChartCell(text) {
    const t = String(text || '').replace(/,/g, '.').replace(/[–—]/g, '-');
    const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) return null;
    if (nums.length >= 2 && nums[1] > nums[0] && (nums[1] - nums[0]) <= 25) {
      return Math.round(((nums[0] + nums[1]) / 2) * 10) / 10;
    }
    return nums[0];
  }

  function openManualChartModal(garmentType, onDone) {
    // seed the columns from what this garment actually has a chart for, so a
    // top opens on Chest and jeans on Waist/Hips rather than a blank guess
    const seedZones = FitEngine.sizesFor(garmentType, userSex()).length
      ? (FitEngine.chartFor(garmentType, userSex()) || {}).zones : null;
    const st = {
      brand: '',
      mode: 'body',                       // 'body' | 'garment'
      active: {},
      labels: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      vals: {}                            // vals[label][zoneKey] = raw string
    };
    (seedZones && seedZones.length ? seedZones : ['chest']).forEach(z => {
      if (MANUAL_ZONES.some(m => m[0] === z)) st.active[z] = true;
    });
    if (!Object.keys(st.active).length) st.active.chest = true;

    const overlay = openModal('');
    const modal = overlay.querySelector('.modal');
    modal.style.maxWidth = '580px';

    function readInputs() {
      const b = modal.querySelector('#mc-brand');
      if (b) st.brand = b.value;
      modal.querySelectorAll('[data-label]').forEach(inp => {
        st.labels[+inp.getAttribute('data-label')] = inp.value;
      });
      modal.querySelectorAll('[data-cell]').forEach(inp => {
        const [i, zone] = inp.getAttribute('data-cell').split('|');
        (st.vals[i] = st.vals[i] || {})[zone] = inp.value;
      });
    }

    function build() {
      const zones = MANUAL_ZONES.filter(z => st.active[z[0]]).map(z => z[0]);
      const sizes = {}, order = [];
      st.labels.forEach((rawLabel, i) => {
        const label = String(rawLabel || '').trim().toUpperCase();
        if (!label) return;
        const cells = st.vals[i] || {};
        const vals = {};
        zones.forEach(z => {
          const v = parseChartCell(cells[z]);
          if (v != null) vals[z] = v;
        });
        if (Object.keys(vals).length && !sizes[label]) {
          sizes[label] = vals; order.push(label);
        }
      });
      const usedZones = Array.from(new Set(order.flatMap(s => Object.keys(sizes[s]))));
      if (order.length < 2 || !usedZones.length) return null;
      return {
        ok: true,
        brand: (st.brand || '').trim() || 'Custom',
        source: null,
        units: 'cm',
        measurements: st.mode,            // buildCustomChart: bodyChart = mode !== 'garment'
        zones: usedZones,
        sizeOrder: order,
        sizes: sizes
      };
    }

    function render() {
      const zones = MANUAL_ZONES.filter(z => st.active[z[0]]);
      modal.innerHTML = `
        <h3 class="card-title">Enter the size guide</h3>
        <p class="muted small" style="margin-bottom:14px">Read the numbers off your screenshot of the brand's size guide and type them in. Ranges like <strong>90-95</strong> are fine. In centimetres.</p>

        <label class="field-label" for="mc-brand">Brand (optional)</label>
        <input class="input mb-12" id="mc-brand" type="text" value="${esc(st.brand)}" placeholder="e.g. ASOS">

        <div class="section-label">These numbers are…</div>
        <div class="chip-row mb-4" id="mc-mode">
          <button class="chip ${st.mode === 'body' ? 'selected' : ''}" data-mode="body">Body measurements</button>
          <button class="chip ${st.mode === 'garment' ? 'selected' : ''}" data-mode="garment">Garment measurements</button>
        </div>
        <p class="hint mb-12">${st.mode === 'body'
          ? "The wearer's body (a “Body chart” / “Kroppsmått” tab). Compared directly."
          : "The flat garment's own size (a “Product chart”). Room for movement is added on top."}</p>

        <div class="section-label">Which columns does the chart have?</div>
        <div class="chip-row mb-12" id="mc-zones">
          ${MANUAL_ZONES.map(([k, lab]) => `<button class="chip ${st.active[k] ? 'selected' : ''}" data-zone="${k}">${esc(lab)}</button>`).join('')}
        </div>

        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table class="mc-grid">
            <thead><tr><th>Size</th>${zones.map(z => `<th>${esc(z[1])}</th>`).join('')}</tr></thead>
            <tbody>
              ${st.labels.map((lab, i) => `
                <tr>
                  <td><input class="input input-sm" data-label="${i}" type="text" value="${esc(lab)}" style="width:64px"></td>
                  ${zones.map(z => `<td><input class="input input-sm" data-cell="${i}|${z[0]}" type="text" inputmode="decimal" value="${esc((st.vals[i] || {})[z[0]] || '')}" placeholder="–" style="width:72px"></td>`).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn btn-ghost btn-sm mb-8" id="mc-addrow">+ Add a size row</button>

        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="mc-cancel">Cancel</button>
          <button class="btn btn-primary" id="mc-save">Use this guide</button>
        </div>`;

      modal.querySelector('#mc-mode').onclick = e => {
        const b = e.target.closest('[data-mode]'); if (!b) return;
        readInputs(); st.mode = b.getAttribute('data-mode'); render();
      };
      modal.querySelector('#mc-zones').onclick = e => {
        const b = e.target.closest('[data-zone]'); if (!b) return;
        readInputs();
        const k = b.getAttribute('data-zone');
        if (st.active[k]) delete st.active[k]; else st.active[k] = true;
        if (!Object.keys(st.active).length) st.active[k] = true; // keep at least one
        render();
      };
      modal.querySelector('#mc-addrow').onclick = () => {
        readInputs(); st.labels.push(''); render();
        const rows = modal.querySelectorAll('[data-label]');
        rows[rows.length - 1].focus();
      };
      modal.querySelector('#mc-cancel').onclick = () => overlay.remove();
      modal.querySelector('#mc-save').onclick = () => {
        readInputs();
        const data = build();
        if (!data) { toast('Add at least 2 sizes with a measurement each.', 'err'); return; }
        const chart = FitEngine.buildCustomChart(data);
        if (!chart) { toast('That chart didn’t look complete — check the numbers.', 'err'); return; }
        overlay.remove();
        onDone(chart);
      };
    }
    render();
  }

  // Free accounts get 1 body profile; Pro unlocks up to 10.
  const PROFILE_CAP_FREE = 1;
  const PROFILE_CAP_PRO = 10;
  function profileCap() { return Money.isPro() ? PROFILE_CAP_PRO : PROFILE_CAP_FREE; }
  function canAddProfile() {
    const u = Auth.user();
    if (!u) return false;
    if (u.profiles.length < profileCap()) return true;
    if (!Money.isPro()) {
      requirePro('Room for the whole family',
        `Free accounts keep one body profile. ${Money.config().proName} lets you save up to ${PROFILE_CAP_PRO} — a profile each for your partner, kids or friends, so every fit check is one tap for anyone.`);
    } else {
      toast(`That's the max of ${PROFILE_CAP_PRO} profiles. Delete one to add another.`, 'err');
    }
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

  /* ---------- account sync: measurements (profiles) + favourites ---------- */

  // Push the account's body profiles (measurements only — photos stay on the
  // device) up to the server. Call after any profile change.
  function pushProfiles() {
    const u = Auth.user();
    if (!u || !Cloud.isLinked()) return;
    const slim = (u.profiles || []).map(p => ({ id: p.id, name: p.name, sex: p.sex, body: p.body, createdAt: p.createdAt }));
    Cloud.putProfiles(slim, u.activeProfileId).catch(() => {});
  }

  // Reconcile profiles + favourites with the account. Returns true if the
  // local copy changed (so the caller can re-render). No-op when offline.
  async function syncAccountData() {
    const u = Auth.user();
    if (!u || !Cloud.isLinked()) return false;
    let data;
    try { data = await Cloud.getAccountData(); } catch (e) { return false; }
    if (!data || !data.ok) return false;
    let changed = false;

    // --- measurements (body profiles) ---
    if (Array.isArray(data.profiles) && data.profiles.length) {
      // adopt the account's measurements; keep any photos already on this device
      const byId = Object.fromEntries((u.profiles || []).map(p => [p.id, p]));
      u.profiles = data.profiles.map(sp => {
        const local = byId[sp.id];
        return {
          id: sp.id, name: sp.name, sex: sp.sex, body: sp.body || {},
          createdAt: sp.createdAt,
          photos: (local && local.photos) || { face: null, body: null }
        };
      });
      if (data.activeProfileId && u.profiles.some(p => p.id === data.activeProfileId)) {
        u.activeProfileId = data.activeProfileId;
      } else if (!u.activeProfileId && u.profiles.length) {
        u.activeProfileId = u.profiles[0].id;
      }
      Auth.save();
      changed = true;
    } else if ((u.profiles || []).length) {
      // account has none yet — seed it from this device
      pushProfiles();
    }

    // --- favourites (server is the shared truth) ---
    if (Array.isArray(data.favourites)) {
      const all = readFavs();
      all[u.email] = data.favourites;
      writeFavs(all);
      changed = true;
    }
    return changed;
  }

  /* ---------- favourites (hearted products) ---------- */

  const FAV_KEY = 'fitcheck_favourites';
  function favOwner() { const u = Auth.user(); return u ? u.email : 'guest'; }
  // Identity must be UNIQUE per rec — several recs share a brand category URL
  // (e.g. two Uniqlo tees point at the same t-shirts page), so key on
  // brand + name, which is unique in the catalogue.
  function favId(item) { return (item.brand || '') + '|' + (item.name || ''); }
  function readFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch (e) { return {}; } }
  function writeFavs(all) { try { localStorage.setItem(FAV_KEY, JSON.stringify(all)); } catch (e) {} }

  /* Favourites are keyed by brand|name. They used to be keyed by url, which
     collided whenever several recs shared one brand category link — so any
     list saved under the old scheme no longer matches, and every heart
     renders empty even though the item IS saved. Re-key (and collapse any
     duplicates that produces) in place on read, so nobody has to re-tap. */
  function listFavs(owner) {
    const key = owner || favOwner();
    const all = readFavs();
    const list = all[key];
    if (!Array.isArray(list)) return [];

    let changed = false;
    const seen = new Set();
    const out = [];
    for (const f of list) {
      if (!f || typeof f !== 'object') { changed = true; continue; }
      const want = favId(f);
      if (f.id !== want) { f.id = want; changed = true; }
      if (seen.has(want)) { changed = true; continue; }
      seen.add(want);
      out.push(f);
    }
    if (changed) {
      all[key] = out;
      writeFavs(all);
      // keep the account copy in step, or the stale ids come back next sync
      if (Cloud.isLinked() && key === favOwner()) Cloud.putFavourites(out).catch(() => {});
    }
    return out;
  }

  function isFav(id) { return listFavs().some(f => f.id === id); }

  // add/remove a rec item from favourites; returns true if now favourited
  function toggleFav(item) {
    const owner = favOwner();
    const id = favId(item);
    const all = readFavs();
    let list = all[owner] || [];
    const existed = list.some(f => f.id === id);
    if (existed) {
      list = list.filter(f => f.id !== id);
    } else {
      list = [{ id, brand: item.brand, name: item.name, note: item.note, url: item.url,
                img: item.img || '', types: item.types || [], ts: Date.now() }].concat(list);
    }
    all[owner] = list;
    writeFavs(all);
    if (Cloud.isLinked()) Cloud.putFavourites(list).catch(() => {});
    return !existed;
  }

  // reconstruct a full rec item from its favourite id (falls back to the
  // stored snapshot when it's no longer in the live RECS catalogue)
  function recById(id) {
    const recs = (typeof RECS !== 'undefined' && Array.isArray(RECS)) ? RECS : [];
    return recs.find(r => favId(r) === id) || listFavs().find(f => f.id === id);
  }

  /* ---------- gender ----------
     Drives which size chart is used and which of our other apps are
     worth showing. Guests keep it in their device prefs; account users
     carry it on each body profile (several people, several answers). */

  function guestSex() {
    try { return Store.getGuestPrefs().sex || null; } catch (e) { return null; }
  }
  function setGuestSex(v) {
    try { const p = Store.getGuestPrefs(); p.sex = v; Store.saveGuestPrefs(p); } catch (e) {}
  }
  // The sex in play right now: the active profile's, else the guest's.
  function userSex() {
    const p = getActiveProfile();
    return (p && p.sex) || guestSex();
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

  // format a money amount — currency-agnostic (brands span countries); the
  // surrounding label carries the meaning ("per wear", "paid")
  function money(n) {
    if (n == null || isNaN(n)) return '';
    const r = Math.round(Number(n) * 100) / 100;
    return Number.isInteger(r) ? r.toLocaleString() : r.toFixed(2);
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
    progress: renderProgress,
    wardrobe: renderWardrobe,
    favourites: renderFavourites,
    passport: renderPassport,
    foryou: renderForYou,
    colours: renderColours,
    outfits: renderOutfits,
    moderate: renderModerate, // hidden admin page — not in the nav
    dashboard: renderDashboard,
    settings: renderSettings,
    help: renderHelp,
    more: renderMore,
    login: renderAuth
  };

  // Routes reached via the "More" tab — they light up the More nav item.
  const MORE_ROUTES = ['more', 'profiles', 'passport', 'history', 'progress', 'wardrobe', 'favourites', 'colours', 'settings', 'help', 'dashboard'];

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
    document.body.classList.toggle('guest', !u); // true when no one is signed in
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

    // nav highlight — sub-routes of "More" keep the More tab lit
    const navTarget = MORE_ROUTES.includes(name) ? 'more' : name;
    mainnav.querySelectorAll('a[data-nav]').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-nav') === navTarget);
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
            <img src="icons/apple-touch-icon.png" alt="">
          </span>
          <h1>FitChecker account</h1>
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

      // Link (or create) the cloud account so measurements, favourites and
      // the wardrobe sync across devices. Best-effort — offline or pre-deploy,
      // the app stays local. Once linked, pull the account's saved data down.
      Cloud.link(email, password, res.user.name)
        .then(() => syncAccountData())
        .then(changed => { if (changed) render(); })
        .catch(() => {});

      // If a guest typed measurements before signing up, save them as a profile.
      if (guestBody && !res.user.profiles.length) {
        res.user.profiles.push({ id: Store.uid(), name: 'Me', sex: guestSex(), body: guestBody, photos: { face: null, body: null }, createdAt: Date.now() });
        res.user.activeProfileId = res.user.profiles[0].id;
        Auth.save();
        toast('Your measurements were saved to your new account.', 'ok');
      } else {
        toast(isRegister ? 'Welcome to FitChecker!' : 'Welcome back, ' + res.user.name + '!', 'ok');
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
        <strong>Install FitChecker</strong>
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

  /* ---- home building blocks ---- */

  const HERO_ART = `<div class="hero-art"><img src="img/wardrobe.svg" alt="" width="420" height="240" loading="eager"></div>`;

  // Picture-buttons for every corner of the app — most people scroll the
  // home page before they ever find the nav.
  const QUICK_ACTIONS = [
    { route: 'analyze',    label: 'Check a fit',   cls: 'g-tshirt', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m9 7 1.5-3h3L15 7"/><circle cx="12" cy="13" r="3.5"/>' },
    { route: 'wardrobe',   label: 'My Wardrobe',   cls: 'g-jacket', icon: '<path d="M12 3v7"/><path d="M12 10 5 13.5V20h14v-6.5L12 10Z"/><path d="M12 10c-2 0-3.2-1-3.2-2.4A2.2 2.2 0 0 1 11 5.4"/>' },
    { route: 'passport',   label: 'Size Passport', cls: 'g-shirt',  icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M13 9h5M13 12.5h5M6 15.5h8"/>' },
    { route: 'favourites', label: 'Favourites',    cls: 'g-dress',  icon: '<path d="M12 20.3 4.4 12.7a4.6 4.6 0 0 1 6.5-6.5l1.1 1.1 1.1-1.1a4.6 4.6 0 0 1 6.5 6.5L12 20.3Z"/>' },
    { route: 'outfits',    label: 'Outfit Battle', cls: 'g-hoodie', icon: '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v2"/><path d="m12 9 8.2 6.1a1.6 1.6 0 0 1-1 2.9H4.8a1.6 1.6 0 0 1-1-2.9L12 9Z"/>' },
    { route: 'progress',   label: 'Progress',      cls: 'g-jeans',  icon: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3.5-4 3 2.5L20 7"/>' }
  ];

  function quickActionsCard() {
    return `
      <div class="card">
        <div class="card-title">Jump in</div>
        <div class="qa-grid">
          ${QUICK_ACTIONS.map(a => `
            <a class="qa-tile" href="#/${a.route}">
              <span class="qa-ico ${a.cls}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg></span>
              <span class="qa-label">${a.label}</span>
            </a>`).join('')}
        </div>
      </div>`;
  }

  // A peek at the Size Passport, right on the home page.
  function homeSizesCard(profile) {
    if (!profile || !profile.body || profile.body.chest == null) return '';
    const sizes = computeSizes(profile).slice(0, 4);
    if (!sizes.length) return '';
    return `
      <a class="card home-link-card" href="#/passport">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Your sizes</span><span class="hl-more">Passport →</span>
        </div>
        <p class="muted small mb-16">Worked out from your measurements — tap to see the full card and share it.</p>
        <div class="size-pills">
          ${sizes.map(s => `<span class="size-pill"><span class="sp-cat">${esc(s.label.split(' /')[0])}</span><strong>${esc(s.size)}</strong></span>`).join('')}
        </div>
      </a>`;
  }

  /* ---- our other apps: shown to the audience each one actually suits ----
     TO MAKE ONE LIVE: paste its address into `url`. While a url is empty
     the app still shows, marked "Soon", and isn't clickable — so nobody
     taps through to nothing before it's deployed.
     `audience`: 'female' | 'male' | 'all' — matched against the sizing the
     user picked. Nothing is shown until they've told us. */
  const SISTER_APPS = [
    { name: 'Muse', audience: 'female', cls: 'g-muse', url: '',
      tagline: 'Recreate any makeup look — and find the cheaper dupes for it.',
      icon: '<path d="M10.2 4.4 14 3v7.4h-3.8z"/><rect x="9.6" y="10.4" width="4.9" height="9.8" rx="1"/>' },
    { name: 'Dewy', audience: 'female', cls: 'g-dewy', url: '',
      tagline: 'Build a skincare routine that actually suits your skin.',
      icon: '<path d="M12 3.4s5.6 6 5.6 9.8a5.6 5.6 0 1 1-11.2 0C6.4 9.4 12 3.4 12 3.4Z"/>' },
    { name: 'Aura', audience: 'female', cls: 'g-aura', url: '',
      tagline: 'Your Glow Score — skin analysis from a single selfie.',
      icon: '<path d="M12 3.2l1.8 5.2 5.2 1.8-5.2 1.8L12 17.2l-1.8-5.2L5 10.2l5.2-1.8L12 3.2Z"/><circle cx="18.6" cy="5.4" r="1.1"/>' },
    { name: 'Swoon', audience: 'all', cls: 'g-swoon', url: '',
      tagline: 'Find them the perfect romantic gift in a few taps.',
      icon: '<path d="M12 20.3 4.4 12.7a4.6 4.6 0 0 1 6.5-6.5l1.1 1.1 1.1-1.1a4.6 4.6 0 0 1 6.5 6.5L12 20.3Z"/>' }
  ];

  function sisterAppsCard() {
    const sex = userSex();
    if (!sex) return ''; // never guess — only recommend once they've told us
    const apps = SISTER_APPS.filter(a => a.audience === 'all' || a.audience === sex);
    if (!apps.length) return '';

    return `
      <div class="card">
        <div class="card-title">More from us</div>
        <p class="muted small mb-16">Other apps we make that we think you'd get on with.</p>
        <div class="app-list">
          ${apps.map(a => {
            const inner = `
              <span class="app-ico ${a.cls}"><svg viewBox="0 0 24 24" fill="#fff" stroke="none">${a.icon}</svg></span>
              <span class="app-text">
                <span class="app-name">${esc(a.name)}</span>
                <span class="app-tag">${esc(a.tagline)}</span>
              </span>
              ${a.url ? '<span class="app-go" aria-hidden="true">&#8599;</span>' : '<span class="app-soon">Soon</span>'}`;
            return a.url
              ? `<a class="app-row" href="${esc(a.url)}" target="_blank" rel="noopener">${inner}</a>`
              : `<div class="app-row is-soon">${inner}</div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function homeFavCard() {
    const favs = listFavs().slice(0, 4);
    if (!favs.length) return '';
    return `
      <a class="card home-link-card" href="#/favourites">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>♥ Saved for later <span class="count-chip">${listFavs().length}</span></span><span class="hl-more">All →</span>
        </div>
        <div class="peek-strip">
          ${favs.map(f => `<span class="peek-item">
            <span class="peek-art g-${esc((f.types && f.types[0]) || 'tshirt')}">${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : garmentSvg((f.types && f.types[0]) || 'tshirt')}</span>
            <span class="peek-cap">${esc(f.brand)}</span>
          </span>`).join('')}
        </div>
      </a>`;
  }

  function renderHome() {
    const u = Auth.user();

    if (!u) {
      view.innerHTML = `
        <div class="hero-cta hero-with-art">
          ${HERO_ART}
          <div class="hero-body">
            <h2>Know your fit before you buy</h2>
            <p>Type your measurements, pick a garment, and get a size verdict in 30 seconds — no account needed.</p>
            <a href="#/analyze" class="btn btn-lg">Try a fit check</a>
            <div style="margin-top:12px">${Money.creditsBadgeHTML()}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">How FitChecker works</div>
          <div class="steps-3">
            <div class="step-3">
              <span class="s3-art g-tshirt">${garmentSvg('tshirt')}</span>
              <div><div class="s3-name">1 · Your measurements</div><div class="s3-msg">A soft tape — or let the AI read them from two photos.</div></div>
            </div>
            <div class="step-3">
              <span class="s3-art g-jacket">${garmentSvg('jacket')}</span>
              <div><div class="s3-name">2 · Pick the garment</div><div class="s3-msg">Choose the type and how you like it to fit — slim, regular or relaxed.</div></div>
            </div>
            <div class="step-3">
              <span class="s3-art g-jeans">${garmentSvg('jeans')}</span>
              <div><div class="s3-name">3 · Get your verdict</div><div class="s3-msg">Every size scored, what's too tight or too short flagged, and the size to buy.</div></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">What else is inside</div>
          <div class="qa-grid">
            ${QUICK_ACTIONS.filter(a => a.route !== 'analyze').map(a => `
              <a class="qa-tile" href="#/${a.route}">
                <span class="qa-ico ${a.cls}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg></span>
                <span class="qa-label">${a.label}</span>
              </a>`).join('')}
          </div>
          <p class="muted small mt-16">Your digital wardrobe, your size in every category, the clothes you've saved, the daily outfit battle, and your body over time.</p>
        </div>

        ${sisterAppsCard()}

        ${promoCard('Create a free account to save your measurements, use the camera, add photos and keep your fit-check history.')}

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
      <div class="hero-cta hero-with-art">
        ${HERO_ART}
        <div class="hero-body">
          <h2>Hi ${esc(u.name.split(' ')[0])}</h2>
          <p>${active
            ? `Ready to check a garment against <strong>${esc(active.name)}</strong>?`
            : 'Start by creating a body profile with your measurements.'}</p>
          <a href="#/${active ? 'analyze' : 'profiles'}" class="btn btn-lg">${active ? 'Check a fit' : 'Create my profile'}</a>
          <div style="margin-top:12px">${Money.creditsBadgeHTML()}</div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="num">${u.profiles.length}</div><div class="lbl">Profiles</div></div>
        <div class="stat"><div class="num">${analyses.length}</div><div class="lbl">Fit checks</div></div>
        <div class="stat"><div class="num">${avg == null ? '—' : avg}</div><div class="lbl">Avg fit score</div></div>
      </div>

      ${quickActionsCard()}

      ${homeSizesCard(active)}

      <div id="home-wardrobe"></div>

      ${homeFavCard()}

      ${sisterAppsCard()}

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
    paintHomeWardrobe(u.email);
  }

  /* The wardrobe lives in IndexedDB, so it arrives after the first paint. */
  async function paintHomeWardrobe(owner) {
    const slot = document.getElementById('home-wardrobe');
    if (!slot) return;
    let items = [];
    try { items = await Wardrobe.listItems(owner); } catch (e) { return; }
    if (!slot.isConnected) return;

    if (!items.length) {
      slot.innerHTML = `
        <a class="card home-link-card" href="#/wardrobe">
          <div class="card-title">Your wardrobe is empty</div>
          <p class="muted small">Photograph what you own and FitChecker can build outfits from it, rate them, and tell you what your closet is missing. <span class="hl-more">Open wardrobe →</span></p>
        </a>`;
      return;
    }
    const peek = items.slice(-5).reverse();
    slot.innerHTML = `
      <a class="card home-link-card" href="#/wardrobe">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>My Wardrobe <span class="count-chip">${items.length}</span></span><span class="hl-more">Open →</span>
        </div>
        <div class="peek-strip">
          ${peek.map(it => `<span class="peek-item">
            <span class="peek-art"><img src="${it.img}" alt="" loading="lazy"></span>
            <span class="peek-cap">${esc(it.name || TYPE_LABEL[it.type] || '')}</span>
          </span>`).join('')}
        </div>
      </a>`;
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
          <span>Body profiles <span class="count-chip">${u.profiles.length}/${profileCap()}</span></span>
          <button class="btn btn-primary btn-sm" id="add-profile">+ New profile</button>
        </div>
        <p class="muted small mb-16">Each profile stores measurements and photos. Set one active — it's used for fit checks.${Money.isPro() ? '' : ` Free keeps one profile; <a href="#/settings">Pro</a> unlocks up to ${PROFILE_CAP_PRO}.`}</p>
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

    document.getElementById('add-profile').onclick = () => { if (canAddProfile()) renderProfiles(null); };
    view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderProfiles(b.getAttribute('data-edit')));
    view.querySelectorAll('[data-activate]').forEach(b => b.onclick = () => {
      u.activeProfileId = b.getAttribute('data-activate');
      if (saveOrWarn()) { pushProfiles(); toast('Active profile updated.', 'ok'); render(); }
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

  /* ---------- AI body scan — camera fills the measurement fields ---------- */

  function scanCta() {
    return `
      <div class="scan-cta">
        <span class="scan-cta-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="9" r="2.6"/><path d="M7.5 17c.6-2.3 2.4-3.5 4.5-3.5s3.9 1.2 4.5 3.5"/></svg>
        </span>
        <div class="scan-cta-text">
          <div class="scan-cta-title">AI body scan</div>
          <div class="scan-cta-sub">No tape measure? A front + side photo and the AI fills these in.</div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-scan>Scan me</button>
      </div>`;
  }

  function wireScan(idPrefix) {
    const btn = view.querySelector('[data-scan]');
    if (!btn) return;
    btn.onclick = () => {
      const hEl = document.getElementById(idPrefix + '-height');
      BodyScan.start({
        heightCm: toCm(hEl ? hEl.value : ''),
        unit: units(),
        allowCamera: !!Auth.user(),
        onDone: res => {
          const set = (key, cm) => {
            const el = document.getElementById(idPrefix + '-' + key);
            if (el && cm != null) el.value = disp(cm);
          };
          set('height', res.heightCm);
          ['chest', 'waist', 'hips', 'shoulders', 'armLength', 'inseam', 'thigh'].forEach(k => set(k, res.values[k]));
          const u = Auth.user();
          Store.recordScan(u ? u.email : 'guest', res.heightCm, res.values);
          toast('Measurements filled in from your scan — adjust anything that looks off.', 'ok');
        }
      });
    };
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
        ${scanCta()}
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
    wireScan('pf');

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
          if (saveOrWarn()) { pushProfiles(); toast('Profile deleted.'); renderProfiles(); render(); }
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
        pushProfiles();
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

        ${scanCta()}
        <div class="form-grid">${measurementFields('gm', prof ? prof.body : {})}</div>
        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-primary btn-lg" id="wiz-next">${isNew ? 'Save & continue' : 'Continue'}</button>
        </div>
      </div>`;

    const sel = document.getElementById('who-select');
    if (sel) sel.onchange = () => { wiz.profileId = sel.value; renderWizWho(); };
    wireScan('gm');

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
        if (!canAddProfile()) return;
        const np = { id: Store.uid(), name, sex: wiz.newSex, body, photos: { face: null, body: null }, createdAt: Date.now() };
        u.profiles.push(np);
        if (!u.activeProfileId) u.activeProfileId = np.id;
        if (!saveOrWarn()) return;
        pushProfiles();
        wiz.profileId = np.id;
        toast(`${name} is on the books — next time it's one tap.`, 'ok');
      } else {
        prof.body = body; // any adjustments flow back into the saved profile
        if (!saveOrWarn()) return;
        pushProfiles();
      }

      wiz.step = 2;
      renderAnalyze();
    };
  }

  /* ---- step 1b: guest (or authed user without profiles) types measurements ---- */

  function renderWizMeasure() {
    let sexVal = guestSex();
    view.innerHTML = `
      ${stepsBar(1)}
      <div class="card">
        <div class="card-title">Your measurements (${units()})</div>
        <p class="hint mb-16">Use a soft measuring tape. Fields marked * are required — the rest sharpen the verdict. No account needed — what you type is saved on this device automatically.</p>

        <div class="section-label">Which sizing should we use? <span class="req">*</span></div>
        <p class="hint mb-8">Women's and men's clothing are cut to different charts, so this changes your size.</p>
        <div class="chip-row mb-16" id="gs-sex">
          <button class="chip ${sexVal === 'female' ? 'selected' : ''}" data-sex="female">Female</button>
          <button class="chip ${sexVal === 'male' ? 'selected' : ''}" data-sex="male">Male</button>
        </div>

        ${scanCta()}
        <div class="form-grid">${measurementFields('gm', guestBody || {})}</div>
        <div class="divider"></div>
        <div class="btn-row">
          <button class="btn btn-primary btn-lg" id="wiz-next">Take my measure</button>
          <button class="btn btn-ghost" id="wiz-save-hint">Log in for named profiles</button>
        </div>
      </div>`;

    wireScan('gm');

    document.getElementById('gs-sex').onclick = e => {
      const c = e.target.closest('[data-sex]');
      if (!c) return;
      sexVal = c.getAttribute('data-sex');
      document.querySelectorAll('#gs-sex .chip').forEach(ch => ch.classList.toggle('selected', ch === c));
    };

    const saveHint = document.getElementById('wiz-save-hint');
    if (saveHint) saveHint.onclick = () => {
      const typed = collectMeasurements('gm');
      if (typed) { guestBody = typed; Store.saveGuestBody(typed); } // keep what they typed
      if (sexVal) setGuestSex(sexVal);
      requireAuth('Save named profiles', 'Your measurements are already saved on this device. A free account adds named profiles for several people, plus photos and history.');
    };

    document.getElementById('wiz-next').onclick = () => {
      if (!sexVal) { toast('Pick female or male sizing first.', 'err'); return; }
      const body = collectMeasurements('gm');
      if (!body) return;
      guestBody = body;
      setGuestSex(sexVal);
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
        <div class="mb-16" id="type-chips">
          ${typeTiles(types.map(([key, c]) => ({ key, label: c.label })), wiz.garmentType, 'Garment type')}
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
        <p class="hint mb-8">Paste a link to the product or the brand's size-guide page. FitChecker reads their chart and judges the fit by the brand's own numbers.</p>
        <div class="btn-row mb-8">
          <input class="input" id="wz-url" type="url" inputmode="url" placeholder="https://brand.com/size-guide" value="${esc(wiz.chartUrl)}" style="flex:1;min-width:200px">
          <button class="btn btn-secondary" id="chart-fetch">Fetch guide</button>
        </div>
        <p class="hint mb-8" id="chart-msg"></p>
        <div class="reco-banner mb-16" id="chart-fallback" style="display:none;background:var(--surface);border:1px solid var(--border)">
          <p class="small" style="margin:0 0 4px"><strong>That shop blocks automatic reading.</strong> Many do (Shein, ASOS, Zara…).</p>
          <p class="small muted" style="margin:0 0 10px">Open the brand's <strong>size guide</strong> on their website, screenshot it so you can see the numbers, then pop them in here — it takes about ten seconds and works for any brand.</p>
          <button class="btn btn-primary btn-sm" id="chart-manual" type="button">Enter it from the size guide</button>
        </div>`}

        <div class="section-label">Size you're considering (optional)</div>
        <p class="hint mb-8">Leave empty and FitChecker will simply recommend your best size.</p>
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

    wireTypeTiles(document.getElementById('type-chips'), key => {
      saveName();
      wiz.garmentType = key;
      renderWizStep2();
    });
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
      const fallback = document.getElementById('chart-fallback');
      // block, not the class's default flex — so the copy stacks above a
      // full-width button instead of squashing into a row
      const showFallback = () => { if (fallback) fallback.style.display = 'block'; };
      if (fallback) fallback.style.display = 'none';
      fetchBtn.disabled = true;
      fetchBtn.textContent = 'Reading…';
      msg.textContent = 'Opening the page and looking for a size chart…';
      try {
        const resp = await fetch('api/size-chart?url=' + encodeURIComponent(url));
        if (!resp.ok) throw new Error('server');
        const data = await resp.json();
        if (!data.ok) { msg.textContent = '✕ ' + data.error; showFallback(); fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch guide'; return; }
        const chart = FitEngine.buildCustomChart(data);
        if (!chart) throw new Error('bad chart');
        wiz.customChart = chart;
        if (wiz.pickedSize && !chart.sizes[wiz.pickedSize]) wiz.pickedSize = '';
        toast('Found ' + data.brand + "'s size guide!", 'ok');
        renderWizStep2();
      } catch (e) {
        msg.textContent = location.protocol === 'file:'
          ? '✕ This feature needs a connection — open FitChecker from its web address, not a local file.'
          : '✕ Could not reach the size-guide reader.';
        showFallback();
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch guide';
      }
    };
    const manualBtn = document.getElementById('chart-manual');
    if (manualBtn) manualBtn.onclick = () => {
      saveName();
      openManualChartModal(wiz.garmentType, chart => {
        wiz.customChart = chart;
        if (wiz.pickedSize && !chart.sizes[wiz.pickedSize]) wiz.pickedSize = '';
        toast('Using ' + chart.brand + "'s size guide!", 'ok');
        renderWizStep2();
      });
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
      if (wiz.pickedSize && !FitEngine.sizesFor(wiz.garmentType, userSex()).includes(wiz.pickedSize)) wiz.pickedSize = '';
      renderWizStep2();
    };

    document.getElementById('garment-photo-btn').onclick = () => {
      saveName();
      // Camera + photos require an account (photos are saved to it)
      if (!requireAuth('Camera & photos need an account', 'Photos are saved with your profile and history, so FitChecker asks you to log in before using the camera or uploading images.')) return;
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
    let body, profileName, profileId, sex;

    if (u && u.profiles.length && wiz.profileId) {
      const profile = u.profiles.find(p => p.id === wiz.profileId) || u.profiles[0];
      body = profile.body;
      profileName = profile.name;
      profileId = profile.id;
      sex = profile.sex;
    } else {
      if (!guestBody) { wiz.step = 1; renderAnalyze(); return; }
      body = guestBody;
      profileName = 'You';
      profileId = null;
      sex = guestSex();
    }

    if (!Money.canUse()) { Money.showPaywall(() => render()); return; }
    // sex picks the size chart — women's and men's are cut to different bodies
    const result = FitEngine.analyze(wiz.garmentType, body, wiz.fitPref, wiz.pickedSize || null, wiz.customChart, sex);
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

      ${(typeof RECS !== 'undefined' && Array.isArray(RECS) && RECS.some(i => i.types.includes(r.garmentType))) ? `
      <div class="promo-card promo-card-hero">
        <span class="promo-icon">${REC_ICON}</span>
        <div class="promo-body">
          <div class="promo-title">You'd like these</div>
          <div class="promo-text">${esc((FitEngine.SIZE_CHARTS[r.garmentType] || {}).label || 'Garment')} picks matched to your size ${esc(r.bestSize)} — hand-chosen brands.</div>
        </div>
        <a class="btn btn-primary" href="#/foryou">See the picks</a>
      </div>` : ''}

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

  // A garment silhouette per type — a real, always-present thumbnail (no
  // external images to break). Each type gets its own colour for variety.
  const GARMENT_ART = {
    tshirt: { main: 'M8.7 2.5 3 6l2 3.8 1.6-1v12.7h10.8V8.8l1.6 1 2-3.8L17.3 2.5l-2.4 1.6a4.6 4.6 0 0 1-4.9 0Z' },
    shirt:  { main: 'M8.7 2.5 3 6l2 3.8 1.6-1v12.7h10.8V8.8l1.6 1 2-3.8L17.3 2.5 12 5.2Z', detail: 'M12 5.2V21' },
    hoodie: { main: 'M8.5 2.5 3 6.2l2 3.8 1.6-1v12.5h10.8V9l1.6 1 2-3.8L17.5 2.5a5 5 0 0 1-9 0Z', detail: 'M9.5 15.5h5' },
    jacket: { main: 'M8.7 2.5 3 6l2 3.8 1.6-1v12.7h10.8V8.8l1.6 1 2-3.8L17.3 2.5 12 5.2Z', detail: 'M12 5.5V21M9.7 4.3 12 7l2.3-2.7' },
    dress:  { main: 'M9 2.5 7.1 6l1.7 1.2L6.4 21h11.2L15.2 7.2 17 6l-2-3.5a3.2 3.2 0 0 1-6 0Z' },
    jeans:  { main: 'M6.6 2.6h10.8l-.5 6-1.4 12.4h-3.1L12 10.5l-.4 10.5H8.5L7.1 8.6 6.6 2.6Z', detail: 'M6.6 5.4h10.8' },
    shorts: { main: 'M6.6 3h10.8l-.5 5.2-1 5.3h-3.1L12 9l-.4 4.5H8.2l-1-5.3L6.6 3Z', detail: 'M6.6 5.4h10.8' },
    skirt:  { main: 'M8 2.8h8l.5 2.4 2.4 15.6H5.1L7.5 5.2 8 2.8Z', detail: 'M7.5 5.2h9' },
    // sleeveless — narrow straps, no sleeves
    top:    { main: 'M8.6 2.5 6.4 4.9l1.7 1.2V21h7.8V6.1l1.7-1.2-2.2-2.4a4.2 4.2 0 0 1-7.4 0Z' },
    // crew-neck knit with a ribbed hem
    sweater:{ main: 'M8.7 2.5 3 6l2 3.8 1.6-1v12.7h10.8V8.8l1.6 1 2-3.8L17.3 2.5l-2.4 1.6a4.6 4.6 0 0 1-4.9 0Z', detail: 'M6.6 18.2h10.8' },
    // long coat with a belt
    coat:   { main: 'M8.7 2.5 3.2 5.9l1.9 3.7 1.5-.9V21.6h10.8V8.7l1.5.9 1.9-3.7L17.3 2.5 12 5.2Z', detail: 'M12 5.4v16.2M5.4 13.4h13.2' },
    // trousers — creased, no waistband stitch
    trousers:{ main: 'M6.8 2.6h10.4l-.6 6.2-1.2 12.2h-3L12 10.8l-.6 10.2h-3L7.4 8.8 6.8 2.6Z', detail: 'M9.7 9.4v10.6M14.3 9.4v10.6' },
    // sneaker in side profile
    shoes:  { main: 'M2.6 16.4c0-1.1.7-1.9 1.8-2.2l3.3-1 2.5-2.3c.5-.5 1.3-.5 1.8 0l.9 1c1.4 1.4 3.2 2.3 5.2 2.6l1.9.3c1.1.2 1.9 1.1 1.9 2.2v1.5c0 .5-.4 1-1 1H3.6c-.6 0-1-.5-1-1v-2.1Z', detail: 'M3.2 18.6h17.6' },
    // tote / bag
    accessory:{ main: 'M6.2 8h11.6l1 12.6H5.2L6.2 8Z', detail: 'M9.2 8.4V6a2.8 2.8 0 0 1 5.6 0v2.4' }
  };
  function garmentSvg(type) {
    const g = GARMENT_ART[type] || GARMENT_ART.tshirt;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="${g.main}" fill="#fff"/>
      ${g.detail ? `<path d="${g.detail}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    </svg>`;
  }

  /* Picture-buttons: a grid of illustrated garment tiles instead of a wall
     of text chips. `types` is [{key,label}]; returns markup — wire clicks
     with wireTypeTiles(). */
  function typeTiles(types, selectedKey, name) {
    return `<div class="type-grid" role="radiogroup" ${name ? `aria-label="${esc(name)}"` : ''}>
      ${types.map(t => `
        <button type="button" class="type-tile ${t.key === selectedKey ? 'on' : ''}" data-t="${esc(t.key)}"
                role="radio" aria-checked="${t.key === selectedKey}">
          <span class="tt-art g-${esc(t.key)}">${garmentSvg(t.key)}</span>
          <span class="tt-label">${esc(t.label)}</span>
        </button>`).join('')}
    </div>`;
  }

  // returns the picked key to the callback; keeps the grid's selected state
  function wireTypeTiles(container, onPick) {
    const grid = container.querySelector('.type-grid');
    if (!grid) return;
    grid.onclick = e => {
      const tile = e.target.closest('[data-t]');
      if (!tile) return;
      grid.querySelectorAll('.type-tile').forEach(t => {
        const on = t === tile;
        t.classList.toggle('on', on);
        t.setAttribute('aria-checked', on);
      });
      onPick(tile.getAttribute('data-t'));
    };
  }
  function recThumb(item) {
    const t = (item.types && item.types[0]) || 'tshirt';
    // Real product photo, three stages: 1) the brand's own image URL from
    // recs.js (item.img), 2) the server-side og:image proxy for the page,
    // 3) the coloured garment tile. Something good is ALWAYS shown.
    const proxy = 'api/thumb?u=' + encodeURIComponent(item.url);
    const src = item.img || proxy;
    const alt = item.img ? proxy : '';
    return `<span class="row-thumb rec-thumb g-${t}">${garmentSvg(t)}<img class="rec-img" src="${esc(src)}" ${alt ? `data-alt="${esc(alt)}"` : ''} alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.removeAttribute('data-alt');}else{this.remove();}"></span>`;
  }

  function latestAnalysis() {
    const u = Auth.user();
    if (u && u.analyses.length) return u.analyses[u.analyses.length - 1];
    return guestResult;
  }

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.4 12.7a4.6 4.6 0 0 1 6.5-6.5l1.1 1.1 1.1-1.1a4.6 4.6 0 0 1 6.5 6.5L12 20.3Z"/></svg>';

  function recRow(item) {
    const link = item.aff || item.url;
    const id = favId(item);
    const faved = isFav(id);
    return `
      <div class="rec-row-wrap">
        <a class="list-row rec-row" href="${esc(link)}" target="_blank" rel="noopener sponsored">
          ${recThumb(item)}
          <span class="row-main">
            <span class="title">${esc(item.name)}</span>
            <span class="sub">${esc(item.note)}</span>
          </span>
          <span class="badge">${esc(item.brand)}</span>
          <span class="rec-arrow" aria-hidden="true">&#8599;</span>
        </a>
        <button class="fav-btn ${faved ? 'on' : ''}" data-fav="${esc(id)}" aria-label="${faved ? 'Remove from favourites' : 'Save to favourites'}" aria-pressed="${faved}">${HEART}</button>
      </div>`;
  }

  // wire heart buttons within a container; onChange re-renders if provided
  function wireFavButtons(container, onChange) {
    container.querySelectorAll('[data-fav]').forEach(btn => {
      btn.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        const item = recById(btn.getAttribute('data-fav'));
        if (!item) return;
        const nowFav = toggleFav(item);
        btn.classList.toggle('on', nowFav);
        btn.setAttribute('aria-pressed', nowFav);
        toast(nowFav ? 'Saved to Favourites ♥' : 'Removed from Favourites', 'ok');
        if (onChange) onChange();
      };
    });
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

    const favCount = listFavs().length;
    view.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <h2 class="mb-8">You'd like these</h2>
          <a class="btn btn-secondary btn-sm" href="#/favourites">♥ Favourites${favCount ? ` (${favCount})` : ''}</a>
        </div>
        ${last && typeLabel
          ? `<p class="muted small">Matched to your last fitting — ${esc(typeLabel.toLowerCase())}${lastBest ? `, size <strong>${esc(lastBest)}</strong>` : ''}${lastPref ? `, ${esc(lastPref)} fit` : ''}. Tap ♥ to save one; links open the brand's site.</p>`
          : `<p class="muted small">Hand-picked places to shop each garment type. Tap ♥ to save the ones you like. <a href="#/analyze">Run a fitting</a> and this page tailors itself to your size.</p>`}
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

      <p class="disclosure">Some links may earn FitChecker a small commission. It never changes what's recommended.</p>`;

    wireFavButtons(view);
  }

  /* ==========================================================
     FAVOURITES — products the user hearted, saved to their account
     ========================================================== */

  function renderFavourites() {
    const favs = listFavs();
    const linked = Cloud.isLinked();

    view.innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>♥ Favourites <span class="count-chip">${favs.length}</span></span>
          <a class="btn btn-secondary btn-sm" href="#/foryou">Browse picks</a>
        </div>
        <p class="muted small mb-16">Clothing you saved from For You.${linked ? ' <span class="synced">✓ synced to your account</span>' : ' Log in to keep these across devices.'}</p>
        ${favs.length ? `<div class="row-list">${favs.map(f => recRow(f)).join('')}</div>` : `
          <div class="empty">
            <div class="empty-icon">♡</div>
            <p><strong>No favourites yet.</strong></p>
            <p class="muted">Open <a href="#/foryou">For You</a> and tap the ♥ on anything you like — it lands here, saved to your account.</p>
          </div>`}
      </div>
      ${favs.length ? '<p class="disclosure">Some links may earn FitChecker a small commission. It never changes what\'s recommended.</p>' : ''}`;

    // re-render so the count + list update immediately when unhearted
    wireFavButtons(view, () => renderFavourites());
  }

  /* ==========================================================
     SIZE PASSPORT — the user's size in every garment category,
     computed from their measurements. Shareable (before a birthday,
     to family, etc.) — free acquisition + every category is affiliate.
     ========================================================== */

  // Which categories to show, in order. Womenswear rows only for female sizing.
  const PASSPORT_CATS = [
    { type: 'tshirt', femaleOnly: false },
    { type: 'shirt',  femaleOnly: false },
    { type: 'hoodie', femaleOnly: false },
    { type: 'jacket', femaleOnly: false },
    { type: 'jeans',  femaleOnly: false },
    { type: 'shorts', femaleOnly: false },
    { type: 'dress',  femaleOnly: true },
    { type: 'skirt',  femaleOnly: true }
  ];

  function computeSizes(profile) {
    if (!profile || !profile.body) return [];
    const out = [];
    for (const cat of PASSPORT_CATS) {
      if (cat.femaleOnly && profile.sex !== 'female') continue;
      const chart = FitEngine.SIZE_CHARTS[cat.type];
      if (!chart) continue;
      // needs at least one of the chart's core measurements
      const hasData = chart.zones.some(z => profile.body[z] != null);
      if (!hasData) continue;
      const res = FitEngine.analyze(cat.type, profile.body, 'regular', null, null, profile.sex);
      out.push({ type: cat.type, label: chart.label, size: res.bestSize, confidence: res.confidence });
    }
    return out;
  }

  function passportShareText(profile, sizes) {
    const lines = sizes.map(s => `${s.label}: ${s.size}`);
    // add a numeric waist for bottoms if we have it
    if (profile.body && profile.body.waist != null) {
      const inches = Math.round(FitEngine.cmToIn(profile.body.waist));
      lines.push(`Waist: ${inches}in / ${disp(profile.body.waist)} ${units()}`);
    }
    return `👕 My FitChecker sizes\n\n${lines.join('\n')}\n\nMeasured with FitChecker — know your fit before you buy.`;
  }

  function renderPassport() {
    const u = Auth.user();
    const profile = getActiveProfile();

    if (!profile || !profile.body || profile.body.chest == null) {
      view.innerHTML = `
        <div class="card">
          <div class="card-title">Size Passport</div>
          <div class="empty">
            <div class="empty-icon">🪪</div>
            <p><strong>Add your measurements first.</strong></p>
            <p class="muted">Your Size Passport turns your measurements into your size in every category — one card you can send to family before a birthday.</p>
            <a class="btn btn-primary" href="#/${u ? 'profiles' : 'analyze'}">${u ? 'Add measurements' : 'Take my measurements'}</a>
          </div>
        </div>`;
      return;
    }

    const sizes = computeSizes(profile);
    const waistLine = profile.body.waist != null
      ? `<div class="pp-row"><span>Waist (jeans)</span><strong>${Math.round(FitEngine.cmToIn(profile.body.waist))}in · ${disp(profile.body.waist)} ${units()}</strong></div>`
      : '';

    view.innerHTML = `
      <div class="card pp-card">
        <div class="pp-head">
          <div>
            <div class="pp-kicker">Size Passport</div>
            <div class="pp-name">${esc(profile.name || (u ? u.name : 'Me'))}</div>
          </div>
          <div class="pp-mark">👕</div>
        </div>
        <div class="pp-list">
          ${sizes.map(s => `<div class="pp-row"><span>${esc(s.label)}</span><strong>${esc(s.size)}</strong></div>`).join('')}
          ${waistLine}
        </div>
        <p class="muted small mt-16">Estimated from your measurements. Real sizing varies by brand — always check the chart, and use a fit check for the exact garment.</p>
        <div class="btn-row mt-16">
          <button class="btn btn-primary btn-lg" id="pp-share">Share my sizes</button>
          <a class="btn btn-secondary" href="#/foryou">Shop my size</a>
        </div>
      </div>`;

    document.getElementById('pp-share').onclick = async () => {
      const text = passportShareText(profile, sizes);
      try {
        if (navigator.share) { await navigator.share({ title: 'My FitChecker sizes', text }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied your sizes — paste them anywhere.', 'ok');
        return;
      } catch (e) {}
      // last resort: show the text to copy manually
      openModal(`<h3 class="card-title">Your sizes</h3><textarea class="input" rows="8" readonly style="width:100%;resize:none">${esc(text)}</textarea><button class="btn btn-ghost btn-block mt-16" data-act="close">Close</button>`)
        .querySelector('[data-act="close"]').onclick = function () { this.closest('.modal-overlay').remove(); };
    };
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
        <p class="muted small mb-16">FitChecker reads your skin tone from a selfie — entirely on your device, nothing is uploaded — and finds the colours that flatter ${whose} most. Works best in soft, natural daylight with no filter.</p>
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

  /* ---- this device's like/dislike record (for button state) ---- */
  function ofVotes() {
    try { return JSON.parse(localStorage.getItem('fc_of_votes') || '{}'); }
    catch (e) { return {}; }
  }
  function setOfVote(id, v) {
    const m = ofVotes();
    if (v) m[id] = v; else delete m[id];
    try { localStorage.setItem('fc_of_votes', JSON.stringify(m)); } catch (e) {}
  }

  // The AI style verdict block — score out of 100 plus the reasons why.
  function outfitAiHTML(p) {
    if (!p.ai) return `<div class="outfit-ai" data-ai-pending="1"><span class="muted small">✨ Rating this look…</span></div>`;
    const notes = (p.ai.notes || []).slice(0, 2);
    return `
      <div class="outfit-ai">
        <div class="outfit-ai-head">
          <span class="score-pill ${scorePillClass(p.ai.score)}">${p.ai.score}/100</span>
          <strong class="small">AI style rating</strong>
        </div>
        ${notes.map(t => `<div class="outfit-note">${esc(t)}</div>`).join('')}
      </div>`;
  }

  function outfitCard(p) {
    const myVote = ofVotes()[p.id] || null;
    const mine = p.uid && p.uid === posterUid();
    const likes = p.likes || 0, dislikes = p.dislikes || 0;
    return `
      <div class="outfit-card" data-uid="${esc(p.uid || '')}" data-id="${esc(p.id)}">
        <div class="outfit-photo">
          <img src="${p.image}" alt="${esc(p.caption)}" loading="lazy">
          ${p.ai ? `<span class="outfit-score score-pill ${scorePillClass(p.ai.score)}">${p.ai.score}</span>` : ''}
        </div>
        <div class="outfit-body">
          <div class="outfit-caption">${esc(p.caption)}</div>
          <div class="outfit-meta">${esc(p.name)} · ${new Date(p.ts).toLocaleDateString()}</div>
          ${outfitAiHTML(p)}
          <div class="outfit-vote">
            <button class="of-vote ${myVote === 'like' ? 'active' : ''}" data-vote="like" ${mine ? 'disabled title="That\'s your own outfit"' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v11"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L14 2a3 3 0 0 1 1 3.88Z"/></svg>
              <span class="ofv-count">${likes}</span>
            </button>
            <button class="of-vote ${myVote === 'dislike' ? 'active' : ''}" data-vote="dislike" ${mine ? 'disabled title="That\'s your own outfit"' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V3"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L10 22a3 3 0 0 1-1-3.88Z"/></svg>
              <span class="ofv-count">${dislikes}</span>
            </button>
            <span class="of-vote-spacer"></span>
            <button class="of-act" data-report="${esc(p.id)}">Report</button>
            ${p.uid ? `<button class="of-act" data-block="${esc(p.uid)}" data-name="${esc(p.name)}">Block</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Fill in AI ratings for any post that arrived without one, on-device.
  function wireOutfitAi(container) {
    container.querySelectorAll('.outfit-ai[data-ai-pending]').forEach(box => {
      const card = box.closest('.outfit-card');
      const img = card && card.querySelector('.outfit-photo img');
      if (!img) return;
      StyleAI.rate(img.src, res => {
        if (!res) { box.remove(); return; }
        box.removeAttribute('data-ai-pending');
        box.innerHTML = `
          <div class="outfit-ai-head">
            <span class="score-pill ${scorePillClass(res.score)}">${res.score}/100</span>
            <strong class="small">AI style rating</strong>
          </div>
          ${res.notes.slice(0, 2).map(t => `<div class="outfit-note">${esc(t)}</div>`).join('')}`;
      });
    });
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
      }).catch(() => { overlay.remove(); toast('Could not reach FitChecker — check your connection.', 'err'); });
    });
  }

  function wireOutfitActions(container) {
    container.querySelectorAll('.of-vote').forEach(b => b.onclick = () => {
      if (b.disabled) return;
      if (!requireAuth('Sign in to vote', 'A free account lets you like or dislike community outfits — your vote is tied to your account so each look is counted once.')) return;
      const card = b.closest('.outfit-card');
      const id = card.getAttribute('data-id');
      const vote = b.getAttribute('data-vote');
      const cur = ofVotes()[id] || null;
      const next = cur === vote ? 'none' : vote; // tapping the active one clears it

      card.querySelectorAll('.of-vote').forEach(x => { x.disabled = true; });
      fetch('api/outfits/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, uid: posterUid(), vote: next })
      })
        .then(r => r.json())
        .then(d => {
          if (!d.ok) { toast(d.error || 'Could not save your vote.', 'err'); return; }
          setOfVote(id, d.you);
          const likeBtn = card.querySelector('.of-vote[data-vote="like"]');
          const disBtn = card.querySelector('.of-vote[data-vote="dislike"]');
          likeBtn.querySelector('.ofv-count').textContent = d.likes;
          disBtn.querySelector('.ofv-count').textContent = d.dislikes;
          likeBtn.classList.toggle('active', d.you === 'like');
          disBtn.classList.toggle('active', d.you === 'dislike');
        })
        .catch(() => toast('Could not reach FitChecker — check your connection.', 'err'))
        .finally(() => {
          const mine = card.getAttribute('data-uid') && card.getAttribute('data-uid') === posterUid();
          if (!mine) card.querySelectorAll('.of-vote').forEach(x => { x.disabled = false; });
        });
    });
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
      <div id="battle-slot"></div>
      <div class="card">
        <h2 class="mb-8">Outfit ideas</h2>
        <p class="muted small mb-16">Real outfits from the community. Give a look a like or dislike, and see the AI's style score out of 100 with the reasons why. Every post is reviewed by a human before it appears here.</p>
        <button class="btn btn-primary" id="of-post">Share your outfit</button>
        <a href="terms.html" target="_blank" rel="noopener" class="muted small" style="margin-left:14px;text-decoration:underline">Community Guidelines</a>
      </div>
      <div id="of-feed"><div class="card"><div class="empty"><p>Loading outfits…</p></div></div></div>`;

    document.getElementById('of-post').onclick = postOutfitFlow;
    loadBattle();

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
        wireOutfitAi(feed);
      })
      .catch(() => {
        const feed = document.getElementById('of-feed');
        if (feed) feed.innerHTML = `<div class="card"><div class="empty">
          <h3>Can't reach the outfit feed</h3>
          <p>Check your internet connection and try again in a moment.</p>
        </div></div>`;
      });
  }

  /* ==========================================================
     DAILY OUTFIT BATTLE — two head-to-toe fits, the community votes
     ========================================================== */

  function battleVoteGet(id) {
    try { return (JSON.parse(localStorage.getItem('fc_battle_votes') || '{}'))[id] || null; }
    catch (e) { return null; }
  }
  function battleVoteSet(id, choice) {
    try {
      const m = JSON.parse(localStorage.getItem('fc_battle_votes') || '{}');
      m[id] = choice;
      localStorage.setItem('fc_battle_votes', JSON.stringify(m));
    } catch (e) {}
  }

  function loadBattle() {
    const slot = document.getElementById('battle-slot');
    if (!slot) return;
    fetch('api/battle')
      .then(r => r.json())
      .then(d => {
        if (!d.ok || !d.battle) { slot.innerHTML = battleEmptyCard(); wireBattleEnter(slot); return; }
        slot.innerHTML = battleCard(d.battle);
        wireBattle(slot, d.battle);
        wireBattleEnter(slot);
      })
      .catch(() => { slot.innerHTML = ''; });
  }

  function battleEmptyCard() {
    return `
      <div class="card battle-card">
        <div class="battle-head">
          <span class="battle-badge">⚔️ Daily Outfit Battle</span>
        </div>
        <div class="empty" style="padding:18px 8px">
          <h3>No battle running right now</h3>
          <p class="muted small">Enter yours — a full head-to-toe fit — and you could be picked for today's face-off.</p>
        </div>
        <button class="btn btn-primary btn-block" data-battle-enter>Enter today's battle</button>
      </div>`;
  }

  function battleCard(b) {
    const total = (b.aVotes || 0) + (b.bVotes || 0);
    const my = battleVoteGet(b.id);
    const pct = v => total ? Math.round((v / total) * 100) : 0;
    const side = (key, s, votes) => {
      const won = my && total > 0;
      return `
        <button class="battle-side ${my === key ? 'chosen' : ''}" data-battle-vote="${key}" ${my ? 'data-voted="1"' : ''}>
          <span class="battle-tag">${key.toUpperCase()}</span>
          <span class="battle-photo"><img src="${s.image}" alt=""></span>
          <span class="battle-name">${esc(s.name)}</span>
          ${won ? `<span class="battle-bar"><span class="battle-bar-fill ${my === key ? 'win' : ''}" style="width:${pct(votes)}%"></span></span>
                   <span class="battle-pct">${pct(votes)}% · ${votes} vote${votes === 1 ? '' : 's'}</span>` : ''}
        </button>`;
    };
    return `
      <div class="card battle-card">
        <div class="battle-head">
          <span class="battle-badge">⚔️ Daily Outfit Battle</span>
          <span class="muted small">${my ? `${total} vote${total === 1 ? '' : 's'} · tap to change` : 'Tap the better fit'}</span>
        </div>
        <div class="battle-arena">
          ${side('a', b.a, b.aVotes || 0)}
          <span class="battle-vs">VS</span>
          ${side('b', b.b, b.bVotes || 0)}
        </div>
        <button class="btn btn-secondary btn-block btn-sm" data-battle-enter style="margin-top:12px">Enter tomorrow's battle</button>
      </div>`;
  }

  function wireBattle(container, b) {
    container.querySelectorAll('[data-battle-vote]').forEach(btn => btn.onclick = () => {
      if (!requireAuth('Sign in to vote', 'A free account lets you vote in the daily outfit battle — one vote per person, and you can change it.')) return;
      const choice = btn.getAttribute('data-battle-vote');
      container.querySelectorAll('[data-battle-vote]').forEach(x => { x.disabled = true; });
      fetch('api/battle/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, uid: posterUid(), choice })
      })
        .then(r => r.json())
        .then(d => {
          if (!d.ok) { toast(d.error || 'Could not vote.', 'err'); return; }
          battleVoteSet(b.id, d.you);
          const merged = Object.assign({}, b, { aVotes: d.aVotes, bVotes: d.bVotes });
          container.innerHTML = battleCard(merged);
          wireBattle(container, merged);
          wireBattleEnter(container);
        })
        .catch(() => toast('Could not reach FitChecker — check your connection.', 'err'));
    });
  }

  function wireBattleEnter(container) {
    container.querySelectorAll('[data-battle-enter]').forEach(b => b.onclick = enterBattleFlow);
  }

  function enterBattleFlow() {
    const u = Auth.user();
    if (!requireAuth('Entering needs an account', 'Battle entries carry your name and a full-body photo, so FitChecker asks you to log in first. Entries are reviewed before a moderator picks the daily match-up.')) return;

    const overlay = openModal(`
      <h3 class="card-title">Enter the daily battle</h3>
      <p class="muted small mb-16">A moderator picks two entries each day for everyone to vote on. Take your photo like this so your fit gets a fair shot:</p>
      <div class="battle-rules">
        <div class="battle-rule"><span>🧍</span><div><b>Head to toe — including your shoes.</b> Your whole outfit must be in frame, nothing cut off.</div></div>
        <div class="battle-rule"><span>📏</span><div><b>Stand back so your full body fits.</b> A full-length mirror selfie, or ask a friend to take it.</div></div>
        <div class="battle-rule"><span>📱</span><div><b>Hold the phone upright (portrait).</b> Landscape cuts your fit off.</div></div>
        <div class="battle-rule"><span>💡</span><div><b>Good, even light. Plain wall behind you</b> if you can — it keeps the focus on the outfit.</div></div>
        <div class="battle-rule"><span>🧑‍🎤</span><div><b>Stand tall, face the camera, own it.</b> One clear pose beats a blurry action shot.</div></div>
      </div>
      <label class="agree mb-16" style="display:flex;gap:10px;align-items:flex-start">
        <input type="checkbox" id="bt-agree">
        <span class="small">This is my own photo, it's a full head-to-toe shot of my outfit, and it follows the <a href="terms.html" target="_blank" rel="noopener">Community Guidelines</a>. I understand a moderator reviews every entry.</span>
      </label>
      <div class="btn-row">
        <button class="btn btn-secondary" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="pick" disabled>Choose full-body photo</button>
      </div>`);

    overlay.querySelector('[data-act="cancel"]').onclick = () => overlay.remove();
    overlay.querySelector('#bt-agree').onchange = e => {
      overlay.querySelector('[data-act="pick"]').disabled = !e.target.checked;
    };
    overlay.querySelector('[data-act="pick"]').onclick = () => {
      if (!overlay.querySelector('#bt-agree').checked) { toast('Please confirm the guidelines first.', 'err'); return; }
      overlay.remove();
      Camera.pickImage({
        onImage: dataUrl => confirmBattlePhoto(dataUrl),
        onError: msg => toast(msg, 'err')
      });
    };
  }

  function confirmBattlePhoto(dataUrl) {
    const u = Auth.user();
    const overlay = openModal(`
      <h3 class="card-title">Send this entry?</h3>
      <img src="${dataUrl}" alt="" style="width:100%;max-height:52vh;object-fit:contain;border-radius:12px;margin-bottom:8px;background:var(--surface-2)">
      <p class="muted small mb-16">Make sure your <strong>whole outfit is visible, head to toe</strong>. If your shoes or head are cut off, retake it.</p>
      <div class="field" style="margin-bottom:14px">
        <label for="bt-name">Entered as</label>
        <input class="input" id="bt-name" type="text" maxlength="40" value="${esc(u ? u.name : '')}">
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" data-act="retake">Retake</button>
        <button class="btn btn-primary" data-act="send">Send for review</button>
      </div>`);
    overlay.querySelector('[data-act="retake"]').onclick = () => { overlay.remove(); enterBattleFlow(); };
    overlay.querySelector('[data-act="send"]').onclick = () => {
      const name = overlay.querySelector('#bt-name').value.trim() || 'Anonymous';
      const btn = overlay.querySelector('[data-act="send"]');
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch('api/battle/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, uid: posterUid(), image: dataUrl })
      })
        .then(r => r.json())
        .then(d => {
          if (!d.ok) { toast(d.error || 'Could not send.', 'err'); btn.disabled = false; btn.textContent = 'Send for review'; return; }
          overlay.remove();
          toast('Entry sent! If you\'re picked, you\'ll appear in a daily battle.', 'ok');
        })
        .catch(() => { toast('Could not reach FitChecker — check your connection.', 'err'); btn.disabled = false; btn.textContent = 'Send for review'; });
    };
  }

  function postOutfitFlow() {
    const u = Auth.user();
    if (!requireAuth('Posting needs an account', 'Outfit posts carry your name and a photo, so FitChecker asks you to log in first. Posts are reviewed before they appear.')) return;

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
              toast('Could not reach FitChecker — check your connection and try again.', 'err');
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
      </div>
      <div class="card">
        <h2 class="mb-8">⚔️ Daily Outfit Battle</h2>
        <p class="muted small mb-16">Approve entries, then pick two to run as today's battle. Everyone votes on the Outfits tab.</p>
        <div id="battle-admin"><p class="muted small">Load the queue above to manage battle entries.</p></div>
      </div>`;

    const list = document.getElementById('mod-list');
    let battlePick = { a: null, b: null };

    const loadBattleAdmin = () => {
      const key = document.getElementById('mod-key').value.trim();
      const box = document.getElementById('battle-admin');
      if (!key) { box.innerHTML = '<p class="muted small">Enter the key and load the queue.</p>'; return; }
      box.innerHTML = '<p class="muted small">Loading entries…</p>';
      fetch('api/battle/pending?key=' + encodeURIComponent(key))
        .then(r => r.json())
        .then(d => {
          if (!d.ok) { box.innerHTML = `<p class="small" style="color:var(--bad)">${esc(d.error || 'Failed.')}</p>`; return; }
          const cur = d.current
            ? `<div class="battle-live-row">
                 <strong>Live now:</strong> ${esc(d.current.aName)} (${d.current.aVotes}) vs ${esc(d.current.bName)} (${d.current.bVotes})
                 <button class="btn btn-danger btn-sm" id="battle-end">End battle</button>
               </div>` : '<p class="muted small">No battle live right now.</p>';
          const subs = d.submissions || [];
          const entries = subs.length ? subs.map(s => `
            <div class="mod-row">
              <img src="${s.image}" alt="">
              <div class="mod-body">
                <div class="outfit-meta">${esc(s.name)} · ${new Date(s.ts).toLocaleString()} · <span class="${s.status === 'approved' ? 'pill-ok' : 'pill-wait'}">${s.status}</span></div>
                <div class="btn-row mt-8">
                  ${s.status === 'pending'
                    ? `<button class="btn btn-primary btn-sm" data-b-approve="${esc(s.id)}">Approve</button>`
                    : `<label class="battle-pick-lbl"><input type="radio" name="pick-a" value="${esc(s.id)}"> A</label>
                       <label class="battle-pick-lbl"><input type="radio" name="pick-b" value="${esc(s.id)}"> B</label>`}
                  <button class="btn btn-danger btn-sm" data-b-reject="${esc(s.id)}">Reject</button>
                </div>
              </div>
            </div>`).join('') : '<p class="muted small">No entries yet.</p>';
          box.innerHTML = `${cur}<div class="battle-admin-list">${entries}</div>
            <button class="btn btn-primary btn-block" id="battle-start" style="margin-top:12px">Start today's battle with A &amp; B</button>`;

          const key2 = document.getElementById('mod-key').value.trim();
          box.querySelectorAll('[data-b-approve]').forEach(b => b.onclick = () => battleAct(b.getAttribute('data-b-approve'), 'approve', key2, loadBattleAdmin));
          box.querySelectorAll('[data-b-reject]').forEach(b => b.onclick = () => battleAct(b.getAttribute('data-b-reject'), 'reject', key2, loadBattleAdmin));
          const endBtn = document.getElementById('battle-end');
          if (endBtn) endBtn.onclick = () => {
            fetch('api/battle/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key2 }) })
              .then(r => r.json()).then(x => { if (x.ok) { toast('Battle ended.', 'ok'); loadBattleAdmin(); } else toast(x.error || 'Failed.', 'err'); });
          };
          document.getElementById('battle-start').onclick = () => {
            const a = (box.querySelector('input[name="pick-a"]:checked') || {}).value;
            const b = (box.querySelector('input[name="pick-b"]:checked') || {}).value;
            if (!a || !b) { toast('Pick an A and a B from the approved entries.', 'err'); return; }
            if (a === b) { toast('Pick two different entries.', 'err'); return; }
            fetch('api/battle/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key2, aId: a, bId: b }) })
              .then(r => r.json()).then(x => { if (x.ok) { toast('Today\'s battle is live!', 'ok'); loadBattleAdmin(); } else toast(x.error || 'Failed.', 'err'); });
          };
        })
        .catch(() => { box.innerHTML = '<p class="small" style="color:var(--bad)">Could not reach the server.</p>'; });
    };

    const battleAct = (id, action, key, after) => {
      fetch('api/battle/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, id, action }) })
        .then(r => r.json())
        .then(d => { if (!d.ok) { toast(d.error || 'Failed.', 'err'); return; } toast(action === 'approve' ? 'Entry approved.' : 'Entry removed.', 'ok'); after(); })
        .catch(() => toast('Server unreachable.', 'err'));
    };

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

    document.getElementById('mod-load').onclick = () => { load(); loadBattleAdmin(); };
    if (saved) { load(); loadBattleAdmin(); }
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
        <h2>How to use FitChecker</h2>
        <p>Three minutes here saves you every wrong-size order later. Good measurements in — good verdicts out.</p>
        <a href="#/analyze" class="btn btn-lg">Jump straight in</a>
      </div>

      <div class="card">
        <div class="card-title">Quick start</div>
        <div class="help-row"><span class="num-dot">1</span><div><strong>Enter your measurements.</strong> Go to <a href="#/analyze">Analyze</a> and type them in — or save them once as a profile (free account) so it's one tap forever.</div></div>
        <div class="help-row"><span class="num-dot">2</span><div><strong>Describe the garment.</strong> Pick the type (t-shirt, jeans, dress…), how you like it to fit, and — if you're eyeing one — the size you're considering. Paste the shop's link and FitChecker reads the brand's own size chart. With an account you can also snap a photo of it.</div></div>
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
        <p class="hint mt-16">The "Best" tag in the size table marks your best size. <strong>Confidence</strong> reflects how many of your measurements FitChecker could use — more measurements, sharper verdict.</p>
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
            <div class="faq-body">FitChecker compares your measurements against standard international size charts with tailoring "ease" rules — the extra room a slim, regular or relaxed fit should have. It's a strong guide, but brands do vary: when a shop publishes its own size chart, cross-check the winning size against it.</div>
          </details>
          <details>
            <summary>Can FitChecker use a brand's own size chart?</summary>
            <div class="faq-body">Yes — in the Analyze step, paste a link to the product page or the brand's size-guide page and press "Fetch guide". FitChecker opens the page, finds their size chart (following "size guide" links if needed) and judges every size by the brand's own numbers instead of the standard charts. Tip: if a product page doesn't work, open the brand's size-guide page in your browser and paste that link — some shops only load their chart with JavaScript, which can't be read.</div>
          </details>
          <details>
            <summary>Why does it disagree with the size I always buy?</summary>
            <div class="faq-body">Vanity sizing is real — an "M" at one brand is an "L" at another. FitChecker judges by centimetres, not labels. Also check your fit preference: a relaxed fit shifts the recommendation up compared to slim.</div>
          </details>
          <details>
            <summary>Is my data uploaded anywhere?</summary>
            <div class="faq-body">As a guest, no — everything stays in this browser on this device. If you create an account, your measurements, profiles, wardrobe and favourites sync to it so they follow you across devices; face and body photos stay on your device. We never sell your data, and you can delete your account and everything with it at any time from Settings.</div>
          </details>
          <details>
            <summary>The camera doesn't open — what now?</summary>
            <div class="faq-body">First, you need to be logged in. Then the camera needs permission (check the icon in your address bar) and a secure connection (https or localhost). If it still won't start, use "Upload from device" — it works everywhere and does exactly the same job.</div>
          </details>
          <details>
            <summary>Some zones say "no data". Is that bad?</summary>
            <div class="faq-body">Not bad — just less precise. Only height, chest, waist and hips are required. Adding shoulders, arm length, inseam and thigh lets FitChecker judge sleeves, garment length and trouser fit too, and raises the confidence rating.</div>
          </details>
          <details>
            <summary>Can I use FitChecker as a phone app?</summary>
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
     MORE — a tidy menu for the less-frequent destinations,
     so the bottom bar can stay at five tabs.
     ========================================================== */

  /* ==========================================================
     PROGRESS — body-scan history over time. Latest scan is free;
     the full timeline + trend chart is a Pro perk.
     ========================================================== */

  const PROG_METRICS = [
    { key: 'chest', label: 'Chest', color: '#6aa8ff' },
    { key: 'waist', label: 'Waist', color: '#ffb24b' },
    { key: 'hips',  label: 'Hips',  color: '#5fd0a5' }
  ];

  function progDelta(scans, key) {
    const vals = scans.map(s => s.values[key]).filter(v => v != null);
    if (vals.length < 2) return null;
    return vals[vals.length - 1] - vals[0];
  }

  function progChartSvg(scans) {
    const W = 600, H = 220, PAD = { l: 44, r: 16, t: 14, b: 26 };
    const series = PROG_METRICS
      .map(m => ({ ...m, pts: scans.map(s => ({ ts: s.ts, v: s.values[m.key] })).filter(p => p.v != null) }))
      .filter(s => s.pts.length >= 2);
    if (!series.length) return '';

    const allV = series.flatMap(s => s.pts.map(p => p.v));
    const allT = series.flatMap(s => s.pts.map(p => p.ts));
    let vMin = Math.min(...allV), vMax = Math.max(...allV);
    const vPad = Math.max(2, (vMax - vMin) * 0.15);
    vMin -= vPad; vMax += vPad;
    const tMin = Math.min(...allT), tMax = Math.max(...allT) || tMin + 1;
    const x = ts => tMax === tMin ? (PAD.l + W - PAD.r) / 2 : PAD.l + (ts - tMin) / (tMax - tMin) * (W - PAD.l - PAD.r);
    const y = v => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * (H - PAD.t - PAD.b);

    // three horizontal gridlines with value labels (in the user's units)
    const grid = [0.25, 0.5, 0.75].map(f => {
      const v = vMin + f * (vMax - vMin), gy = y(v);
      return `<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" class="prog-grid"/>
              <text x="${PAD.l - 6}" y="${gy + 3}" class="prog-axis" text-anchor="end">${disp(v)}</text>`;
    }).join('');

    const lines = series.map(s => {
      const pts = s.pts.map(p => `${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
      const dots = s.pts.map(p => `<circle cx="${x(p.ts).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.4" fill="${s.color}"/>`).join('');
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    }).join('');

    const fmtD = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const xLabels = `
      <text x="${PAD.l}" y="${H - 8}" class="prog-axis">${fmtD(tMin)}</text>
      <text x="${W - PAD.r}" y="${H - 8}" class="prog-axis" text-anchor="end">${fmtD(tMax)}</text>`;

    return `<svg class="prog-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Measurement trend chart">${grid}${lines}${xLabels}</svg>`;
  }

  function renderProgress() {
    const u = Auth.user();
    const scans = Store.getScans(u ? u.email : 'guest');
    const pro = Money.isPro();

    if (!scans.length) {
      view.innerHTML = `
        <div class="card">
          <div class="card-title">Progress</div>
          <div class="empty">
            <div class="empty-icon">📈</div>
            <p><strong>No body scans yet.</strong></p>
            <p class="muted">Run the AI body scan on a profile and every scan is saved here — so you can watch your measurements change as you train, cut or bulk.</p>
            <a class="btn btn-primary" href="#/profiles">Go to my measurements</a>
          </div>
        </div>`;
      return;
    }

    const latest = scans[scans.length - 1];
    const rows = FitEngine.BODY_FIELDS
      .filter(f => f.key !== 'weight' && (latest.values[f.key] != null || f.key === 'height'))
      .map(f => {
        const v = f.key === 'height' ? latest.heightCm : latest.values[f.key];
        return v == null ? '' : `<div class="prog-row"><span>${esc(f.label)}</span><strong>${disp(v)} ${units()}</strong></div>`;
      }).join('');

    const latestCard = `
      <div class="card">
        <div class="card-title">Latest scan</div>
        <p class="muted small mb-16">${new Date(latest.ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · scan #${scans.length}</p>
        <div class="prog-grid-list">${rows}</div>
      </div>`;

    let historySection;
    if (pro) {
      const legend = PROG_METRICS.map(m => {
        const d = progDelta(scans, m.key);
        const dTxt = d == null ? '' : ` <span class="prog-delta ${d < 0 ? 'down' : d > 0 ? 'up' : ''}">${d > 0 ? '+' : ''}${disp(d)} ${units()}</span>`;
        return `<span class="prog-key"><i style="background:${m.color}"></i>${m.label}${dTxt}</span>`;
      }).join('');
      const list = scans.slice().reverse().map(s => `
        <div class="prog-row">
          <span>${new Date(s.ts).toLocaleDateString()}</span>
          <span class="muted small">${PROG_METRICS.map(m => s.values[m.key] != null ? `${m.label[0]} ${disp(s.values[m.key])}` : '').filter(Boolean).join(' · ')}</span>
        </div>`).join('');
      historySection = `
        <div class="card">
          <div class="card-title">Your trend</div>
          ${scans.length >= 2
            ? `<div class="prog-legend">${legend}</div>${progChartSvg(scans)}`
            : `<p class="muted">One scan saved. Scan again in a few weeks and your trend chart appears here — changes since your first scan and all.</p>`}
          <div class="divider"></div>
          <div class="section-label">All scans</div>
          ${list}
        </div>`;
    } else {
      historySection = `
        <div class="card lock-card">
          <div class="card-title">Your trend · ✦ Pro</div>
          <div class="lock-wrap">
            ${scans.length >= 2 ? progChartSvg(scans) : progChartSvg([
              { ts: Date.now() - 42 * 864e5, values: { chest: 98, waist: 84, hips: 100 } },
              { ts: Date.now() - 21 * 864e5, values: { chest: 99, waist: 81, hips: 99 } },
              { ts: Date.now(), values: { chest: 100, waist: 79, hips: 99 } }
            ])}
            <div class="lock-overlay">
              <div class="lock-ico">🔒</div>
              <p><strong>${scans.length >= 2 ? `${scans.length} scans saved` : 'Every scan is being saved'}</strong><br>
              Pro unlocks your full history: trend charts, change since your first scan, and every past measurement.</p>
            </div>
          </div>
        </div>
        ${Money.proCardHTML()}`;
    }

    view.innerHTML = latestCard + historySection + Money.bannerHTML('progress');
    Money.wireProCard(view);
    Money.wireAds(view);
  }

  /* ==========================================================
     WARDROBE — the digital closet (Pro). Photograph each item →
     stored on-device (IndexedDB) → build & save outfits.
     ========================================================== */

  const WARDROBE_TYPES = [
    { key: 'tshirt', label: 'T-shirt' }, { key: 'shirt', label: 'Shirt' },
    { key: 'top', label: 'Top' }, { key: 'hoodie', label: 'Hoodie' },
    { key: 'sweater', label: 'Sweater' }, { key: 'jacket', label: 'Jacket' },
    { key: 'coat', label: 'Coat' }, { key: 'jeans', label: 'Jeans' },
    { key: 'trousers', label: 'Trousers' }, { key: 'shorts', label: 'Shorts' },
    { key: 'skirt', label: 'Skirt' }, { key: 'dress', label: 'Dress' },
    { key: 'shoes', label: 'Shoes' }, { key: 'accessory', label: 'Accessory' }
  ];
  const TYPE_LABEL = Object.fromEntries(WARDROBE_TYPES.map(t => [t.key, t.label]));
  const SLOT_ORDER = ['head', 'outer', 'top', 'bottom', 'shoes'];
  const SLOT_LABEL = { head: 'Accessory', outer: 'Outerwear', top: 'Top', bottom: 'Bottom', shoes: 'Shoes' };

  // outfit-builder selection persists while the user browses
  let builderSel = null; // { [slot]: itemId } or null when not building

  function renderWardrobe() {
    const u = Auth.user();
    if (!u) {
      view.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="empty-icon">🚪</div>
            <h3>Your closet, in your pocket</h3>
            <p>Snap each piece you own and FitChecker builds you a digital wardrobe — then mix and match outfits without trying anything on. It needs a free account first, and your photos stay on this device.</p>
            <button class="btn btn-primary btn-lg" data-promo-login>Log in / Create free account</button>
          </div>
        </div>`;
      wirePromo();
      return;
    }

    const owner = u.email;
    view.innerHTML = `<div class="card"><div class="wardrobe-loading muted">${Cloud.isLinked() ? 'Syncing your wardrobe…' : 'Opening your wardrobe…'}</div></div>`;

    syncWardrobe(owner)
      .then(() => Wardrobe.listItems(owner))
      .then(items => paintWardrobe(u, items))
      .catch(() => {
        view.innerHTML = `<div class="card"><p class="muted">Couldn't open the wardrobe on this device. Your browser may block on-device storage in private mode.</p></div>`;
      });
  }

  /* Reconcile the on-device wardrobe with the account copy so it is the
     same on phone and PC. Server is the shared source of truth:
       • local items added offline (unsynced) are pushed up first,
       • items that exist only on the server are pulled down,
       • items removed on another device are removed locally.
     Runs only when linked + online; offline it's a no-op (local cache). */
  async function syncWardrobe(owner) {
    if (!Cloud.isLinked()) return;
    let server;
    try { server = await Cloud.getWardrobe(); } catch (e) { return; }
    if (!server || !server.ok) return; // offline / auth issue → keep local cache

    const local = await Wardrobe.listItems(owner);
    const serverIds = new Set(server.items.map(i => i.id));
    const localById = Object.fromEntries(local.map(i => [i.id, i]));

    // 1) push items added on this device while offline (marked unsynced)
    for (const it of local) {
      if (it.unsynced && !serverIds.has(it.id)) {
        const r = await Cloud.putItem(it);
        if (r && r.ok) { await Wardrobe.markSynced(it.id); serverIds.add(it.id); }
      }
    }
    // 2) pull down items this device doesn't have yet
    for (const it of server.items) {
      if (!localById[it.id]) await Wardrobe.putRaw(owner, it);
    }
    // 3) drop items deleted elsewhere (present locally, synced, gone on server)
    for (const it of local) {
      if (!serverIds.has(it.id) && !it.unsynced) await Wardrobe.deleteItem(it.id);
    }
    // 4) outfits: server list wins (they're small)
    if (Array.isArray(server.outfits)) {
      try { localStorage.setItem('fitcheck_outfits', JSON.stringify({ [owner]: server.outfits })); } catch (e) {}
    }
  }

  function paintWardrobe(u, items) {
    const owner = u.email;
    const pro = Money.isPro();
    const outfits = Wardrobe.listOutfits(owner);

    // Not subscribed and nothing saved yet → the sell teaser.
    if (!pro && !items.length) {
      view.innerHTML = `
        <div class="card wardrobe-hero">
          <div class="wh-badge">✦ Pro</div>
          <h2>Build your digital wardrobe</h2>
          <p class="muted">Photograph everything you own — FitChecker cuts each piece out and keeps your whole closet on your phone. Then:</p>
          <ul class="wh-list">
            <li>👕 <span>Mix & match outfits without trying anything on</span></li>
            <li>🤖 <span>AI rates the combo and finds gaps to fill</span></li>
            <li>⚔️ <span>Post your fits to battles & the Outfits feed</span></li>
            <li>💸 <span>Clear out what you don't wear — sell it in two taps</span></li>
          </ul>
          <p class="muted small">Unlimited items. Everything is stored on your device — nothing is uploaded.</p>
        </div>
        ${Money.proCardHTML()}`;
      Money.wireProCard(view);
      return;
    }

    const bytes = items.reduce((s, i) => s + (i.img ? i.img.length : 0), 0);
    const mb = (bytes / (1024 * 1024) * 0.75).toFixed(1); // dataURL→bytes ≈ ×0.75

    const grid = items.length ? `
      <div class="ward-grid">
        ${items.map(it => `
          <button class="ward-item" data-item="${esc(it.id)}">
            <span class="ward-thumb"><img src="${it.img}" alt="${esc(it.name || TYPE_LABEL[it.type] || 'item')}" loading="lazy"></span>
            <span class="ward-cap">
              <span class="ward-dot" style="background:${esc(it.colorHex)}"></span>
              ${esc(it.name || TYPE_LABEL[it.type] || 'Item')}
            </span>
          </button>`).join('')}
      </div>` : `
      <div class="empty">
        <div class="empty-icon">👕</div>
        <p><strong>Your wardrobe is empty.</strong></p>
        <p class="muted">Add your first piece — lay it on a plain surface, snap it, and it lands here.</p>
      </div>`;

    const outfitStrip = outfits.length ? `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Saved outfits <span class="count-chip">${outfits.length}</span></span>
        </div>
        <div class="outfit-strip">
          ${outfits.map(o => `
            <button class="outfit-mini" data-outfit="${esc(o.id)}">
              <span class="om-board">${outfitBoardMini(o, items)}</span>
              <span class="om-name">${esc(o.name || 'Outfit')}</span>
            </button>`).join('')}
        </div>
      </div>` : '';

    view.innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>My Wardrobe <span class="count-chip">${items.length}</span></span>
          <span class="btn-row">
            <button class="btn btn-secondary btn-sm" id="ward-build" ${items.length < 2 ? 'disabled' : ''}>Build outfit</button>
            <button class="btn btn-primary btn-sm" id="ward-add">+ Add item</button>
          </span>
        </div>
        <p class="muted small mb-16">${items.length ? `${mb} MB used · unlimited items` : 'Tap “Add item” to start.'}${Cloud.isLinked() ? ' · <span class="synced">✓ synced to your account</span>' : ''}${pro ? '' : ' · <a href="#/settings">Resubscribe</a> to add more'}</p>
        ${grid}
      </div>
      ${wardrobeGapCard(items)}
      ${outfitStrip}
      ${Money.bannerHTML('wardrobe')}`;

    const addBtn = document.getElementById('ward-add');
    if (addBtn) addBtn.onclick = () => { if (requirePro('Add to your wardrobe', 'The digital wardrobe is a Pro feature — unlimited items, outfit builder and AI outfit ratings, all stored on your device.')) openAddItem(owner); };
    const buildBtn = document.getElementById('ward-build');
    if (buildBtn) buildBtn.onclick = () => { if (requirePro('Build an outfit', 'Mixing and matching your closet into saved outfits is part of Pro.')) startOutfitBuilder(owner, items); };
    view.querySelectorAll('[data-item]').forEach(b => b.onclick = () => openItemDetail(owner, b.getAttribute('data-item')));
    view.querySelectorAll('[data-outfit]').forEach(b => b.onclick = () => openOutfitView(owner, b.getAttribute('data-outfit')));
    wireFavButtons(view);
    Money.wireAds(view);
  }

  /* Gap analysis: what a rounded wardrobe is missing, with a pick in the
     user's size for each gap. The strongest affiliate hook in the app —
     it recommends exactly what they lack, sized to them. */
  const ESSENTIALS = [
    { key: 'tee',    label: 'An everyday tee',      have: ['tshirt', 'top'],            recType: 'tshirt' },
    { key: 'shirt',  label: 'A shirt',              have: ['shirt'],                    recType: 'shirt' },
    { key: 'layer',  label: 'A hoodie or sweater',  have: ['hoodie', 'sweater'],        recType: 'hoodie' },
    { key: 'jacket', label: 'A jacket',             have: ['jacket', 'coat', 'blazer'], recType: 'jacket' },
    { key: 'jeans',  label: 'Jeans or trousers',    have: ['jeans', 'trousers'],        recType: 'jeans' },
    { key: 'dress',  label: 'A dress',              have: ['dress'],                    recType: 'dress',  femaleOnly: true }
  ];

  function wardrobeGapCard(items) {
    if (!items.length) return ''; // nothing to analyse yet
    const profile = getActiveProfile();
    const owned = new Set(items.map(i => i.type));
    const recs = (typeof RECS !== 'undefined' && Array.isArray(RECS)) ? RECS : [];
    const sizeByType = {};
    if (profile && profile.body) {
      computeSizes(profile).forEach(s => { sizeByType[s.type] = s.size; });
    }

    const gaps = ESSENTIALS.filter(e => {
      if (e.femaleOnly && (!profile || profile.sex !== 'female')) return false;
      return !e.have.some(t => owned.has(t));
    });

    if (!gaps.length) {
      return `<div class="card gap-card">
        <div class="card-title">Wardrobe check ✓</div>
        <p class="muted small">Your essentials are covered — tops, layers, a jacket and bottoms are all in your closet. Nice.</p>
      </div>`;
    }

    // one pick per gap, in the user's size where we can
    const picks = gaps.map(g => {
      const rec = recs.find(r => r.types.includes(g.recType));
      const size = sizeByType[g.recType];
      return { g, rec, size };
    }).filter(p => p.rec);

    return `<div class="card gap-card">
      <div class="card-title">Complete your wardrobe</div>
      <p class="muted small mb-16">Rounding out your closet — here's what's missing${profile ? ', with a pick in your size' : ''}.</p>
      <div class="gap-list">
        ${gaps.map(g => `<span class="gap-chip">${esc(g.label)}</span>`).join('')}
      </div>
      ${picks.length ? `<div class="row-list mt-16">${picks.map(p => `
        ${p.size ? `<div class="gap-size">In your size — <strong>${esc(p.size)}</strong> · ${esc(p.g.label.toLowerCase())}</div>` : ''}
        ${recRow(p.rec)}`).join('')}</div>
        <p class="disclosure">Some links may earn FitChecker a small commission. It never changes what's recommended.</p>` : ''}
    </div>`;
  }

  // small stacked preview of an outfit for the saved strip
  function outfitBoardMini(outfit, items) {
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    return SLOT_ORDER.map(slot => {
      const id = outfit.slots && outfit.slots[slot];
      const it = id && byId[id];
      return it ? `<img src="${it.img}" alt="">` : '';
    }).join('');
  }

  /* ---------- add an item ---------- */

  function openAddItem(owner) {
    Camera.pickImage({
      onImage: raw => processNewItem(owner, raw),
      onError: () => toast('Could not read that photo.', 'err')
    });
  }

  async function processNewItem(owner, raw) {
    toast('Reading colours…');
    let suggest = { hex: '#888888', name: '' };
    try { suggest = await Wardrobe.dominantColour(raw); } catch (e) {}

    const draft = { raw, processed: raw, type: 'tshirt', colorHex: suggest.hex, colorName: suggest.name, noBg: false };

    const overlay = openModal(`
      <h3 class="card-title">New wardrobe item</h3>
      <div class="add-preview"><img id="add-img" src="${raw}" alt=""></div>
      <label class="check-row"><input type="checkbox" id="add-nobg"> <span>Remove background <span class="muted small">(best on a plain surface)</span></span></label>
      <div class="section-label">What is it?</div>
      <div id="add-type">${typeTiles(WARDROBE_TYPES, 'tshirt', 'Garment type')}</div>
      <div class="form-grid mt-16">
        <div class="field">
          <label for="add-name">Name <span class="muted small">(optional)</span></label>
          <input class="input" id="add-name" type="text" placeholder="e.g. Black Levi's 501" value="">
        </div>
        <div class="field">
          <label for="add-price">Price paid <span class="muted small">(optional)</span></label>
          <input class="input" id="add-price" type="number" step="0.01" inputmode="decimal" placeholder="for cost-per-wear">
        </div>
      </div>
      <div class="add-colour">
        <span class="ward-dot" id="add-swatch" style="background:${suggest.hex}"></span>
        <span class="muted small">Detected colour: <strong id="add-cname">${esc(suggest.name || '—')}</strong></span>
      </div>
      <div class="btn-row" style="flex-direction:column;margin-top:16px">
        <button class="btn btn-primary btn-block btn-lg" id="add-save">Add to wardrobe</button>
        <button class="btn btn-ghost btn-block" data-act="cancel">Cancel</button>
      </div>`);

    overlay.querySelector('[data-act="cancel"]').onclick = () => overlay.remove();
    wireTypeTiles(overlay, key => { draft.type = key; });
    const imgEl = overlay.querySelector('#add-img');
    const nobg = overlay.querySelector('#add-nobg');
    nobg.onchange = async () => {
      draft.noBg = nobg.checked;
      imgEl.style.opacity = '.5';
      try {
        draft.processed = nobg.checked ? await Wardrobe.removeBackground(raw) : raw;
        imgEl.src = draft.processed;
      } catch (e) { draft.processed = raw; }
      imgEl.style.opacity = '1';
    };

    overlay.querySelector('#add-save').onclick = async () => {
      const btn = overlay.querySelector('#add-save');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const img = await Wardrobe.compress(draft.processed, { maxDim: 1024, quality: 0.82 });
        const priceRaw = overlay.querySelector('#add-price').value;
        const rec = {
          type: draft.type,
          name: overlay.querySelector('#add-name').value.trim(),
          colorHex: draft.colorHex,
          colorName: draft.colorName,
          img,
          price: priceRaw === '' ? null : parseFloat(priceRaw),
          unsynced: Cloud.isLinked()   // will be cleared once the cloud push confirms
        };
        const id = await Wardrobe.addItem(owner, rec);
        // push to the account (best-effort; if offline it stays 'unsynced' to retry)
        if (Cloud.isLinked()) {
          const full = await Wardrobe.getItem(id);
          Cloud.putItem(full).then(r => { if (r && r.ok) Wardrobe.markSynced(id); }).catch(() => {});
        }
        overlay.remove();
        toast(Cloud.isLinked() ? 'Added — saved to your account ✦' : 'Added to your wardrobe ✦', 'ok');
        renderWardrobe();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Add to wardrobe';
        toast('Could not save — device storage may be full.', 'err');
      }
    };
  }

  /* ---------- item detail ---------- */

  async function openItemDetail(owner, id) {
    const it = await Wardrobe.getItem(id);
    if (!it) { toast('Item not found.', 'err'); return; }
    const q = encodeURIComponent([it.colorName, TYPE_LABEL[it.type]].filter(Boolean).join(' '));
    const worn = it.worn || 0;
    const cpw = (it.price != null && worn > 0) ? (it.price / worn) : null;
    const costLine = it.price != null
      ? `<div class="cpw ${cpw != null && cpw <= 5 ? 'good' : ''}">
           ${cpw != null
             ? `<strong>${money(cpw)}</strong><span> per wear</span><em>${money(it.price)} ÷ ${worn} wears</em>`
             : `<strong>${money(it.price)}</strong><span> paid</span><em>wear it to start tracking cost-per-wear</em>`}
         </div>`
      : `<button class="btn btn-ghost btn-sm mt-8" data-act="price">+ Add price (for cost-per-wear)</button>`;
    const overlay = openModal(`
      <div class="detail-img"><img src="${it.img}" alt="${esc(it.name || '')}"></div>
      <h3 class="card-title" style="margin-top:12px">${esc(it.name || TYPE_LABEL[it.type] || 'Item')}</h3>
      <p class="muted small">${esc(TYPE_LABEL[it.type] || '')}${it.colorName ? ' · ' + esc(it.colorName) : ''} · worn ${worn}×</p>
      ${costLine}

      <div class="btn-row mt-16" style="flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" data-act="worn">Wore it today</button>
        <button class="btn btn-ghost btn-sm" data-act="sell">Sell this</button>
        <button class="btn btn-danger btn-sm" data-act="del" style="margin-left:auto">Delete</button>
      </div>

      <div id="sell-panel" class="sell-panel hidden">
        <p class="muted small mb-16">Your photo is saved on this device — open a marketplace, start a listing and upload it there. Selling old pieces funds the new ones.</p>
        <div class="btn-row" style="flex-direction:column">
          <a class="btn btn-secondary btn-block" href="https://www.vinted.se/items/new" target="_blank" rel="noopener">Sell on Vinted</a>
          <a class="btn btn-secondary btn-block" href="https://www.depop.com/sell/" target="_blank" rel="noopener">Sell on Depop</a>
          <a class="btn btn-secondary btn-block" href="https://www.ebay.com/sl/sell?q=${q}" target="_blank" rel="noopener">Sell on eBay</a>
        </div>
      </div>
      <button class="btn btn-ghost btn-block mt-16" data-act="close">Close</button>`);

    overlay.querySelector('[data-act="close"]').onclick = () => overlay.remove();
    overlay.querySelector('[data-act="worn"]').onclick = async () => {
      const next = await Wardrobe.updateItem(id, { worn: (it.worn || 0) + 1 });
      if (Cloud.isLinked() && next) Cloud.putItem(next).catch(() => {});
      toast('Nice — logged as worn today.', 'ok');
      overlay.remove();
    };
    overlay.querySelector('[data-act="sell"]').onclick = () => {
      overlay.querySelector('#sell-panel').classList.toggle('hidden');
    };
    const priceBtn = overlay.querySelector('[data-act="price"]');
    if (priceBtn) priceBtn.onclick = () => {
      const pm = openModal(`
        <h3 class="card-title">What did it cost?</h3>
        <div class="field mt-16"><label for="pr-in">Price paid</label>
          <input class="input" id="pr-in" type="number" step="0.01" inputmode="decimal" placeholder="e.g. 39.90" autofocus></div>
        <div class="btn-row" style="flex-direction:column;margin-top:16px">
          <button class="btn btn-primary btn-block" id="pr-save">Save</button>
          <button class="btn btn-ghost btn-block" data-act="cancel">Cancel</button>
        </div>`);
      pm.querySelector('[data-act="cancel"]').onclick = () => pm.remove();
      pm.querySelector('#pr-save').onclick = async () => {
        const v = parseFloat(pm.querySelector('#pr-in').value);
        if (isNaN(v) || v < 0) { toast('Enter a price.', 'err'); return; }
        const next = await Wardrobe.updateItem(id, { price: v });
        if (Cloud.isLinked() && next) Cloud.putItem(next).catch(() => {});
        pm.remove(); overlay.remove();
        openItemDetail(owner, id); // reopen with the cost line
      };
    };
    overlay.querySelector('[data-act="del"]').onclick = () => {
      confirmModal('Delete this item?', 'It will be removed from your wardrobe and any saved outfits. This cannot be undone.', 'Delete', async () => {
        await Wardrobe.deleteItem(id);
        if (Cloud.isLinked()) Cloud.deleteItem(id).catch(() => {});
        overlay.remove();
        toast('Removed from your wardrobe.');
        renderWardrobe();
      });
    };
  }

  /* ---------- outfit builder ---------- */

  function startOutfitBuilder(owner, items) {
    builderSel = {};
    paintBuilder(owner, items);
  }

  function paintBuilder(owner, items) {
    const bySlot = {};
    for (const slot of SLOT_ORDER) bySlot[slot] = items.filter(i => (Wardrobe.SLOT_OF[i.type] || 'top') === slot);

    const picker = SLOT_ORDER.filter(s => bySlot[s].length).map(slot => `
      <div class="builder-slot">
        <div class="section-label">${SLOT_LABEL[slot]}</div>
        <div class="builder-row">
          ${bySlot[slot].map(it => `
            <button class="builder-pick ${builderSel[slot] === it.id ? 'on' : ''}" data-slot="${slot}" data-id="${esc(it.id)}">
              <img src="${it.img}" alt="">
            </button>`).join('')}
        </div>
      </div>`).join('');

    const chosen = SLOT_ORDER.map(slot => {
      const id = builderSel[slot];
      const it = id && items.find(i => i.id === id);
      return it ? `<img src="${it.img}" alt="" class="board-piece">` : '';
    }).join('');
    const anyChosen = Object.values(builderSel).some(Boolean);

    view.innerHTML = `
      <div class="card">
        <div class="card-title">Build an outfit</div>
        <p class="muted small mb-16">Tap one piece per row to stack your look. Save it, rate it, or send it to a battle.</p>
        <div class="outfit-board">${anyChosen ? chosen : '<div class="board-empty muted">Your outfit appears here</div>'}</div>
        ${anyChosen ? `<div class="btn-row" style="flex-wrap:wrap;justify-content:center">
          <button class="btn btn-secondary btn-sm" id="ob-rate">Rate this outfit</button>
          <button class="btn btn-primary btn-sm" id="ob-save">Save outfit</button>
        </div>` : ''}
        <div id="ob-rating"></div>
      </div>
      <div class="card">
        ${picker}
        <div class="btn-row mt-16"><button class="btn btn-ghost" id="ob-cancel">Done</button></div>
      </div>`;

    view.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
      const slot = b.getAttribute('data-slot'), id = b.getAttribute('data-id');
      builderSel[slot] = builderSel[slot] === id ? null : id; // tap again to clear
      paintBuilder(owner, items);
    });
    const cancel = document.getElementById('ob-cancel');
    if (cancel) cancel.onclick = () => { builderSel = null; renderWardrobe(); };
    const save = document.getElementById('ob-save');
    if (save) save.onclick = () => saveBuiltOutfit(owner, items);
    const rate = document.getElementById('ob-rate');
    if (rate) rate.onclick = () => rateBuiltOutfit(items);
  }

  function rateBuiltOutfit(items) {
    const chosen = SLOT_ORDER.map(s => builderSel[s]).filter(Boolean).map(id => items.find(i => i.id === id)).filter(Boolean);
    const box = document.getElementById('ob-rating');
    if (!chosen.length) return;
    // simple, honest on-device heuristic: colour harmony + completeness
    const score = scoreOutfit(chosen);
    box.innerHTML = `
      <div class="ob-score">
        <div class="ob-num">${score.score}<span>/100</span></div>
        <p class="muted small">${esc(score.note)}</p>
      </div>`;
  }

  function scoreOutfit(pieces) {
    let score = 55;
    const slots = new Set(pieces.map(p => Wardrobe.SLOT_OF[p.type] || 'top'));
    if (slots.has('top') && slots.has('bottom')) score += 15; // a complete base
    if (slots.has('shoes')) score += 8;
    if (slots.has('outer')) score += 6;
    // colour balance — reward a neutral anchor + limited palette
    const NEUTRAL = ['Black', 'White', 'Grey', 'Navy', 'Beige', 'Cream', 'Brown'];
    const names = pieces.map(p => p.colorName);
    const neutrals = names.filter(n => NEUTRAL.includes(n)).length;
    const distinct = new Set(names).size;
    if (neutrals >= 1) score += 8;
    if (distinct <= 3) score += 8; else score -= 6;
    score = Math.max(20, Math.min(98, score));
    let note;
    if (!slots.has('top') || !slots.has('bottom')) note = 'Add a top and a bottom for a complete look.';
    else if (distinct > 3) note = 'Lots of colours going on — try anchoring it with a neutral.';
    else if (neutrals >= 1 && distinct <= 3) note = 'Balanced palette with a solid neutral base — this works.';
    else note = 'Solid combo. A neutral shoe or jacket would sharpen it.';
    return { score, note };
  }

  function saveBuiltOutfit(owner, items) {
    const slots = {};
    SLOT_ORDER.forEach(s => { if (builderSel[s]) slots[s] = builderSel[s]; });
    if (!Object.keys(slots).length) { toast('Pick at least one piece.', 'err'); return; }
    const overlay = openModal(`
      <h3 class="card-title">Save this outfit</h3>
      <div class="field mt-16">
        <label for="ob-name">Name it</label>
        <input class="input" id="ob-name" type="text" placeholder="e.g. Friday casual" value="">
      </div>
      <div class="btn-row" style="flex-direction:column;margin-top:16px">
        <button class="btn btn-primary btn-block btn-lg" id="ob-confirm">Save</button>
        <button class="btn btn-ghost btn-block" data-act="cancel">Cancel</button>
      </div>`);
    overlay.querySelector('[data-act="cancel"]').onclick = () => overlay.remove();
    overlay.querySelector('#ob-confirm').onclick = () => {
      const name = overlay.querySelector('#ob-name').value.trim() || 'My outfit';
      Wardrobe.saveOutfit(owner, { name, slots });
      if (Cloud.isLinked()) Cloud.putOutfits(Wardrobe.listOutfits(owner)).catch(() => {});
      overlay.remove();
      builderSel = null;
      toast('Outfit saved ✦', 'ok');
      renderWardrobe();
    };
  }

  async function openOutfitView(owner, id) {
    const outfit = Wardrobe.listOutfits(owner).find(o => o.id === id);
    if (!outfit) return;
    const items = await Wardrobe.listItems(owner);
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    const board = SLOT_ORDER.map(s => {
      const it = outfit.slots && outfit.slots[s] && byId[outfit.slots[s]];
      return it ? `<img src="${it.img}" alt="" class="board-piece">` : '';
    }).join('');
    const overlay = openModal(`
      <h3 class="card-title">${esc(outfit.name || 'Outfit')}</h3>
      <div class="outfit-board compact mt-16">${board || '<div class="board-empty muted">Pieces were removed</div>'}</div>
      <div class="btn-row" style="flex-direction:column;margin-top:16px">
        <button class="btn btn-danger btn-block" data-act="del">Delete outfit</button>
        <button class="btn btn-ghost btn-block" data-act="close">Close</button>
      </div>`);
    overlay.querySelector('[data-act="close"]').onclick = () => overlay.remove();
    overlay.querySelector('[data-act="del"]').onclick = () => {
      Wardrobe.deleteOutfit(owner, id);
      if (Cloud.isLinked()) Cloud.putOutfits(Wardrobe.listOutfits(owner)).catch(() => {});
      overlay.remove();
      toast('Outfit deleted.');
      renderWardrobe();
    };
  }

  function renderMore() {
    const items = [
      { route: 'wardrobe', label: 'My Wardrobe', sub: 'Your closet · build & save outfits · ✦ Pro',
        icon: '<path d="M12 3v7"/><path d="M12 10 5 13.5V20h14v-6.5L12 10Z"/><path d="M12 10c-2 0-3.2-1-3.2-2.4A2.2 2.2 0 0 1 11 5.4"/>' },
      { route: 'favourites', label: 'Favourites', sub: 'Clothing you saved from For You',
        icon: '<path d="M12 20.3 4.4 12.7a4.6 4.6 0 0 1 6.5-6.5l1.1 1.1 1.1-1.1a4.6 4.6 0 0 1 6.5 6.5L12 20.3Z"/>' },
      { route: 'profiles', label: 'My measurements', sub: 'Body profiles & photos',
        icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>' },
      { route: 'passport', label: 'Size Passport', sub: 'Your size in every category · share it',
        icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M13 9h5M13 12.5h5M6 15.5h8"/>' },
      { route: 'history', label: 'History', sub: 'Your past fit checks',
        icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>' },
      { route: 'progress', label: 'Progress', sub: 'Body scans over time · ✦ Pro',
        icon: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/><path d="M18 7h1v1"/>' },
      { route: 'colours', label: 'Colours', sub: 'Your seasonal palette',
        icon: '<path d="M12 3a9 9 0 0 0 0 18 3 3 0 0 0 0-6 2 2 0 0 1 0-4h1.5a4.5 4.5 0 0 0 4.5-4.5C18 3.9 15.3 3 12 3Z"/>' },
      { route: 'settings', label: 'Settings', sub: 'Units, language, account',
        icon: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2.5"/><circle cx="8" cy="16" r="2.5"/>' },
      { route: 'help', label: 'Help & FAQ', sub: 'How FitChecker works',
        icon: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 1.8-2.8 2.2-2.8 4"/><circle cx="12" cy="17.6" r=".3" fill="currentColor"/>' }
    ];

    view.innerHTML = `
      <div class="card">
        <div class="card-title">More</div>
        <div class="menu-list">
          ${items.map(it => `
            <a class="menu-row" href="#/${it.route}">
              <span class="menu-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.icon}</svg></span>
              <span class="menu-text"><span class="menu-label">${it.label}</span><span class="menu-sub">${it.sub}</span></span>
              <svg class="menu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
            </a>`).join('')}
        </div>
      </div>
      ${Money.bannerHTML('more')}`;
    Money.wireAds(view);
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
        <div class="card-title">Appearance</div>
        <p class="muted small mb-16">Choose a theme, or let it follow your device.</p>
        <div class="theme-seg" id="st-theme">
          ${['system', 'light', 'dark'].map(t => `<button data-theme-opt="${t}" class="${(window.Theme ? Theme.get() : 'system') === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Language</div>
        <p class="muted small mb-16">The interface language for FitChecker on this device. Each screen is translated the first time you open it, then saved — so it gets faster (and works offline) the more you use it.</p>
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
        <div class="card-title">Install FitChecker</div>
        ${(!isStandalone() && deferredInstallPrompt) ? '<button class="btn btn-primary mb-16" id="st-install">Install now</button>' : ''}
        <p class="muted small">FitChecker works as an app on your phone:</p>
        <div class="zone-list mt-8">
          <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">iPhone / iPad</div><div class="zone-msg">Open in Safari → Share button → "Add to Home Screen".</div></div></div>
          <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">Android</div><div class="zone-msg">Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".</div></div></div>
          <div class="zone-card"><span class="zone-dot" style="background:var(--primary)"></span><div class="zone-body"><div class="zone-name">Desktop</div><div class="zone-msg">Chrome / Edge → install icon in the address bar.</div></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Privacy & data</div>
        <p class="muted small mb-8">${u
          ? 'Your measurements, saved profiles, wardrobe and favourites sync to your account, so they follow you across your devices. Face and body photos stay on this device. You can erase all of it below.'
          : 'Your measurements and preferences live only in this browser on this device — nothing is uploaded. Clearing browser data erases them.'}</p>
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

    const themeSeg = document.getElementById('st-theme');
    if (themeSeg) themeSeg.onclick = e => {
      const b = e.target.closest('[data-theme-opt]');
      if (!b || !window.Theme) return;
      Theme.set(b.getAttribute('data-theme-opt'));
      renderSettings();
    };

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
      'This permanently removes your account, profiles, measurements, wardrobe, favourites, photos and history — from this device and from our servers. It cannot be undone.',
      'Delete everything',
      async () => {
        // Delete server-side FIRST so nothing is left behind. If the account
        // is synced and the server can't be reached, stop — otherwise we'd
        // wipe the device but leave the data on the server (and a re-login
        // would restore it), which is not a real deletion.
        if (Cloud.isLinked()) {
          const r = await Cloud.deleteAccount();
          if (!r || !r.ok) {
            toast('Could not reach the server — please try again when online.', 'err');
            return;
          }
          Cloud.clearLink();
        }
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
    Cloud.logout().catch(() => {});
    Auth.logout();
    wiz = null;
    guestResult = null;
    authTab = 'login';
    toast('Logged out — you can keep using FitChecker as a guest.');
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

  // Pull measurements + favourites from the account so they're present on
  // whatever device this is. Re-renders if anything changed.
  syncAccountData().then(changed => { if (changed) render(); }).catch(() => {});

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
