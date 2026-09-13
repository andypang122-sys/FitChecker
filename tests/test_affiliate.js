'use strict';
/* Affiliate link building. No dependencies.
   Run:  node tests/test_affiliate.js */

const assert = require('assert');
const path = require('path');
const A = require(path.join(__dirname, '..', 'js', 'affiliate.js'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, err }); }
  finally { A.configure({}); }
}

const DEST = 'https://www.uniqlo.com/se/en/search?q=linen shirt&x=1';
const param = (url, key) => new URL(url).searchParams.get(key);

/* ---------- safety ---------- */

test('nothing configured leaves every link exactly as it was', () => {
  A.configure({});
  assert.strictEqual(A.link(DEST), DEST);
  assert.strictEqual(A.active(), false);
  assert.strictEqual(A.disclosure(), '');
});

test('relative, mailto and empty links are never touched', () => {
  A.configure({ sovrnId: 'k' });
  assert.strictEqual(A.link('#/foryou'), '#/foryou');
  assert.strictEqual(A.link('mailto:a@b.c'), 'mailto:a@b.c');
  assert.strictEqual(A.link(''), '');
  assert.strictEqual(A.link(null), '');
});

test('a fixed per-product tracking link always wins', () => {
  A.configure({ sovrnId: 'k' });
  assert.strictEqual(A.link(DEST, { aff: 'https://go.example/abc' }), 'https://go.example/abc');
});

test('an existing tracking link is never wrapped twice', () => {
  A.configure({ sovrnId: 'k' });
  ['https://www.awin1.com/cread.php?awinmid=1', 'https://track.adtraction.com/t/t?a=1',
   'https://clk.tradedoubler.com/click?p=1', 'https://levis.pxf.io/c/1/2/3'].forEach(u => assert.strictEqual(A.link(u), u));
});

/* ---------- a merchant switched off is not used ---------- */

test('a merchant that is not switched on falls through untouched', () => {
  A.configure({ awinAffId: '999', merchants: { 'uniqlo.com': { network: 'awin', mid: '21364', on: false } } });
  assert.strictEqual(A.link(DEST), DEST);
  assert.strictEqual(A.active(), false);
});

test('a merchant switched off falls through to Sovrn when Sovrn is set up', () => {
  A.configure({ sovrnId: 'KEY', awinAffId: '999', merchants: { 'uniqlo.com': { network: 'awin', mid: '21364' } } });
  const out = A.link(DEST);
  assert.ok(out.startsWith('https://redirect.viglink.com/'), out);
  assert.strictEqual(param(out, 'u'), DEST);
});

/* ---------- networks ---------- */

test('Awin: documented deep-link format, destination round-trips', () => {
  A.configure({ awinAffId: '123456', merchants: { 'uniqlo.com': { network: 'awin', mid: '21364', on: true } } });
  const out = A.link(DEST, { ref: 'foryou' });
  assert.ok(out.startsWith('https://www.awin1.com/cread.php?'), out);
  assert.strictEqual(param(out, 'awinmid'), '21364');
  assert.strictEqual(param(out, 'awinaffid'), '123456');
  assert.strictEqual(param(out, 'clickref'), 'foryou');
  assert.strictEqual(param(out, 'ued'), DEST);
  assert.strictEqual(A.active(), true);
});

test('Awin without your publisher id does nothing', () => {
  A.configure({ merchants: { 'uniqlo.com': { network: 'awin', mid: '21364', on: true } } });
  assert.strictEqual(A.link(DEST), DEST);
  assert.strictEqual(A.active(), false);
});

test('Adtraction: ad id, your channel, t=2&tk=1, then the url', () => {
  A.configure({ adtractionChannelId: '1110161817', merchants: { 'junkyard.com': { network: 'adtraction', a: '1305927901', on: true } } });
  const dest = 'https://junkyard.com/en/men/';
  const out = A.link(dest, { ref: 'guide' });
  assert.ok(out.startsWith('https://track.adtraction.com/t/t?a=1305927901&as=1110161817&t=2&tk=1'), out);
  assert.strictEqual(param(out, 'epi'), 'guide');
  assert.strictEqual(param(out, 'url'), dest);
});

test('Tradedoubler: programme, your site id, then the url', () => {
  A.configure({ tradedoublerSiteId: '35219', merchants: { 'boozt.com': { network: 'tradedoubler', p: '227648', on: true } } });
  const dest = 'https://www.boozt.com/se/en/search/result?q=oxford';
  const out = A.link(dest);
  assert.ok(out.startsWith('https://clk.tradedoubler.com/click?p=227648&a=35219'), out);
  assert.strictEqual(param(out, 'url'), dest);
});

