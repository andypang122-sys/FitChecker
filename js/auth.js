'use strict';
/* ============================================================
   Auth — register / login / logout / session.
   Passwords are hashed with SHA-256 + per-user salt before
   storage (via Web Crypto, with a fallback for non-secure
   contexts). Data never leaves this device.
   ============================================================ */

const Auth = (() => {
  let currentUser = null; // { email, name, ...userData }

  /* ---------- hashing ---------- */

  async function hash(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback (file:// or old browsers): FNV-1a, iterated.
    let h = 0x811c9dc5;
    for (let round = 0; round < 64; round++) {
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
    return 'fnv_' + h.toString(16);
  }

  function makeSalt() {
    if (window.crypto && crypto.getRandomValues) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /* ---------- validation ---------- */

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  /* ---------- register / login ---------- */

  async function register({ name, email, password }) {
    email = normalizeEmail(email);
    name = String(name || '').trim();

    if (!name) return { ok: false, error: 'Please enter your name.' };
    if (!validEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };
    if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    if (Store.getUser(email)) return { ok: false, error: 'An account with this email already exists. Try logging in.' };

    const salt = makeSalt();
    const passHash = await hash(salt + password);

    const user = {
      email,
      name,
      salt,
      passHash,
      createdAt: Date.now(),
      profiles: [],          // body profiles: measurements + photos
      activeProfileId: null,
      analyses: [],          // fit-check history
      prefs: { units: 'cm' } // 'cm' | 'in'
    };

    const saved = Store.saveUser(email, user);
    if (!saved.ok) return { ok: false, error: 'Could not save the account — device storage is full.' };

    Store.setSession(email, true);
    currentUser = user;
    return { ok: true, user };
  }

  async function login({ email, password, remember }) {
    email = normalizeEmail(email);
    const user = Store.getUser(email);
    if (!user) return { ok: false, error: 'No account found with this email.' };

    const passHash = await hash(user.salt + password);
    if (passHash !== user.passHash) return { ok: false, error: 'Incorrect password. Please try again.' };

    Store.setSession(email, remember !== false);
    currentUser = user;
    return { ok: true, user };
  }

  function logout() {
    Store.clearSession();
    currentUser = null;
  }

  /* ---------- session restore ---------- */

  function restore() {
    const session = Store.getSession();
    if (!session) return null;
    const user = Store.getUser(session.email);
    if (!user) {
      Store.clearSession();
      return null;
    }
    currentUser = user;
    return user;
  }

  function user() {
    return currentUser;
  }

  /* ---------- persistence of the logged-in user ---------- */

  function save() {
    if (!currentUser) return { ok: false };
    return Store.saveUser(currentUser.email, currentUser);
  }

  async function changePassword(oldPass, newPass) {
    if (!currentUser) return { ok: false, error: 'Not logged in.' };
    const check = await hash(currentUser.salt + oldPass);
    if (check !== currentUser.passHash) return { ok: false, error: 'Current password is incorrect.' };
    if (!newPass || newPass.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
    currentUser.salt = makeSalt();
    currentUser.passHash = await hash(currentUser.salt + newPass);
    save();
    return { ok: true };
  }

  function deleteAccount() {
    if (!currentUser) return;
    Store.deleteUser(currentUser.email);
    Store.clearSession();
    currentUser = null;
  }

  return { register, login, logout, restore, user, save, changePassword, deleteAccount };
})();
