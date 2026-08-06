'use strict';
/* ============================================================
   Ads — the advertising layer, shared byte-identical across every app.

   WHY THIS REPLACES THE OLD ONE-BANNER APPROACH

   Before this, every app had a single format: one responsive AdSense
   display unit, dropped at the very bottom of a screen, below the last
   card. That is the worst square inch on the page — most people never
   scroll to it, and an ad nobody sees earns nothing at all.

   Three things changed here.

   1. PLACEMENT IS A TYPE, NOT AN AFTERTHOUGHT. A slot now declares what
      kind of placement it is (inline / in-article / anchor / video /
      interstitial), and each type renders, loads and behaves
      differently. In-feed units sit *between* content where the eye
      already is; the anchor sticks above the nav where viewability is
      near total.

   2. THERE IS A FILL CHAIN, SO A SLOT IS NEVER WASTED.
        AdSense (if connected) → your own house/affiliate creative → a Pro upsell
      This matters more than it sounds. At low traffic, display CPMs pay
      pennies, while one affiliate click can pay dollars. Filling unsold
      inventory with your own product creatives means every slot earns
      from day one, before any network has approved anything.

   3. IMAGE *AND* VIDEO ARE FIRST-CLASS. House creatives can be a still
      or an MP4/WebM. Video autoplays muted and paused off-screen, which
      is both the polite thing and the thing that keeps battery and data
      use honest.

   AN HONEST NOTE ABOUT "VIDEO ADS", because it shapes what you can
   actually sell: Google AdSense has no standalone video ad unit for an
   ordinary website. Real video ad demand for the web comes through
   Google Ad Manager with a VAST tag (which wants meaningful traffic
   before approval), a third-party outstream network, or — the best
   payer by far — AdMob rewarded video, which needs the app wrapped
   natively with Capacitor. This module is built so all three drop in:
   point `vastTag` at a VAST URL, or `houseAds` at your own video files,
   and the same slots serve them. Until then your own creatives fill
   the space, which is the version that earns money this week.

   Everything degrades quietly. No network, no config, offline, ad
   blocker — the slot collapses or shows the upsell. It never leaves a
   hole in the layout and never blocks a render.
   ============================================================ */

