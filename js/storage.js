'use strict';
/* ============================================================
   Store — localStorage persistence layer.
   All account data lives on this device, keyed by email:
   accounts, body profiles (measurements + photos),
   analysis history and preferences.
   ============================================================ */

const Store = (() => {
  const USERS_KEY = 'fitcheck_users';
  const SESSION_KEY = 'fitcheck_session';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ---------- users ---------- */

  function getUsers() {
    return read(USERS_KEY, {});
  }

  function getUser(email) {
    return getUsers()[email] || null;
  }

  function saveUser(email, data) {
    const users = getUsers();
    users[email] = data;
    try {
      write(USERS_KEY, users);
      return { ok: true };
    } catch (e) {
      // Quota exceeded — photos are the usual culprit.
      return { ok: false, quota: true };
    }
  }

  function deleteUser(email) {
    const users = getUsers();
    delete users[email];
    write(USERS_KEY, users);
  }

  /* ---------- session ---------- */

  function getSession() {
    const s = read(SESSION_KEY, null);
    if (!s) return null;
    if (s.expiresAt && Date.now() > s.expiresAt) {
      clearSession();
      return null;
    }
    return s;
  }

  function setSession(email, remember) {
    const ttl = remember ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
    write(SESSION_KEY, { email, expiresAt: Date.now() + ttl });
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* ---------- guest preferences (no account needed) ---------- */

  const GUEST_KEY = 'fitcheck_guest_prefs';
  const GUEST_BODY_KEY = 'fitcheck_guest_body';
  const RESPONSES_KEY = 'fitcheck_responses';

  function getGuestPrefs() {
    return read(GUEST_KEY, { units: 'cm' });
  }

  function saveGuestPrefs(prefs) {
    write(GUEST_KEY, prefs);
  }

  /* Guest measurements auto-save on this device, so a refresh or a
     closed tab never costs someone their numbers. */
  function getGuestBody() {
    return read(GUEST_BODY_KEY, null);
  }

  function saveGuestBody(body) {
    try { write(GUEST_BODY_KEY, body); } catch (e) { /* quota — skip */ }
  }

  /* ---------- analytics response tracking ---------- */
  function getResponses() {
    return read(RESPONSES_KEY, []);
  }

  function recordResponse(answers) {
    const list = getResponses();
    list.push({ id: uid(), ts: Date.now(), answers });
    try { write(RESPONSES_KEY, list); } catch (e) { /* quota — skip */ }
  }

  /* ---------- ids ---------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return { getUsers, getUser, saveUser, deleteUser, getSession, setSession, clearSession, getGuestPrefs, saveGuestPrefs, getGuestBody, saveGuestBody, getResponses, recordResponse, uid };
})();