test('Impact: tracking link plus subId1 and the encoded destination', () => {
  A.configure({ merchants: { 'levi.com': { network: 'impact', link: 'https://levis.pxf.io/c/1987654/1234567/15676', on: true } } });
  const dest = 'https://www.levi.com/SE/en/clothing/men/jeans/c/levi_clothing_men_jeans';
  const out = A.link(dest, { ref: 'foryou' });
  assert.ok(out.startsWith('https://levis.pxf.io/c/1987654/1234567/15676?subId1=foryou&u='), out);
  assert.strictEqual(param(out, 'u'), dest);
});

test('Impact link that already has a query string gets & not ?', () => {
  A.configure({ merchants: { 'levi.com': { network: 'impact', link: 'https://levis.pxf.io/c/1/2/3?sharedid=x', on: true } } });
  const out = A.link('https://www.levi.com/SE/en/');
  assert.ok(/\?sharedid=x&u=/.test(out), out);
});

test('template: any network, with {url} and {ref} filled in', () => {
  A.configure({ merchants: { 'example.com': { network: 'template', link: 'https://prf.hn/click/camref:ABC/pubref:{ref}/destination:{url}', on: true } } });
  const out = A.link('https://example.com/a?b=1', { ref: 'guide' });
  assert.strictEqual(out, 'https://prf.hn/click/camref:ABC/pubref:guide/destination:' + encodeURIComponent('https://example.com/a?b=1'));
});

test('Amazon tag goes on as a query parameter', () => {
  A.configure({ amazonTag: 'fitchecker-21' });
  assert.strictEqual(param(A.link('https://www.amazon.se/dp/B000?th=1'), 'tag'), 'fitchecker-21');
});

test('Sovrn catch-all carries the placement as cuid', () => {
  A.configure({ sovrnId: 'KEY' });
  const out = A.link('https://www.carhartt-wip.com/en-gb/search?q=detroit', { ref: 'guide' });
  assert.strictEqual(param(out, 'key'), 'KEY');
  assert.strictEqual(param(out, 'cuid'), 'guide');
});

/* ---------- matching ---------- */

test('subdomains find their parent merchant', () => {
  A.configure({ awinAffId: '1', merchants: { 'hm.com': { network: 'awin', mid: '7', on: true }, 'gymshark.com': { network: 'awin', mid: '8', on: true } } });
  assert.strictEqual(param(A.link('https://www2.hm.com/en_gb/ladies.html'), 'awinmid'), '7');
  assert.strictEqual(param(A.link('https://eu.gymshark.com/search?q=shorts'), 'awinmid'), '8');
});

test('the most specific merchant wins', () => {
  A.configure({ awinAffId: '1', merchants: { 'mango.com': { network: 'awin', mid: '1', on: true }, 'shop.mango.com': { network: 'awin', mid: '2', on: true } } });
  assert.strictEqual(param(A.link('https://shop.mango.com/se/en/h/women'), 'awinmid'), '2');
});

test('a look-alike domain is not matched', () => {
  A.configure({ awinAffId: '1', merchants: { 'hm.com': { network: 'awin', mid: '7', on: true } } });
  assert.strictEqual(A.link('https://notahm.com/x'), 'https://notahm.com/x');
});

test('the placement ref is stripped of anything but safe characters', () => {
  A.configure({ sovrnId: 'KEY' });
  assert.strictEqual(param(A.link('https://x.com/', { ref: 'for you<script>' }), 'cuid'), 'foryouscript');
});

/* ---------- status ---------- */

test('status reports which merchants are switched on and able to earn', () => {
  A.configure({ awinAffId: '1', merchants: {
    'uniqlo.com': { network: 'awin', mid: '21364', on: true },
    'nike.com': { network: 'awin', mid: '16339', on: false },
    'junkyard.com': { network: 'adtraction', a: '', on: true }
  } });
  const s = Object.fromEntries(A.status().map(x => [x.domain, x]));
  assert.strictEqual(s['uniqlo.com'].earning, true);
  assert.strictEqual(s['nike.com'].earning, false);
  assert.strictEqual(s['junkyard.com'].ready, false, 'no ad id and no channel → not ready');
});

/* ---------- report ---------- */

if (failures.length) {
  console.error(`\n${passed} passed, ${failures.length} FAILED\n`);
  failures.forEach(f => console.error(`  ✗ ${f.name}\n      ${f.err.message}`));
  process.exit(1);
}
console.log(`affiliate: ${passed} tests passed`);
