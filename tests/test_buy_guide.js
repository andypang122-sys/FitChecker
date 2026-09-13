'use strict';
/* The what-to-buy guide. No dependencies.
   Run:  node tests/test_buy_guide.js */

const assert = require('assert');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'buy-guide.js'));
const S = require(path.join(__dirname, '..', 'js', 'style-profile.js'));
const A = require(path.join(__dirname, '..', 'js', 'affiliate.js'));

const TYPES = ['tshirt', 'shirt', 'hoodie', 'jacket', 'dress', 'jeans', 'shorts', 'skirt'];
const STYLE_IDS = S.STYLES.map(s => s.id);

let passed = 0;
const failures = [];
function test(name, fn) { try { fn(); passed++; } catch (err) { failures.push({ name, err }); } finally { A.configure({}); } }

test('every guide entry is valid', () => {
  const p = G.problems(STYLE_IDS, TYPES);
  assert.deepStrictEqual(p, [], '\n  ' + p.join('\n  '));
});

test('every style has a guide', () => {
  STYLE_IDS.forEach(id => assert.ok(G.GUIDE[id] && G.GUIDE[id].length, `no guide for ${id}`));
});

test('every style gives women at least three pieces, and men three where the style suits them', () => {
  const femaleOnly = ['boho', 'romantic'];
  STYLE_IDS.forEach(id => {
    assert.ok(G.itemsFor(id, 'female').length >= 3, `${id}: too few for women`);
    if (femaleOnly.indexOf(id) === -1) assert.ok(G.itemsFor(id, 'male').length >= 3, `${id}: too few for men`);
  });
});

test('men never get dresses or skirts, women never get menswear-only pieces', () => {
  STYLE_IDS.concat('essentials').forEach(id => {
    G.itemsFor(id, 'male').forEach(it => assert.ok(it.gender !== 'female' && ['dress', 'skirt'].indexOf(it.type) === -1, `${id}/${it.id}`));
    G.itemsFor(id, 'female').forEach(it => assert.ok(it.gender !== 'male', `${id}/${it.id}`));
  });
});

test('every link is https and every search carries its query', () => {
  Object.keys(G.GUIDE).forEach(sid => G.itemsFor(sid, 'all').forEach(it => it.links.forEach(l => {
    assert.ok(/^https:\/\//.test(l.url), l.url);
    if (G.SHOPS[l.key].search) assert.ok(/[?&](q|search_text)=./.test(l.url), `${sid}/${it.id} → ${l.url}`);
  })));
});

test('queries are encoded, including apostrophes and spaces', () => {
  const url = G.linkFor('boozt', "levi's 501", 'male');
  assert.strictEqual(url, 'https://www.boozt.com/se/en/search/result?q=levi\'s%20501');
  assert.strictEqual(new URL(url).searchParams.get('q'), "levi's 501");
});

test('Mango and Junkyard pick the side of the shop from gender', () => {
  assert.ok(/\/search\/men\?/.test(G.linkFor('mango', 'blazer', 'male')));
  assert.ok(/\/search\/women\?/.test(G.linkFor('mango', 'blazer', 'female')));
  assert.strictEqual(G.linkFor('junkyard', '', 'male'), 'https://junkyard.com/en/men/');
  assert.strictEqual(G.linkFor('junkyard', '', 'female'), 'https://junkyard.com/en/women/');
});

test('budget puts the nearest shop first but keeps them all', () => {
  const [it] = G.itemsFor('streetwear', 'male', '3').filter(x => x.id === 'st-tee');
  assert.strictEqual(it.links[0].brand, 'Stüssy');
  assert.strictEqual(it.links.length, 3);
  const [cheap] = G.itemsFor('streetwear', 'male', '1').filter(x => x.id === 'st-tee');
  assert.strictEqual(cheap.links[0].brand, 'Uniqlo');
});

test('no budget keeps the written order', () => {
  const [it] = G.itemsFor('streetwear', 'male', 'any').filter(x => x.id === 'st-tee');
  assert.deepStrictEqual(it.links.map(l => l.brand), ['Carhartt WIP', 'Uniqlo', 'Stüssy']);
});

test('second-hand stays near the top for any budget', () => {
  const [it] = G.itemsFor('vintage', 'female', '3').filter(x => x.id === 'vi-501');
  assert.strictEqual(it.links[0].brand, 'Vinted');
});

test('forProfile: one section per chosen style, in order', () => {
  const out = G.forProfile({ gender: 'female', styles: ['y2k', 'office'], budget: 'any' });
  assert.deepStrictEqual(out.map(s => s.id), ['y2k', 'office']);
  assert.ok(out[0].items.every(it => it.gender !== 'male'));
});

test('forProfile with no styles gives the essentials', () => {
  const out = G.forProfile({ gender: 'male', styles: [] });
  assert.deepStrictEqual(out.map(s => s.id), ['essentials']);
  assert.ok(!out[0].items.some(it => it.type === 'dress'));
});

test('forProfile accepts a gender override from the body profile', () => {
  const out = G.forProfile({ styles: ['office'] }, 'male');
  assert.ok(out[0].items.some(it => it.id === 'of-suit'));
  assert.ok(!out[0].items.some(it => it.id === 'of-blazer-f'));
});

test('guide links monetise through Affiliate once a merchant is switched on', () => {
  A.configure({ awinAffId: '42', merchants: { 'uniqlo.com': { network: 'awin', mid: '21364', on: true } } });
  const url = G.linkFor('uniqlo', 'linen shirt', 'male');
  const out = A.link(url, { ref: 'guide' });
  assert.strictEqual(new URL(out).searchParams.get('awinmid'), '21364');
  assert.strictEqual(new URL(out).searchParams.get('ued'), url);
  assert.strictEqual(new URL(out).searchParams.get('clickref'), 'guide');
});

if (failures.length) {
  console.error(`\n${passed} passed, ${failures.length} FAILED\n`);
  failures.forEach(f => console.error(`  ✗ ${f.name}\n      ${f.err.message}`));
  process.exit(1);
}
console.log(`buy guide: ${passed} tests passed`);
