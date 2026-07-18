'use strict';
/* ============================================================
   CLOUD — server-side account link + wardrobe sync.

   The app still works fully offline on-device; this module adds an
   optional cloud account so a user's wardrobe follows them between
   phone and PC. When linked, the on-device IndexedDB acts as a fast
   local cache/mirror of the server copy.

   A short-lived token (stored in localStorage) authenticates every
   request. The password is sent once at login/register over the same
   origin; the server only ever keeps a salted hash.

   API:
     Cloud.isLinked() / Cloud.session()          → link state
     Cloud.link(email, password, name)           → login, else register
     Cloud.logout()
     Cloud.getWardrobe()                         → {ok, items, outfits}
     Cloud.putItem(item) / deleteItem(id) / putOutfits(list)
   All network calls resolve to an object; on failure they return
   { ok:false, offline:true } rather than throwing.
   ============================================================ */

const Cloud = (() => {
  const KEY = 'fitcheck_cloud'; // { token, email, name }

  function session() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function token() { const s = session(); return s && s.token; }
  function isLinked() { return !!token(); }
  function _set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clearLink() { try { localStorage.removeItem(KEY); } catch (e) {} }

  async function _post(path, body) {
    try {
      const r = await fetch('api/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await r.json();
    } catch (e) {
      return { ok: false, offline: true };
    }
  }

  async function register(email, password, name) {
    const r = await _post('account/register', { email, password, name });
    if (r.ok) _set({ token: r.token, email: r.email, name: r.name });
    return r;
  }

  async function login(email, password) {
    const r = await _post('account/login', { email, password });
    if (r.ok) _set({ token: r.token, email: r.email, name: r.name });
    return r;
  }

  /* Link the local account to its cloud twin: try login first (the
     account may already exist from another device), fall back to
     creating it. Best-effort — a failure just leaves the user
     on-device only, and we retry next time. */
  async function link(email, password, name) {
    let r = await login(email, password);
    if (!r.ok && !r.offline) r = await register(email, password, name);
    return r;
  }

  async function logout() {
    const t = token();
    if (t) await _post('account/logout', { token: t });
    clearLink();
  }

  async function getWardrobe() {
    const t = token();
    if (!t) return { ok: false };
    try {
      const r = await fetch('api/wardrobe', { headers: { Authorization: 'Bearer ' + t } });
      return await r.json();
    } catch (e) {
      return { ok: false, offline: true };
    }
  }

  async function putItem(item) { const t = token(); if (!t) return { ok: false }; return _post('wardrobe/item', { token: t, item }); }
  async function deleteItem(id) { const t = token(); if (!t) return { ok: false }; return _post('wardrobe/delete', { token: t, id }); }
  async function putOutfits(outfits) { const t = token(); if (!t) return { ok: false }; return _post('wardrobe/outfits', { token: t, outfits }); }

  // account data = body profiles (measurements) + favourited products
  async function getAccountData() {
    const t = token();
    if (!t) return { ok: false };
    try {
      const r = await fetch('api/account/data', { headers: { Authorization: 'Bearer ' + t } });
      return await r.json();
    } catch (e) {
      return { ok: false, offline: true };
    }
  }
  async function putProfiles(profiles, activeProfileId) { const t = token(); if (!t) return { ok: false }; return _post('profiles', { token: t, profiles, activeProfileId }); }
  async function putFavourites(favourites) { const t = token(); if (!t) return { ok: false }; return _post('favourites', { token: t, favourites }); }

  // Erase the account + all its data (login, measurements, wardrobe,
  // favourites, photos) from the server. Play requires real deletion.
  async function deleteAccount() { const t = token(); if (!t) return { ok: false }; return _post('account/delete', { token: t }); }

  return { session, token, isLinked, register, login, link, logout,
           getWardrobe, putItem, deleteItem, putOutfits,
           getAccountData, putProfiles, putFavourites, deleteAccount, clearLink };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Cloud };
