'use strict';
/* ============================================================
   Remind — scheduled reminders, shared across the apps.

   Powers the features that turn one-off tools into recurring
   ones: Dewy's restock reminders, Aura's weekly re-scan, Swoon's
   birthday and anniversary alerts, Pantri's use-it-up nudges.

   HONEST LIMITS — read before relying on this.
   The web cannot reliably wake a closed PWA. What this does:

     • fires anything due the moment the app is next opened
     • fires in-session via timers while the app is open
     • uses the Notification API (through the service worker
       when one is registered) so a fire looks like a real
       notification rather than a toast
     • uses Periodic Background Sync where the browser offers
       it (Chrome/Android, installed apps only)

   What it does NOT do: guarantee a 9am ping on a closed iPhone.
   That needs a push server plus a native wrapper (Capacitor).
   The scheduling model here is written so that swapping in real
   push later means implementing `deliver()` against a server —
   nothing else has to change.
   ============================================================ */

const Remind = (() => {

  /* Byte-identical across apps; per-app values live in app-config.js. */
  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const CFG = {
    app:     APP.id   || 'app',
    appName: APP.name || 'App',
    icon:    APP.icon || 'icons/icon-192.png',
    badge:   APP.icon || 'icons/icon-192.png'
  };

  const LS = 'remind_queue';
  const LS_SEEN = 'remind_last_check';

  function read()      { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } }
  function write(q)    { try { localStorage.setItem(LS, JSON.stringify(q)); } catch (e) {} }
  function now()       { return Date.now(); }
  const DAY = 86400000;

  /* ==========================================================
     Scheduling
     A reminder:
       { id, at, title, body, kind, every, meta, fired }
     `every` (days) makes it recurring — after firing it
     reschedules itself rather than being dropped.
     ========================================================== */
  function schedule(r) {
    if (!r || !r.at) return null;
    const q = read();
    const item = {
      id:    r.id || (r.kind || 'r') + '-' + Math.random().toString(36).slice(2, 9),
      at:    typeof r.at === 'number' ? r.at : Date.parse(r.at),
      title: r.title || CFG.appName,
      body:  r.body || '',
      kind:  r.kind || 'general',
      every: r.every || 0,
      meta:  r.meta || {},
      fired: 0
    };
    const i = q.findIndex(x => x.id === item.id);
    if (i > -1) q[i] = Object.assign(q[i], item); else q.push(item);
    q.sort((a, b) => a.at - b.at);
    write(q);
    armInSession(item);
    return item;
  }

  /* Convenience: schedule N days out at a sensible hour. */
  function inDays(days, r) {
    const d = new Date(now() + days * DAY);
    d.setHours(r && r.hour != null ? r.hour : 10, 0, 0, 0);
    return schedule(Object.assign({}, r, { at: d.getTime() }));
  }

  /* Convenience: next occurrence of a month/day (birthdays). */
  function annual(month, day, r) {
    const d = new Date();
    d.setMonth(month - 1, day); d.setHours((r && r.hour) || 9, 0, 0, 0);
    // Lead time lets you warn N days *before* the date.
    const lead = (r && r.leadDays) || 0;
    let at = d.getTime() - lead * DAY;
    if (at < now()) { d.setFullYear(d.getFullYear() + 1); at = d.getTime() - lead * DAY; }
    return schedule(Object.assign({}, r, { at: at, every: 365 }));
  }

  function cancel(id)      { write(read().filter(r => r.id !== id)); }
  function cancelKind(k)   { write(read().filter(r => r.kind !== k)); }
  function get(id)         { return read().find(r => r.id === id) || null; }
  function list(kind)      { const q = read(); return kind ? q.filter(r => r.kind === kind) : q; }
  function upcoming(n)     { return read().filter(r => r.at > now()).slice(0, n || 20); }
  function due()           { return read().filter(r => r.at <= now()); }

  /* ==========================================================
     Delivery
     ========================================================== */
  function permission() { return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported'; }
  function canNotify()   { return permission() === 'granted'; }

  function requestPermission() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    return Notification.requestPermission().then(p => {
      if (p === 'granted') { registerPeriodicSync(); toast('Reminders on ✦'); }
      return p;
    });
  }

  function deliver(r) {
    const opts = {
      body: r.body,
      icon: CFG.icon,
      badge: CFG.badge,
      tag:  r.id,
      data: { kind: r.kind, meta: r.meta, app: CFG.app },
      requireInteraction: false
    };
    if (canNotify() && navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(r.title, opts))
        .catch(() => fallback(r));
      return;
    }
    if (canNotify()) { try { new Notification(r.title, opts); return; } catch (e) {} }
    fallback(r);
  }

  /* No permission (or iOS Safari) — surface it inside the app instead. */
  function fallback(r) {
    if (window.__toast) window.__toast(r.title + (r.body ? ' — ' + r.body : ''));
    document.dispatchEvent(new CustomEvent('remind:fired', { detail: r }));
  }

  /* ==========================================================
     Firing
     ========================================================== */
  function check() {
    const q = read();
    let changed = false;
    const t = now();
    q.forEach(r => {
      if (r.at <= t) {
        deliver(r);
        document.dispatchEvent(new CustomEvent('remind:fired', { detail: r }));
        if (r.every) { r.at = t + r.every * DAY; r.fired = (r.fired || 0) + 1; }
        else { r._drop = true; }
        changed = true;
      }
    });
    if (changed) write(q.filter(r => !r._drop).sort((a, b) => a.at - b.at));
    try { localStorage.setItem(LS_SEEN, String(t)); } catch (e) {}
    return changed;
  }

  /* While the app stays open, fire on time rather than on next launch. */
  const timers = {};
  function armInSession(r) {
    const delay = r.at - now();
    if (delay <= 0 || delay > 6 * 3600000) return;      // only arm within 6h
    clearTimeout(timers[r.id]);
    timers[r.id] = setTimeout(() => check(), delay + 500);
  }
  function armAll() { read().forEach(armInSession); }

  function registerPeriodicSync() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.ready) return;
    navigator.serviceWorker.ready.then(reg => {
      if (!reg.periodicSync) return;
      reg.periodicSync.register('remind-check', { minInterval: 12 * 3600000 }).catch(() => {});
    }).catch(() => {});
  }

  /* ==========================================================
     UI helpers
     ========================================================== */
  function nudgeHTML(copy) {
    if (canNotify() || permission() === 'unsupported' || permission() === 'denied') return '';
    return `<div class="notif-nudge">
      <span>${esc(copy || 'Want a nudge when it\'s time? Turn on reminders.')}</span>
      <button class="btn btn-accent" id="rem-allow">Turn on</button>
    </div>`;
  }
  function wireNudge(container) {
    if (!container) return;
    const b = container.querySelector('#rem-allow');
    if (b) b.onclick = () => requestPermission().then(() => { if (window.__render) window.__render(); });
  }

  function fmtWhen(ts) {
    const d = new Date(ts);
    const days = Math.round((ts - now()) / DAY);
    let label;
    if (days < 0) label = 'due';
    else if (days === 0) label = 'today';
    else if (days === 1) label = 'tomorrow';
    else if (days < 30) label = 'in ' + days + 'd';
    else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { day: d.getDate(), mon: d.toLocaleDateString(undefined, { month: 'short' }), label: label, days: days };
  }

  function listHTML(kind, emptyCopy) {
    const items = (kind ? list(kind) : list()).slice().sort((a, b) => a.at - b.at);
    if (!items.length) return `<div class="rem-empty">${esc(emptyCopy || 'Nothing scheduled yet.')}</div>`;
    return `<div class="rem-list">` + items.map(r => {
      const w = fmtWhen(r.at);
      return `<div class="rem-item${w.days <= 3 ? ' rem-soon' : ''}">
        <div class="rem-when"><b>${w.day}</b><span>${esc(w.mon)}</span></div>
        <div class="rem-body"><strong>${esc(r.title)}</strong><span>${esc(r.body || '')} · ${esc(w.label)}</span></div>
        <button class="rem-x" data-rem="${esc(r.id)}" aria-label="Remove reminder">×</button>
      </div>`;
    }).join('') + `</div>`;
  }
  function wireList(container, onChange) {
    if (!container) return;
    container.querySelectorAll('[data-rem]').forEach(b => {
      b.onclick = () => { cancel(b.dataset.rem); if (onChange) onChange(); else if (window.__render) window.__render(); };
    });
  }

  function init(cfg) {
    if (cfg) Object.assign(CFG, cfg);
    check();
    armAll();
    if (canNotify()) registerPeriodicSync();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    return list();
  }

  function esc(s) { if (window.__esc) return window.__esc(s); return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(m) { if (window.__toast) return window.__toast(m); }

  return {
    init, schedule, inDays, annual, cancel, cancelKind, get, list, upcoming, due, check,
    permission, canNotify, requestPermission,
    nudgeHTML, wireNudge, listHTML, wireList, fmtWhen, config: () => CFG
  };
})();

if (typeof window !== 'undefined') window.Remind = Remind;

/* Self-booting: fires anything that fell due while the app was closed. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Remind.init());
  else Remind.init();
}
