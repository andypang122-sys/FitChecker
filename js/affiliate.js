'use strict';
/* ============================================================
   Affiliate — one place to switch monetisation on.

   THE PROBLEM THIS SOLVES

   Every product across these apps carries its own blank `aff` field.
   That means turning monetisation on required editing roughly fifty
   fields per app, by hand, across seven apps — and re-editing all of
   them whenever a tag changed. In practice that means it never gets
   done, which is why every link currently earns nothing.

   So the tag moves out of the products and into one config block.
   Point every outbound link through `Affiliate.link(url)` and the
   right tag is applied automatically, based on the merchant's own
   domain. Filling in the ids in app-config.js monetises every link
   in the app at once.

   HOW EACH NETWORK ACTUALLY WORKS, because they are all different.
   Formats below are the networks' own documented deep links.

   • Amazon Associates — a `tag` query parameter on the normal URL.

   • Awin — ASOS, Uniqlo, Nike, adidas and Zalando in most of Europe.
       https://www.awin1.com/cread.php?awinmid={merchant}&awinaffid={you}&clickref={sub}&ued={url}

   • Adtraction — the biggest Nordic network (Junkyard, Stayhard…).
       https://track.adtraction.com/t/t?a={ad id}&as={your channel}&t=2&tk=1&epi={sub}&url={url}

   • Tradedoubler — Boozt's Nordic programme, among others.
       https://clk.tradedoubler.com/click?p={programme}&a={your site}&epi={sub}&url={url}

   • Impact — Levi's, Carhartt. Every brand has its own tracking
     domain, so the merchant entry holds the whole tracking link and
     the destination is appended:
       {tracking link}?subId1={sub}&u={url}

   • ShareASale / Rakuten — kept for the US programmes.

   • Any other network — `template`: a tracking link containing
     {url} (encoded), {rawurl} (not encoded) and optionally {ref}.

   • Sovrn Commerce (formerly VigLink) — one id covers thousands of
     merchants without applying to each. The catch-all for anything
     not matched, and the realistic first step with no traffic yet.

   A MERCHANT IS ONLY USED WHEN IT IS SWITCHED ON. Networks send a
   click for a programme you have not been accepted into nowhere
   useful — sometimes to an error page. So every merchant entry has
   `on`, and until it is true that shop's links fall through to Sovrn
   (if configured) or stay exactly as they were.

   SAFETY RULE: if nothing applies, the ORIGINAL URL is returned
   untouched. A missing tag must never produce a broken link — a link
   that 404s costs a customer, and earns nothing anyway.
   ============================================================ */

