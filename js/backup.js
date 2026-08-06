'use strict';
/* ============================================================
   Backup — export and restore everything.

   These apps store everything in localStorage, which is the right
   call for privacy: nothing leaves the device, no account required,
   no server to breach. It has one serious consequence that is easy
   to overlook until it happens to somebody.

   Clearing browser data deletes all of it. Every weigh-in, every
   logged dose, every progress photo, every scan. Browsers also evict
   localStorage on their own under storage pressure, and iOS clears
   it for sites unvisited for seven days unless the app has been
   added to the home screen.

   For an app whose entire value compounds over months, that is not a
   minor edge case — it is the moment a user stops trusting the app
   and never comes back. A three-month weight chart is worth
   something; being told it is gone is worth nothing.

   So: a single file, saved wherever the user keeps files, that
   restores everything. It is deliberately plain JSON rather than
   anything clever, so it stays readable and portable — someone can
   open it and see it really is just their data.

   Photos live in IndexedDB rather than localStorage (they are far
   too large for a ~5 MB quota), so they are pulled in separately and
   only when asked for, since including them can turn a 40 KB file
   into a 40 MB one.
   ============================================================ */

const Backup = (() => {

  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const APP_ID = APP.id || 'app';
  const APP_NAME = APP.name || 'App';
  const FORMAT = 1;

  /* Only this app's own keys travel. Sharing an origin with another
     app's data and exporting the lot would be both confusing and a
     small privacy leak. */
  function keys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(APP_ID + '_') === 0) out.push(k);
      }
    } catch (e) {}
    return out.sort();
  }

  function collect() {
    const data = {};
    keys().forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        /* Store parsed JSON where possible so the file is readable,
           but keep raw strings intact rather than losing them. */
        try { data[k] = JSON.parse(raw); } catch (e) { data[k] = raw; }
      } catch (e) {}
    });
    return data;
  }

  function envelope(data, extra) {
    return Object.assign({
      format: FORMAT,
      app: APP_ID,
      appName: APP_NAME,
      exported: new Date().toISOString(),
      /* Human-readable note first, because the first thing anyone does
         with a mystery .json file is open it. */
      _readme: 'This is your ' + APP_NAME + ' backup. Keep it somewhere safe. ' +
               'To restore, open ' + APP_NAME + ' and use Settings -> Restore from a file.',
      data: data
    }, extra || {});
  }

  /* ---------- export ---------- */
  function toJSON(opts) {
    opts = opts || {};
    return JSON.stringify(envelope(collect(), opts.extra), null, 2);
  }

  function download(opts) {
    opts = opts || {};
    const json = opts.json || toJSON(opts);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = APP_ID + '-backup-' + stamp + '.json';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    /* Revoking immediately can cancel the download in some browsers. */
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    return name;
  }

  /* Photos are opt-in because size differs by orders of magnitude. */
  function downloadWithPhotos(Photos) {
    if (!Photos || !Photos.all) return Promise.resolve(download());
    return Photos.all().then(list => {
      const json = JSON.stringify(envelope(collect(), { photos: list }), null, 2);
      return download({ json });
    });
  }

  function estimateBytes() {
    let n = 0;
    keys().forEach(k => { try { n += (localStorage.getItem(k) || '').length; } catch (e) {} });
    return n;
  }
  function estimateLabel() {
    const b = estimateBytes();
    if (b < 1024) return b + ' bytes';
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ---------- import ----------
     Validation is strict on purpose. Importing the wrong file, or a
     corrupted one, would overwrite real data with rubbish — so it
     refuses anything it does not recognise rather than doing its best. */
  function validate(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, why: 'That file is not a backup — it could not be read as JSON.' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, why: 'That file has no backup data in it.' };
    if (obj.app && obj.app !== APP_ID) {
      return { ok: false, why: 'That is a ' + (obj.appName || obj.app) + ' backup, not a ' + APP_NAME + ' one. Open it in ' + (obj.appName || obj.app) + ' instead.' };
    }
    if (obj.format && obj.format > FORMAT) {
      return { ok: false, why: 'That backup was made by a newer version of ' + APP_NAME + '. Update the app first.' };
    }
    const n = Object.keys(obj.data).length;
    if (!n) return { ok: false, why: 'That backup is empty.' };
    return {
      ok: true, keys: n,
      when: obj.exported ? new Date(obj.exported) : null,
      photos: Array.isArray(obj.photos) ? obj.photos.length : 0
    };
  }

  function parse(text) {
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, why: 'That file is not valid JSON.' }; }
    const v = validate(obj);
    return v.ok ? Object.assign({ obj }, v) : v;
  }

  /* Restoring REPLACES this app's data. The alternative — merging —
     sounds kinder but silently produces duplicated weigh-ins and
     doubled dose logs, which is worse than an honest replacement the
     user was warned about. */
  function restore(obj, opts) {
    opts = opts || {};
    const v = validate(obj);
    if (!v.ok) return v;

    if (opts.clearFirst !== false) {
      keys().forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    }
    let written = 0;
    Object.keys(obj.data).forEach(k => {
      if (k.indexOf(APP_ID + '_') !== 0) return;         // never write another app's keys
      try {
        const val = obj.data[k];
        localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
        written++;
      } catch (e) {}
    });

    return { ok: true, written, photos: v.photos };
  }

  function restorePhotos(obj, Photos) {
    if (!obj || !Array.isArray(obj.photos) || !Photos || !Photos.put) return Promise.resolve(0);
    return obj.photos.reduce(
      (p, rec) => p.then(n => Photos.put(rec).then(() => n + 1).catch(() => n)),
      Promise.resolve(0)
    );
  }

  /* ---------- reading a file the user picked ---------- */
  function pick() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) { reject(new Error('No file chosen')); return; }
        const r = new FileReader();
        r.onload = () => resolve({ text: String(r.result), name: f.name });
        r.onerror = () => reject(new Error('Could not read that file'));
        r.readAsText(f);
      };
      input.click();
    });
  }

  /* ---------- nudging ----------
     A backup nobody has ever made is not a backup. This is used to
     surface a gentle prompt once there is enough data to be worth
     losing, and then only occasionally. */
  const LAST_KEY = APP_ID + '_lastbackup';
  function markDone() { try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) {} }
  function lastDone() {
    try { const v = localStorage.getItem(LAST_KEY); return v ? Number(v) : 0; } catch (e) { return 0; }
  }
  function shouldNudge(opts) {
    opts = opts || {};
    const minBytes = opts.minBytes || 2000;
    const everyDays = opts.everyDays || 45;
    if (estimateBytes() < minBytes) return false;        // nothing worth backing up yet
    const last = lastDone();
    if (!last) return true;
    return (Date.now() - last) / 86400000 >= everyDays;
  }

  return {
    FORMAT, keys, collect, toJSON, download, downloadWithPhotos,
    estimateBytes, estimateLabel,
    validate, parse, restore, restorePhotos, pick,
    markDone, lastDone, shouldNudge
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Backup;
if (typeof window !== 'undefined') window.Backup = Backup;
