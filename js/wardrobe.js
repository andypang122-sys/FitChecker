'use strict';
/* ============================================================
   WARDROBE — the digital closet (Pro feature).

   Every clothing item the user photographs is stored ON THIS
   DEVICE in IndexedDB — not localStorage (which caps at ~5 MB and
   would fill after a couple of dozen photos) and not the server
   (keeps the "nothing is uploaded" promise, and costs $0 to run).
   IndexedDB comfortably holds hundreds of compressed photos.

   Every image is resized + re-encoded to WebP (~120–180 KB) before
   it is ever stored, so "unlimited uploads" stays light on disk.

   Public API (all async return Promises unless noted):
     Wardrobe.ready()                     → resolves when the DB is open
     Wardrobe.addItem(owner, item)        → id   (item.img is a source dataURL)
     Wardrobe.listItems(owner)            → [item…] newest first
     Wardrobe.getItem(id)                 → item | null
     Wardrobe.updateItem(id, patch)       → item
     Wardrobe.deleteItem(id)              → void
     Wardrobe.count(owner)                → int
     Wardrobe.estimateBytes(owner)        → int (rough, for the storage meter)

     Wardrobe.compress(dataURL, opts)     → dataURL (WebP, resized)
     Wardrobe.dominantColour(dataURL)     → { hex, name }
     Wardrobe.removeBackground(dataURL)   → dataURL (best-effort, transparent PNG)

     Outfit combos are small (just id lists) so they live in
     localStorage, keyed by owner:
     Wardrobe.listOutfits(owner) / saveOutfit / deleteOutfit
   ============================================================ */

