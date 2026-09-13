'use strict';
/* ============================================================
   WearLog — "what are you wearing today?"

   WHY A DAILY CHECK-IN IN A SIZING APP.

   Someone checks a size a few times a year, when they are about to
   buy. That is not a reason to open an app, and an app nobody opens
   is not there when the purchase comes round.

   Getting dressed happens every day, and the closet already exists
   here. Logging what went on this morning takes two taps, and it
   pays back three ways that nothing else in FitChecker can:

     1. THE SIZE LEDGER GETS REAL EVIDENCE. wardrobe.js ranks a
        brand's sizes by wears, but "wears" was a counter anyone
        could bump twice by tapping twice. A dated log counts each
        garment once per day, so the ledger is built on facts.

     2. FIT FEEDBACK WITHOUT A PURCHASE. "Too tight" on a garment
        you own, with its brand and size on the label, is exactly
        the report fit-feedback.js calibrates on — gathered from the
        clothes someone actually lives in, not only new ones.

     3. THE CLOSET TELLS THE TRUTH. Cost per wear, the pieces that
        have not left the hanger in two months, how much of the
        wardrobe actually rotates. That last one is the honest
        route into the resale screen.

   Storage, per owner, per local calendar date:
     fitcheck_wearlog = { [owner]: { 'YYYY-MM-DD': { items, feel, fit, ts } } }
   ============================================================ */