const Affiliate = (() => {

  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  let CFG = APP.affiliate || {};

  /* Tests (and any app that loads config late) can hand config in. */
  function configure(cfg) { CFG = cfg || {}; }

  const AMAZON = /(^|\.)amazon\.(com|co\.uk|de|fr|it|es|ca|com\.au|co\.jp|se|nl|pl)$/i;

  /* Hosts that are already tracking links — never wrap them again,
     double wrapping breaks attribution and sometimes the link. */
  const TRACKING = /(^|\.)(awin1\.com|shareasale\.com|linksynergy\.com|viglink\.com|adtraction\.com|tradedoubler\.com|pxf\.io|sjv\.io|prf\.hn|anrdoezrs\.net|jdoqocy\.com|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com)$/i;

  const enc = encodeURIComponent;

  function hostOf(url) {
    try {
      /* The URL constructor needs an absolute URL; anything relative or
         malformed is not ours to rewrite, so it is left alone. */
      return new URL(url).hostname.replace(/^www\d*\./, '').toLowerCase();
    } catch (e) { return ''; }
  }

  function addParam(url, key, val) {
    if (!val) return url;
    try {
      const u = new URL(url);
      u.searchParams.set(key, val);
      return u.toString();
    } catch (e) {
      if (!/^https?:\/\//i.test(url)) return url;
      return url + (url.indexOf('?') > -1 ? '&' : '?') + key + '=' + enc(val);
    }
  }

  /* The merchant entry for a host: exact first, then the longest
     parent domain, so eu.gymshark.com finds 'gymshark.com' and
     shop.mango.com finds 'mango.com'. */
  function merchantFor(host) {
    const all = CFG.merchants || {};
    if (all[host]) return Object.assign({ key: host }, all[host]);
    let best = null;
    Object.keys(all).forEach(k => {
      if (host.endsWith('.' + k) && (!best || k.length > best.length)) best = k;
    });
    return best ? Object.assign({ key: best }, all[best]) : null;
  }

  /* ---- network builders: each returns a URL, or null when it lacks
     what it needs (so the next option gets its turn) ---- */
  const NETWORKS = {
    awin(url, m, ref) {
      if (!CFG.awinAffId || !m.mid) return null;
      return 'https://www.awin1.com/cread.php?awinmid=' + enc(m.mid) +
             '&awinaffid=' + enc(CFG.awinAffId) +
             (ref ? '&clickref=' + enc(ref) : '') +
             '&ued=' + enc(url);
    },
    adtraction(url, m, ref) {
      if (!CFG.adtractionChannelId || !m.a) return null;
      return 'https://track.adtraction.com/t/t?a=' + enc(m.a) +
             '&as=' + enc(CFG.adtractionChannelId) + '&t=2&tk=1' +
             (ref ? '&epi=' + enc(ref) : '') +
             '&url=' + enc(url);
    },
    tradedoubler(url, m, ref) {
      if (!CFG.tradedoublerSiteId || !m.p) return null;
      return 'https://clk.tradedoubler.com/click?p=' + enc(m.p) +
             '&a=' + enc(CFG.tradedoublerSiteId) +
             (ref ? '&epi=' + enc(ref) : '') +
             '&url=' + enc(url);
    },
    impact(url, m, ref) {
      if (!m.link || !/^https:\/\//.test(m.link)) return null;
      const sep = m.link.indexOf('?') > -1 ? '&' : '?';
      return m.link + sep + (ref ? 'subId1=' + enc(ref) + '&' : '') + 'u=' + enc(url);
    },
    shareasale(url, m) {
      if (!CFG.shareasaleUserId || !m.mid) return null;
      return 'https://shareasale.com/r.cfm?b=0&u=' + enc(CFG.shareasaleUserId) +
             '&m=' + enc(m.mid) + '&urllink=' + enc(url.replace(/^https?:\/\//, ''));
    },
    rakuten(url, m) {
      if (!CFG.rakutenId || !m.mid) return null;
      return 'https://click.linksynergy.com/deeplink?id=' + enc(CFG.rakutenId) +
             '&mid=' + enc(m.mid) + '&murl=' + enc(url);
    },
    template(url, m, ref) {
      if (!m.link || !/^https:\/\//.test(m.link) || m.link.indexOf('{url}') + m.link.indexOf('{rawurl}') === -2) return null;
      return m.link.replace('{url}', enc(url)).replace('{rawurl}', url).replace('{ref}', enc(ref || ''));
    }
  };

  function sovrn(url, ref) {
    if (!CFG.sovrnId) return null;
    return 'https://redirect.viglink.com/?key=' + enc(CFG.sovrnId) +
           (ref ? '&cuid=' + enc(ref) : '') +
           '&u=' + enc(url);
  }

  /* ---- the one function everything calls ----
     opts.aff  a fixed tracking link for this one product (always wins)
     opts.ref  where in the app the click came from, e.g. 'foryou' —
               passed as the network's sub-id so reports can tell the
               guide from the For You list. Never anything personal. */
  function link(url, opts) {
    opts = opts || {};
    if (!url || typeof url !== 'string') return url || '';
    if (opts.aff) return opts.aff;
    if (!/^https?:\/\//i.test(url)) return url;          // relative / mailto / tel: leave alone

    const host = hostOf(url);
    if (!host || TRACKING.test(host)) return url;
    const ref = opts.ref ? String(opts.ref).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : '';

    if (AMAZON.test(host) && CFG.amazonTag) return addParam(url, 'tag', CFG.amazonTag);

    const m = merchantFor(host);
    if (m && m.on === true && NETWORKS[m.network]) {
      const built = NETWORKS[m.network](url, m, ref);
      if (built) return built;
    }

    const s = sovrn(url, ref);
    if (s) return s;

    return url;                                          // configured nothing: unchanged, never broken
  }

  /* True when any link can actually earn — used to decide whether to
     show a disclosure, since claiming commission you do not earn is its
     own small dishonesty, and hiding one you do earn is illegal. */
  function active() {
    if (CFG.amazonTag || CFG.sovrnId || CFG.shareasaleUserId || CFG.rakutenId) return true;
    return Object.keys(CFG.merchants || {}).some(k => {
      const m = Object.assign({ key: k }, CFG.merchants[k]);
      return m.on === true && NETWORKS[m.network] && !!NETWORKS[m.network]('https://' + k + '/', m, '');
    });
  }

  function disclosure() {
    return active()
      ? 'Some links here earn us a small commission, at no extra cost to you. It never changes what gets recommended.'
      : '';
  }

  /* Which merchants are set up, and which are ready to earn — for the
     analytics screen and for checking your config after editing it. */
  function status() {
    return Object.keys(CFG.merchants || {}).sort().map(k => {
      const m = Object.assign({ key: k }, CFG.merchants[k]);
      const builder = NETWORKS[m.network];
      const ready = !!(builder && builder('https://' + k + '/', m, ''));
      return { domain: k, network: m.network || '?', on: m.on === true, ready, earning: m.on === true && ready };
    });
  }

  function attrs(url, opts) {
    const href = link(url, opts);
    return 'href="' + href.replace(/"/g, '&quot;') + '" target="_blank" rel="sponsored noopener"';
  }

  return { configure, link, attrs, active, disclosure, status, hostOf, merchantFor, get CFG() { return CFG; } };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Affiliate;
if (typeof window !== 'undefined') window.Affiliate = Affiliate;