const Wardrobe = (() => {
  const DB_NAME = 'fitcheck_wardrobe';
  const STORE = 'items';
  const DB_VERSION = 1;
  const OUTFITS_KEY = 'fitcheck_outfits';

  let _db = null;
  let _openPromise = null;

  function open() {
    if (_openPromise) return _openPromise;
    _openPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('owner', 'owner', { unique: false });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
    return _openPromise;
  }

  function ready() { return open().then(() => true, () => false); }

  function tx(mode) { return _db.transaction(STORE, mode).objectStore(STORE); }

  function uid() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- CRUD ---------- */

  async function addItem(owner, item) {
    await open();
    const rec = {
      id: uid(),
      owner,
      type: item.type || 'tshirt',
      slot: SLOT_OF[item.type] || 'top',
      name: item.name || '',
      brand: item.brand || '',
      colorHex: item.colorHex || '#888888',
      colorName: item.colorName || '',
      img: item.img,                 // WebP dataURL, already compressed by caller
      price: (item.price != null && !isNaN(item.price)) ? Number(item.price) : null,
      createdAt: Date.now(),
      worn: 0,
      forSale: false,
      unsynced: !!item.unsynced       // true when saved offline, pending cloud push
    };
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').add(rec);
      r.onsuccess = () => resolve(rec.id);
      r.onerror = () => reject(r.error);
    });
  }

  async function listItems(owner) {
    await open();
    return new Promise((resolve, reject) => {
      const out = [];
      const idx = tx('readonly').index('owner');
      const r = idx.openCursor(IDBKeyRange.only(owner));
      r.onsuccess = () => {
        const c = r.result;
        if (c) { out.push(c.value); c.continue(); }
        else { out.sort((a, b) => b.createdAt - a.createdAt); resolve(out); }
      };
      r.onerror = () => reject(r.error);
    });
  }

  async function getItem(id) {
    await open();
    return new Promise((resolve, reject) => {
      const r = tx('readonly').get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }

  async function updateItem(id, patch) {
    const cur = await getItem(id);
    if (!cur) return null;
    const next = Object.assign(cur, patch);
    await open();
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').put(next);
      r.onsuccess = () => resolve(next);
      r.onerror = () => reject(r.error);
    });
  }

  async function deleteItem(id) {
    await open();
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  async function count(owner) { return (await listItems(owner)).length; }

  /* Store a full item record verbatim (used to mirror a server copy
     into the local cache). Marks it synced. */
  async function putRaw(owner, rec) {
    await open();
    const full = Object.assign({
      id: rec.id || uid(), owner, type: 'tshirt', slot: 'top', name: '', brand: '',
      colorHex: '#888888', colorName: '', img: '', price: null, createdAt: Date.now(), worn: 0, forSale: false
    }, rec, { owner, unsynced: false });
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').put(full);
      r.onsuccess = () => resolve(full.id);
      r.onerror = () => reject(r.error);
    });
  }

  function markSynced(id) { return updateItem(id, { unsynced: false }); }

  async function estimateBytes(owner) {
    const items = await listItems(owner);
    // dataURL string length is a good proxy for stored bytes
    return items.reduce((s, i) => s + (i.img ? i.img.length : 0), 0);
  }

  /* ---------- garment type → outfit-board slot ---------- */

  const SLOT_OF = {
    hat: 'head', accessory: 'head', glasses: 'head', bag: 'head',
    tshirt: 'top', shirt: 'top', top: 'top', hoodie: 'top', sweater: 'top',
    jacket: 'outer', coat: 'outer', blazer: 'outer',
    jeans: 'bottom', trousers: 'bottom', shorts: 'bottom', skirt: 'bottom', dress: 'bottom',
    shoes: 'shoes', boots: 'shoes', sneakers: 'shoes'
  };

  /* ---------- image compression ---------- */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = src;
    });
  }

  /* Resize the long edge down to `maxDim` and re-encode. WebP where
     supported (much smaller), JPEG otherwise. Returns a dataURL. */
  async function compress(dataURL, opts) {
    opts = opts || {};
    const maxDim = opts.maxDim || 1024;
    const quality = opts.quality || 0.82;
    const img = await loadImage(dataURL);
    let { width: w, height: h } = img;
    if (Math.max(w, h) > maxDim) {
      const s = maxDim / Math.max(w, h);
      w = Math.round(w * s); h = Math.round(h * s);
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);
    let out = cv.toDataURL('image/webp', quality);
    if (out.indexOf('image/webp') === -1) out = cv.toDataURL('image/jpeg', quality); // Safari fallback
    return out;
  }

  /* ---------- dominant colour ---------- */

  const NAMED = [
    ['Black', 20, 20, 20], ['White', 240, 240, 240], ['Grey', 128, 128, 128],
    ['Navy', 30, 40, 90], ['Blue', 50, 90, 200], ['Sky', 120, 180, 230],
    ['Green', 60, 140, 70], ['Olive', 110, 110, 50], ['Teal', 40, 140, 140],
    ['Red', 200, 50, 50], ['Maroon', 120, 30, 40], ['Pink', 230, 140, 170],
    ['Orange', 230, 130, 50], ['Yellow', 230, 210, 70], ['Beige', 210, 190, 150],
    ['Brown', 120, 80, 50], ['Purple', 130, 70, 160], ['Cream', 240, 235, 215]
  ];

  function nameColour(r, g, b) {
    let best = NAMED[0], bd = Infinity;
    for (const [name, nr, ng, nb] of NAMED) {
      const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
      if (d < bd) { bd = d; best = [name]; }
    }
    return best[0];
  }

  async function dominantColour(dataURL) {
    const img = await loadImage(dataURL);
    const S = 48;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    // average the central region, skipping near-white/near-black edges
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // weight the centre (the garment usually fills the middle)
        const cxd = Math.abs(x - S / 2), cyd = Math.abs(y - S / 2);
        if (cxd > S * 0.42 || cyd > S * 0.42) continue;
        const i = (y * S + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    return { hex, name: nameColour(r, g, b) };
  }

  /* ---------- best-effort background removal ----------
     Flood-fills from the four corners, clearing pixels close in
     colour to the corner sample (a plain surface). Conservative:
     if it would erase almost nothing or almost everything, it
     returns the original — so it never produces garbage. */
  async function removeBackground(dataURL) {
    const img = await loadImage(dataURL);
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const imgd = cx.getImageData(0, 0, W, H);
    const d = imgd.data;
    const seen = new Uint8Array(W * H);
    const stack = [];
    const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
    // average corner colour = the "background"
    let br = 0, bg = 0, bb = 0;
    for (const [x, y] of corners) { const i = (y * W + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; }
    br /= 4; bg /= 4; bb /= 4;
    const TOL = 46 * 46 * 3;
    for (const [x, y] of corners) { const p = y * W + x; if (!seen[p]) { seen[p] = 1; stack.push(p); } }
    let cleared = 0;
    while (stack.length) {
      const p = stack.pop();
      const i = p * 4;
      const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > TOL) continue;
      d[i + 3] = 0; cleared++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0 && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
    }
    const frac = cleared / (W * H);
    if (frac < 0.04 || frac > 0.92) return dataURL; // unreliable — keep original
    cx.putImageData(imgd, 0, 0);
    return cv.toDataURL('image/png'); // PNG to preserve transparency
  }

  /* ---------- outfit combos (localStorage — small) ---------- */

  function _readOutfits() {
    try { return JSON.parse(localStorage.getItem(OUTFITS_KEY)) || {}; } catch (e) { return {}; }
  }
  function _writeOutfits(all) {
    try { localStorage.setItem(OUTFITS_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }
  function listOutfits(owner) { return (_readOutfits()[owner] || []).slice().sort((a, b) => b.createdAt - a.createdAt); }
  function saveOutfit(owner, outfit) {
    const all = _readOutfits();
    const list = all[owner] || [];
    if (outfit.id) {
      const i = list.findIndex(o => o.id === outfit.id);
      if (i >= 0) list[i] = Object.assign(list[i], outfit);
    } else {
      outfit.id = uid(); outfit.createdAt = Date.now();
      list.push(outfit);
    }
    all[owner] = list; _writeOutfits(all);
    return outfit.id;
  }
  function deleteOutfit(owner, id) {
    const all = _readOutfits();
    all[owner] = (all[owner] || []).filter(o => o.id !== id);
    _writeOutfits(all);
  }

  return {
    ready, addItem, listItems, getItem, updateItem, deleteItem, count, estimateBytes,
    putRaw, markSynced,
    compress, dominantColour, removeBackground, SLOT_OF,
    listOutfits, saveOutfit, deleteOutfit
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Wardrobe };