const Ads = (() => {

  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const M   = APP.money || {};

  const CFG = {
    app:      APP.id || 'app',
    client:   APP.adClient || M.adClient || '',
    /* Slot id map. Unknown names fall back to the generic unit rather
       than silently disabling the slot — the old behaviour was that a
       slot name missing from this map could never serve a real ad, even
       after AdSense was connected, and nothing said so. */
    units:    M.adSlots || {},
    vastTag:  M.vastTag || '',
    house:    APP.houseAds || M.houseAds || [],
    proName:  M.proName || (APP.name ? APP.name + ' Pro' : 'Pro'),
    /* Anchor and interstitial are the intrusive ones, so they are capped
       rather than shown every time. */
    anchorEveryMin:  M.anchorEveryMin  != null ? M.anchorEveryMin  : 4,
    interstitialMin: M.interstitialMin != null ? M.interstitialMin : 20
  };

  const KEY = CFG.app + '_ads';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPro = () => { try { return !!(window.Money && Money.isPro && Money.isPro()); } catch (e) { return false; } };

  /* ---- local bookkeeping: caps, rotation, and a count of what was
     actually seen. Impressions are stored on the device only; there is
     no backend, and pretending otherwise would be a lie. ---- */
  function state() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function bump(field, id) {
    const s = state();
    s[field] = s[field] || {};
    s[field][id] = (s[field][id] || 0) + 1;
    s.last = s.last || {};
    save(s);
  }
  function stamp(kind) { const s = state(); s.last = s.last || {}; s.last[kind] = Date.now(); save(s); }
  function minsSince(kind) {
    const s = state();
    const t = s.last && s.last[kind];
    return t ? (Date.now() - t) / 60000 : Infinity;
  }
  function stats() {
    const s = state();
    return { impressions: s.imp || {}, clicks: s.click || {} };
  }

  /* ==========================================================
     House / affiliate creatives

     A creative is:
       { id, type:'image'|'video', src, poster, title, sub, cta, url,
         slots:['home','result'], label:'Sponsored'|'Partner', weight }

     `slots` scopes a creative to where it makes sense — a dog food ad
     belongs beside a feeding plan, not on the settings screen. Least
     recently shown wins, so a small set still feels rotated.
     ========================================================== */
  function pickHouse(slot) {
    const pool = (CFG.house || []).filter(a =>
      a && a.url && (!a.slots || !a.slots.length || a.slots.indexOf(slot) > -1));
    if (!pool.length) return null;
    const seen = state().imp || {};
    let best = null, bestScore = Infinity;
    pool.forEach(a => {
      /* Weight divides the seen count, so a weight-3 creative is shown
         roughly three times as often as a weight-1 one. */
      const score = (seen[a.id] || 0) / (a.weight || 1);
      if (score < bestScore) { bestScore = score; best = a; }
    });
    return best;
  }

  function houseHTML(a, kind) {
    const media = a.type === 'video'
      /* No autoplay attribute: it is added only once the slot is on
         screen, so a page with three video slots doesn't decode three
         videos at once on a phone. */
      ? `<video class="ad-media" muted playsinline loop preload="none"
            ${a.poster ? `poster="${esc(a.poster)}"` : ''} data-src="${esc(a.src)}"></video>
         <span class="ad-play" aria-hidden="true">▶</span>`
      : `<img class="ad-media" alt="" loading="lazy" src="${esc(a.src)}">`;

    return `<a class="ad-house ad-${esc(kind)}" href="${esc(a.url)}" target="_blank" rel="sponsored noopener"
              data-ad-id="${esc(a.id)}">
      <span class="ad-tag">${esc(a.label || 'Sponsored')}</span>
      <div class="ad-media-wrap">${media}</div>
      <div class="ad-copy">
        <strong>${esc(a.title || '')}</strong>
        ${a.sub ? `<span>${esc(a.sub)}</span>` : ''}
        ${a.cta ? `<span class="ad-cta">${esc(a.cta)} →</span>` : ''}
      </div>
    </a>`;
  }

  /* ==========================================================
     AdSense markup, per placement type

     The format matters: an in-feed unit rendered as a plain rectangle
     looks like a banner and gets banner CTR. `data-ad-format` and the
     layout key are what make it sit in the content properly.
     ========================================================== */
  function senseHTML(slot, kind) {
    const unit = CFG.units[slot] || CFG.units.content || CFG.units.home || '';
    if (!CFG.client || !unit) return '';
    const common = `data-ad-client="${esc(CFG.client)}" data-ad-slot="${esc(unit)}"`;
    if (kind === 'inarticle') {
      return `<ins class="adsbygoogle" style="display:block; text-align:center;"
        data-ad-layout="in-article" data-ad-format="fluid" ${common}></ins>`;
    }
    if (kind === 'inline') {
      return `<ins class="adsbygoogle" style="display:block"
        data-ad-format="fluid" data-ad-layout-key="-6t+ed+2i-1n-4w" ${common}></ins>`;
    }
    return `<ins class="adsbygoogle" style="display:block"
      data-ad-format="auto" data-full-width-responsive="true" ${common}></ins>`;
  }

  /* ==========================================================
     slot() — the one function screens call.

       Ads.slot('result')                     → in-feed, in content
       Ads.slot('result', { kind: 'video' })  → video-first placement
       Ads.slot('article', { kind: 'inarticle' })

     Returns '' for Pro users, so call sites need no isPro check.
     ========================================================== */
  function slot(name, opts) {
    if (isPro()) return '';
    opts = opts || {};
    const kind = opts.kind || 'inline';
    const id = 'ad-' + Math.random().toString(36).slice(2, 9);

    /* Nothing is filled at render time. The markup is a shell; wire()
       fills it when it actually approaches the viewport. An ad that
       loads 3000px below the fold burns the impression without ever
       being seen, which suppresses the whole account's rates. */
    return `<div class="ad-wrap ad-k-${esc(kind)}" id="${id}"
              data-ad-slot-name="${esc(name)}" data-ad-kind="${esc(kind)}"
              role="complementary" aria-label="Advertisement"></div>`;
  }

  /* Back-compat: the old call sites say Money.bannerHTML(slot). Money
     delegates here so no screen had to be rewritten to gain lazy
     loading and the house-ad fill chain. */
  function bannerHTML(name) { return slot(name, { kind: 'inline' }); }

  /* ==========================================================
     wire() — fill, observe, and play
     ========================================================== */
  const filled = new WeakSet();

  function wire(container) {
    if (isPro() || !container) return;
    const slots = container.querySelectorAll('.ad-wrap:not([data-ad-filled])');
    if (!slots.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      slots.forEach(fill);                                  // no observer: fill now
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        fill(en.target);
        obs.unobserve(en.target);
      });
    }, { rootMargin: '250px 0px' });                        // fill just before it's seen
    slots.forEach(el => io.observe(el));

    /* Failsafe. If the observer never fires — and it demonstrably can
       not fire in some environments — every slot on the screen stays a
       dead 1px div and the page earns nothing, silently. Anything still
       unfilled and actually on screen after this gets filled directly.
       Off-screen slots are left alone so the lazy behaviour survives. */
    setTimeout(() => {
      slots.forEach(el => {
        if (el.getAttribute('data-ad-filled')) return;
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight + 250 && r.bottom > -250) { try { io.unobserve(el); } catch (e) {} fill(el); }
      });
    }, 1500);
  }

  function fill(el) {
    if (!el || filled.has(el) || el.getAttribute('data-ad-filled')) return;
    filled.add(el);
    el.setAttribute('data-ad-filled', '1');

    const name = el.getAttribute('data-ad-slot-name') || 'content';
    const kind = el.getAttribute('data-ad-kind') || 'inline';

    /* Fill chain, in order of what pays. */
    const sense = senseHTML(name, kind);
    if (sense) {
      el.innerHTML = `<span class="ad-tag">Ad</span>${sense}`;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      /* If the network doesn't fill (no demand, or an ad blocker), the
         <ins> collapses to zero height and leaves a labelled empty box.
         Fall back to a house creative so the space still works. */
      setTimeout(() => {
        const ins = el.querySelector('ins.adsbygoogle');
        if (ins && ins.offsetHeight < 10) houseOrUpsell(el, name, kind);
      }, 2200);
      return;
    }
    houseOrUpsell(el, name, kind);
  }

  function houseOrUpsell(el, name, kind) {
    const a = pickHouse(name);
    if (a) {
      el.innerHTML = houseHTML(a, kind);
      bump('imp', a.id);
      const link = el.querySelector('.ad-house');
      if (link) link.addEventListener('click', () => bump('click', a.id));
      startVideo(el);
      return;
    }
    el.innerHTML = `<div class="ad-ph" data-upsell="1">
      <span class="ad-tag">Ad</span>
      <div class="ad-ph-inner">
        <span>Your ad here</span>
        <span class="ad-ph-sub">${esc(CFG.proName)} removes ads</span>
      </div></div>`;
    const ph = el.querySelector('[data-upsell]');
    if (ph) ph.onclick = () => { try { Money.showPaywall({ reason: 'Remove ads' }); } catch (e) {} };
  }

  /* Video creatives play only while visible. Autoplaying video that
     scrolls out of view and keeps decoding is the single rudest thing
     an ad can do on a phone. */
  function startVideo(el) {
    const v = el.querySelector('video.ad-media');
    if (!v) return;
    if (reduce()) return;                                   // poster only
    if (!v.src && v.dataset.src) v.src = v.dataset.src;

    if (typeof IntersectionObserver === 'undefined') { v.play().catch(() => {}); return; }
    let observed = false;
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        observed = true;
        if (en.isIntersecting) v.play().catch(() => {});
        else v.pause();
      });
    }, { threshold: 0.4 });
    io.observe(v);
    /* Same failsafe as the slot fill: a video that is on screen but was
       never reported as intersecting should still play rather than sit
       frozen on its poster. */
    setTimeout(() => {
      if (observed) return;
      const r = v.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) v.play().catch(() => {});
    }, 1200);
    document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); });
  }

  /* ==========================================================
     Anchor — sticky unit above the bottom nav

     The highest-viewability placement there is, and the easiest to
     make hateful. Rules: dismissible, capped by time, never over the
     nav, and never on top of a paywall or a camera view.
     ========================================================== */
  function anchor(opts) {
    if (isPro()) return;
    opts = opts || {};
    if (!opts.force && minsSince('anchor') < CFG.anchorEveryMin) return;
    if (document.querySelector('.ad-anchor')) return;

    const a = pickHouse('anchor') || pickHouse('content');
    const sense = senseHTML('anchor', 'anchor');
    if (!sense && !a) return;                               // nothing to show: show nothing

    const bar = document.createElement('div');
    bar.className = 'ad-anchor';
    bar.innerHTML = `
      <button class="ad-anchor-x" aria-label="Close ad">✕</button>
      <div class="ad-anchor-body"></div>`;
    (document.getElementById('modal-root') || document.body).appendChild(bar);

    const body = bar.querySelector('.ad-anchor-body');
    if (sense) {
      body.innerHTML = `<span class="ad-tag">Ad</span>${sense}`;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    } else {
      body.innerHTML = houseHTML(a, 'anchor');
      bump('imp', a.id);
      const link = body.querySelector('.ad-house');
      if (link) link.addEventListener('click', () => bump('click', a.id));
      startVideo(body);
    }
    requestAnimationFrame(() => bar.classList.add('in'));
    stamp('anchor');
    bar.querySelector('.ad-anchor-x').onclick = () => {
      bar.classList.remove('in');
      setTimeout(() => bar.remove(), 260);
    };
  }

  function closeAnchor() {
    const b = document.querySelector('.ad-anchor');
    if (b) { b.classList.remove('in'); setTimeout(() => b.remove(), 260); }
  }

  /* ==========================================================
     Interstitial — full screen, between steps

     Only ever shown *after* a result the user asked for, never before
     it. Making somebody watch an ad to reach the thing they came for
     is how an app gets deleted. Skippable after 3 seconds, hard-capped.
     ========================================================== */
  function interstitial(done) {
    const finish = () => { try { done && done(); } catch (e) {} };
    if (isPro()) { finish(); return; }
    if (minsSince('interstitial') < CFG.interstitialMin) { finish(); return; }

    const a = pickHouse('interstitial') || pickHouse('content');
    if (!a && !CFG.client) { finish(); return; }
    stamp('interstitial');

    const ov = document.createElement('div');
    ov.className = 'ad-full';
    ov.innerHTML = `
      <div class="ad-full-inner">
        <button class="ad-full-x" id="adf-x" disabled>Skip in 3</button>
        <div class="ad-full-body"></div>
      </div>`;
    (document.getElementById('modal-root') || document.body).appendChild(ov);

    const body = ov.querySelector('.ad-full-body');
    if (a) {
      body.innerHTML = houseHTML(a, 'full');
      bump('imp', a.id);
      const link = body.querySelector('.ad-house');
      if (link) link.addEventListener('click', () => bump('click', a.id));
      startVideo(body);
    } else {
      body.innerHTML = `<span class="ad-tag">Ad</span>${senseHTML('interstitial', 'auto')}`;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }
    requestAnimationFrame(() => ov.classList.add('in'));

    const x = ov.querySelector('#adf-x');
    let left = 3;
    const t = setInterval(() => {
      left--;
      x.textContent = left > 0 ? 'Skip in ' + left : 'Skip ✕';
      if (left <= 0) {
        clearInterval(t);
        x.disabled = false;
        x.onclick = () => { ov.classList.remove('in'); setTimeout(() => { ov.remove(); finish(); }, 220); };
      }
    }, 1000);
  }

  /* ==========================================================
     Rewarded video

     The one ad format people genuinely opt into, and the best payer
     per impression by a wide margin. Real inventory needs AdMob (a
     native wrapper) or a VAST tag; with neither, a house video is
     still a real, honest reward-for-attention exchange, and the
     simulated countdown remains as the last resort so the reward
     path never breaks in development.
     ========================================================== */
  function rewarded(done) {
    if (isPro()) { done && done(); return; }
    const a = (CFG.house || []).filter(h => h.type === 'video' && h.rewarded)[0] || pickHouse('rewarded');
    const ov = document.createElement('div');
    ov.className = 'rewarded-scrim';
    const secs = (a && a.type === 'video') ? 15 : 5;
    ov.innerHTML = `
      <div class="rewarded">
        <div class="rw-badge">Ad</div>
        <div class="rw-body" id="rw-body">
          <div class="rw-spin"></div>
          <div class="rw-title">Your reward is loading…</div>
          <div class="rw-count" id="rw-count">${secs}s</div>
          <div class="rw-hint">${a ? '' : 'A rewarded video plays here once AdMob or a VAST tag is connected.'}</div>
        </div>
        <button class="rw-skip" id="rw-skip" disabled>Skip</button>
      </div>`;
    (document.getElementById('modal-root') || document.body).appendChild(ov);

    if (a && a.type === 'video') {
      ov.querySelector('#rw-body').innerHTML =
        `<div class="rw-video">${houseHTML(a, 'rewarded')}</div>
         <div class="rw-count" id="rw-count">${secs}s</div>`;
      bump('imp', a.id);
      startVideo(ov);
    }

    let left = secs;
    const countEl = ov.querySelector('#rw-count');
    const skip = ov.querySelector('#rw-skip');
    const finish = () => {
      ov.classList.add('leaving');
      setTimeout(() => ov.remove(), 200);
      try { Money.toast ? Money.toast('+1 unlocked — enjoy ✦') : 0; } catch (e) {}
      done && done();
    };
    const t = setInterval(() => {
      left--;
      if (countEl) countEl.textContent = left + 's';
      if (left <= 0) {
        clearInterval(t);
        skip.disabled = false;
        skip.textContent = 'Claim reward ✦';
        skip.classList.add('ready');
        skip.onclick = finish;
      }
    }, 1000);
  }

  /* ==========================================================
     Self-wiring

     wire() used to have to be called by hand after every render. That
     was survivable when a slot rendered its content immediately — a
     missed call only cost the upsell's click handler. With lazy
     loading it is not: a slot nobody wires never fills, and the screen
     silently earns nothing. One app had three ad slots and no wire()
     call at all, which is exactly the kind of thing that is invisible
     until you go looking.

     So the module watches for its own slots being added and wires them
     itself. Explicit wire() calls still work and are now belt-and-braces.
     ========================================================== */
  function boot() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    let queued = false;
    const sweep = () => {
      queued = false;
      wire(document.body);
    };
    new MutationObserver(muts => {
      if (queued) return;
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('ad-wrap') ||
              (n.querySelector && n.querySelector('.ad-wrap:not([data-ad-filled])'))) {
            queued = true;
            /* Coalesce: a render adds many nodes at once and should
               cause one sweep, not one per node. */
            setTimeout(sweep, 60);
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    sweep();                                                // catch anything already rendered
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return {
    slot, bannerHTML, wire, fill,
    anchor, closeAnchor, interstitial, rewarded,
    pickHouse, stats, CFG
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Ads;
if (typeof window !== 'undefined') window.Ads = Ads;