const WearLog = (() => {
  const KEY = 'fitcheck_wearlog';
  const KEEP_DAYS = 800;
  const NEGLECT_DAYS = 60;
  const DAY = 86400000;

  /* ---------- local calendar dates ---------- */
  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() { return dateStr(new Date()); }
  function parse(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return dateStr(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function weekKey(s) { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateStr(d); }

  const FEELS = [
    { v: 'great', e: '🔥', label: 'Felt great' },
    { v: 'fine',  e: '🙂', label: 'Fine' },
    { v: 'meh',   e: '😕', label: 'Not quite right' }
  ];
  const FIT_ISSUES = [
    { v: 'tight', label: 'Too tight' },
    { v: 'loose', label: 'Too loose' },
    { v: 'short', label: 'Too short' },
    { v: 'long',  label: 'Too long' }
  ];

  /* Wardrobe types onto the fit engine's garment charts. Anything with
     no chart (shoes, hats, bags) is simply never reported as a fit. */
  const TYPE_TO_ENGINE = {
    tshirt: 'tshirt', top: 'tshirt', shirt: 'shirt', hoodie: 'hoodie', sweater: 'hoodie',
    jacket: 'jacket', coat: 'jacket', blazer: 'jacket',
    jeans: 'jeans', trousers: 'jeans', shorts: 'shorts', skirt: 'skirt', dress: 'dress'
  };

  /* ---------- storage ---------- */
  function readAll() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function writeAll(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }

  function log(owner) { return readAll()[owner] || {}; }
  function entry(owner, date) { return log(owner)[date || today()] || null; }

  /* Saves the day and reports which garments are newly worn today and
     which were taken back off the list. The caller adjusts each item's
     wear count by exactly that difference — so saving the same day
     twice can never count a garment twice. */
  function record(owner, data, date) {
    const d = date || today();
    const all = readAll();
    const mine = all[owner] || {};
    const prev = (mine[d] && mine[d].items) || [];
    const items = [...new Set((data.items || []).filter(Boolean))];
    const fit = {};
    Object.keys(data.fit || {}).forEach(id => {
      if (items.indexOf(id) > -1 && FIT_ISSUES.some(f => f.v === data.fit[id])) fit[id] = data.fit[id];
    });
    const prevEntry = mine[d] || null;
    mine[d] = { items, feel: FEELS.some(f => f.v === data.feel) ? data.feel : null, fit, ts: Date.now() };
    const keys = Object.keys(mine).sort();
    while (keys.length > KEEP_DAYS) delete mine[keys.shift()];
    all[owner] = mine;
    writeAll(all);
    return {
      entry: mine[d],
      prev: prevEntry,
      added: items.filter(id => prev.indexOf(id) === -1),
      removed: prev.filter(id => items.indexOf(id) === -1)
    };
  }

  function remove(owner, date) {
    const all = readAll();
    const d = date || today();
    const gone = (all[owner] && all[owner][d] && all[owner][d].items) || [];
    if (all[owner]) { delete all[owner][d]; writeAll(all); }
    return gone;
  }

  /* Forget a deleted garment everywhere it was logged. */
  function forgetItem(owner, itemId) {
    const all = readAll();
    const mine = all[owner];
    if (!mine) return;
    Object.keys(mine).forEach(d => {
      const e = mine[d];
      e.items = (e.items || []).filter(id => id !== itemId);
      if (e.fit) delete e.fit[itemId];
    });
    writeAll(all);
  }

  function wornOn(owner, itemId, date) {
    const e = entry(owner, date);
    return !!(e && (e.items || []).indexOf(itemId) > -1);
  }

  /* ---------- streak ----------
     The rule every app in the family uses: consecutive days, one rest
     day a week forgiven but never two in a row, a rest day only spent
     if a logged day sits behind it, and an unlogged today is not a miss. */
  function streak(entries, day) {
    const has = d => !!(entries && entries[d] && (entries[d].items || []).length);
    const t = day || today();
    let d = has(t) ? t : addDays(t, -1);
    let count = 0, pending = null;
    const spent = new Set();
    for (let i = 0; i < 1500; i++) {
      if (has(d)) { if (pending) { spent.add(pending); pending = null; } count++; }
      else {
        const wk = weekKey(d);
        if (pending || spent.has(wk)) break;
        pending = wk;
      }
      d = addDays(d, -1);
    }
    return { count, restUsedThisWeek: spent.has(weekKey(t)) };
  }

  function lastWornMap(entries) {
    const m = {};
    Object.keys(entries || {}).sort().forEach(d => (entries[d].items || []).forEach(id => { m[id] = d; }));
    return m;
  }

  /* ---------- what the closet is really doing ---------- */
  function stats(items, entries, day) {
    const t = day || today();
    const last = lastWornMap(entries);
    const start30 = addDays(t, -29);
    const ids = new Set((items || []).map(i => i.id));
    const worn30 = new Set();
    let daysLogged30 = 0;
    Object.keys(entries || {}).forEach(d => {
      if (d < start30 || d > t) return;
      const list = entries[d].items || [];
      if (list.length) daysLogged30++;
      list.forEach(id => { if (ids.has(id)) worn30.add(id); });
    });

    /* Neglected: last logged wear is 60+ days old, or — for pieces the
       log has never seen — never worn at all and owned for a month.
       A garment with wears from before the log existed is unknown, not
       neglected, and is left alone. */
    const neglected = (items || []).filter(it => {
      if (last[it.id]) return daysBetween(last[it.id], t) >= NEGLECT_DAYS;
      const owned = it.createdAt ? Math.floor((parse(t).getTime() - it.createdAt) / DAY) : 0;
      return !(Number(it.worn) > 0) && owned >= 30;
    });

    const cpw = (items || [])
      .filter(it => it.price != null && isFinite(it.price) && Number(it.worn) > 0)
      .map(it => ({ item: it, cpw: it.price / Number(it.worn) }))
      .sort((a, b) => a.cpw - b.cpw);

    const total = (items || []).length;
    return {
      total, rotation: worn30.size,
      rotationPct: total ? Math.round((worn30.size / total) * 100) : 0,
      daysLogged30, neglected, cpw, lastWorn: last
    };
  }

  /* The line worth reading today, most useful first. */
  function insights(items, entries, day, fmtMoney) {
    const money = fmtMoney || (n => n.toFixed(2));
    const s = stats(items, entries, day);
    const out = [];
    if (s.neglected.length >= 3) {
      out.push({ e: '🧺', link: 'resale',
        text: `${s.neglected.length} pieces haven't been worn in ${NEGLECT_DAYS}+ days. Wear them this week or sell them — the closet gets lighter either way.` });
    }
    if (s.total >= 8 && s.daysLogged30 >= 7 && s.rotationPct < 40) {
      out.push({ e: '🔁', text: `You've worn ${s.rotation} of your ${s.total} pieces in the last 30 days. Most closets run on about a third of what's in them.` });
    }
    const best = s.cpw[0];
    if (best && Number(best.item.worn) >= 5) {
      out.push({ e: '💸', text: `Best value in your closet: ${best.item.name || 'a favourite'}, down to ${money(best.cpw)} a wear.` });
    }
    return out;
  }

  /* ---------- fit feedback from real wear ----------
     Only tight/loose map onto fit-feedback's outcomes; length issues
     are kept in the log but not sent, because the calibration adjusts
     girth ease and has nothing to say about sleeve length. Needs a
     size on the label, or the report says nothing. */
  function fitReports(entryObj, items) {
    const out = [];
    if (!entryObj || !entryObj.fit) return out;
    Object.keys(entryObj.fit).forEach(id => {
      const it = (items || []).find(x => x.id === id);
      if (!it) return;
      const issue = entryObj.fit[id];
      const outcome = issue === 'tight' ? 'too-tight' : issue === 'loose' ? 'too-loose' : null;
      const garmentType = TYPE_TO_ENGINE[it.type];
      if (!outcome || !garmentType || !String(it.size || '').trim()) return;
      out.push({ itemId: id, garmentType, size: String(it.size).trim(), brand: it.brand || null, outcome });
    });
    return out;
  }

  /* Reports that are new since the day was last saved — re-saving the
     same morning must not file the same complaint twice. */
  function newFitReports(prevEntry, nextEntry, items) {
    const before = {};
    fitReports(prevEntry, items).forEach(r => { before[r.itemId] = r.outcome; });
    return fitReports(nextEntry, items).filter(r => before[r.itemId] !== r.outcome);
  }

  return {
    KEY, FEELS, FIT_ISSUES, TYPE_TO_ENGINE, NEGLECT_DAYS,
    log, entry, record, remove, forgetItem, wornOn,
    streak, lastWornMap, stats, insights, fitReports, newFitReports,
    dateStr, today, addDays, daysBetween, weekKey
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WearLog;
if (typeof window !== 'undefined') window.WearLog = WearLog;
