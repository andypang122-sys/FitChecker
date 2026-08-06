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
   domain. Filling in a single id in app-config.js monetises every
   link in the app at once.

   HOW EACH NETWORK ACTUALLY WORKS, because they are all different:

   • Amazon Associates — a query parameter on the normal product URL.
     The simplest of the lot, and the only one that needs no wrapper.

   • Awin / ShareASale / Rakuten — the destination is wrapped inside a
     tracking URL belonging to the network. Each has its own parameter
     names, and each needs the merchant's id as well as yours, so a
     per-merchant mapping is unavoidable for these.

   • Sovrn Commerce (formerly Skimlinks) — the pragmatic one for a
     portfolio like this. A single id monetises links to thousands of
     merchants without applying to each individually, which matters
     when you have a few hundred products across seven apps and no
     traffic history to get accepted with. It is the sensible default
     and the fallback for anything not otherwise matched.

   SAFETY RULE: if nothing is configured, the ORIGINAL URL is returned
   untouched. A missing tag must never produce a broken link — a link
   that 404s costs a customer, and earns nothing anyway.
   ============================================================ */

const Affiliate = (() => {

  const APP = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
  const CFG = APP.affiliate || {};

  /* Merchants Amazon-style tagging applies to, by domain suffix. */
  const AMAZON = /(^|\.)amazon\.(com|co\.uk|de|fr|it|es|ca|com\.au|co\.jp|se|nl|pl)$/i;

  function hostOf(url) {
    try {
      /* The URL constructor needs an absolute URL; anything relative or
         malformed is not ours to rewrite, so it is left alone. */
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) { return ''; }
  }

  function addParam(url, key, val) {
    if (!val) return url;
    try {
      const u = new URL(url);
      u.searchParams.set(key, val);
      return u.toString();
    } catch (e) {
      /* Fall back to string concatenation rather than dropping the tag,
         but only when the URL at least looks absolute. */
      if (!/^https?:\/\//i.test(url)) return url;
      return url + (url.indexOf('?') > -1 ? '&' : '?') + key + '=' + encodeURIComponent(val);
    }
  }

  /* ---- network wrappers ---- */
  function awin(url, mid) {
    if (!CFG.awinAffId || !mid) return null;
    return 'https://www.awin1.com/cread.php?awinmid=' + encodeURIComponent(mid) +
           '&awinaffid=' + encodeURIComponent(CFG.awinAffId) +
           '&ued=' + encodeURIComponent(url);
  }
  function shareasale(url, merchantId) {
    if (!CFG.shareasaleUserId || !merchantId) return null;
    return 'https://shareasale.com/r.cfm?b=0&u=' + encodeURIComponent(CFG.shareasaleUserId) +
           '&m=' + encodeURIComponent(merchantId) +
           '&urllink=' + encodeURIComponent(url.replace(/^https?:\/\//, ''));
  }
  function rakuten(url, mid) {
    if (!CFG.rakutenId || !mid) return null;
    return 'https://click.linksynergy.com/deeplink?id=' + encodeURIComponent(CFG.rakutenId) +
           '&mid=' + encodeURIComponent(mid) +
           '&murl=' + encodeURIComponent(url);
  }
  function sovrn(url) {
    if (!CFG.sovrnId) return null;
    return 'https://redirect.viglink.com/?key=' + encodeURIComponent(CFG.sovrnId) +
           '&u=' + encodeURIComponent(url);
  }

  /* ---- the one function everything calls ---- */
  function link(url, opts) {
    opts = opts || {};
    if (!url || typeof url !== 'string') return url || '';
    if (!/^https?:\/\//i.test(url)) return url;          // relative / mailto / tel: leave alone

    /* An explicit per-product override always wins. Some merchants
       hand out a single fixed tracking link that cannot be built
       programmatically, and that has to stay possible. */
    if (opts.aff) return opts.aff;

    const host = hostOf(url);
    if (!host) return url;

    /* Never rewrite a link that is already a tracking URL — double
       wrapping breaks attribution and sometimes the link itself. */
    if (/awin1\.com|shareasale\.com|linksynergy\.com|viglink\.com|redirect\.viglink/.test(host)) return url;

    if (AMAZON.test(host) && CFG.amazonTag) return addParam(url, 'tag', CFG.amazonTag);

    const m = (CFG.merchants || {})[host];
    if (m) {
      const built =
        m.network === 'awin'       ? awin(url, m.mid) :
        m.network === 'shareasale' ? shareasale(url, m.mid) :
        m.network === 'rakuten'    ? rakuten(url, m.mid) : null;
      if (built) return built;
    }

    /* Catch-all. One id, most merchants, no individual applications —
       which is the only realistic way to monetise a few hundred links
       before you have the traffic to be accepted anywhere directly. */
    const s = sovrn(url);
    if (s) return s;

    return url;                                          // configured nothing: unchanged, never broken
  }

  /* True when anything at all is configured — used to decide whether
     to show a disclosure, since claiming to earn commission when you
     do not is its own small dishonesty. */
  function active() {
    return !!(CFG.amazonTag || CFG.sovrnId || CFG.awinAffId ||
              CFG.shareasaleUserId || CFG.rakutenId ||
              Object.keys(CFG.merchants || {}).length);
  }

  /* Legally required wherever a link earns a commission, and it has to
     be legible rather than technically present. */
  function disclosure() {
    return active()
      ? 'Some links here earn us a small commission, at no extra cost to you. It never changes what gets recommended.'
      : '';
  }

  /* Convenience for rendering an anchor safely. */
  function attrs(url, opts) {
    const href = link(url, opts);
    return 'href="' + href.replace(/"/g, '&quot;') + '" target="_blank" rel="sponsored noopener"';
  }

  return { CFG, link, attrs, active, disclosure, hostOf };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Affiliate;
if (typeof window !== 'undefined') window.Affiliate = Affiliate;
