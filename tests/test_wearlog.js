'use strict';
/* Daily outfit log. No dependencies.
   Run:  node tests/test_wearlog.js */

const assert = require('assert');
const path = require('path');

const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};

const W = require(path.join(__dirname, '..', 'js', 'wearlog.js'));

let passed = 0;
const failures = [];
function test(name, fn) { try { fn(); passed++; } catch (err) { failures.push({ name, err }); } }

const TODAY = '2026-09-13';
const day = n => W.addDays(TODAY, -n);
const at = n => new Date(W.addDays(TODAY, -n) + 'T12:00:00').getTime();

/* ---------- recording ---------- */

test('recording reports which garments are newly worn', () => {
  const r = W.record('ann', { items: ['a', 'b'] }, TODAY);
  assert.deepStrictEqual(r.added.sort(), ['a', 'b']);
  assert.deepStrictEqual(r.removed, []);
});

test('saving the same day again never counts a garment twice', () => {
  W.record('bo', { items: ['a', 'b'] }, TODAY);
  const r = W.record('bo', { items: ['a', 'b', 'c'] }, TODAY);
  assert.deepStrictEqual(r.added, ['c']);
  assert.deepStrictEqual(r.removed, []);
});

test('taking a garment off the list reports it as removed', () => {
  W.record('cy', { items: ['a', 'b'] }, TODAY);
  const r = W.record('cy', { items: ['b'] }, TODAY);
  assert.deepStrictEqual(r.removed, ['a']);
  assert.deepStrictEqual(r.added, []);
});

test('duplicate ids in one save collapse to one wear', () => {
  const r = W.record('di', { items: ['a', 'a', 'a'] }, TODAY);
  assert.deepStrictEqual(r.entry.items, ['a']);
});

test('a fit complaint about a garment not worn today is dropped', () => {
  const r = W.record('ed', { items: ['a'], fit: { a: 'tight', z: 'loose' } }, TODAY);
  assert.deepStrictEqual(r.entry.fit, { a: 'tight' });
});

test('unknown feelings and fit values are ignored', () => {
  const r = W.record('fi', { items: ['a'], feel: 'ecstatic', fit: { a: 'wrong' } }, TODAY);
  assert.strictEqual(r.entry.feel, null);
  assert.deepStrictEqual(r.entry.fit, {});
});

test('remove returns what was worn so the counts can be undone', () => {
  W.record('gu', { items: ['a', 'b'] }, TODAY);
  assert.deepStrictEqual(W.remove('gu', TODAY).sort(), ['a', 'b']);
  assert.strictEqual(W.entry('gu', TODAY), null);
});

test('owners never see each other’s logs', () => {
  W.record('hal', { items: ['x'] }, TODAY);
  assert.strictEqual(W.entry('ivy', TODAY), null);
});

test('forgetting a deleted garment removes it from every day', () => {
  W.record('jo', { items: ['a', 'b'], fit: { a: 'loose' } }, day(1));
  W.record('jo', { items: ['a'] }, TODAY);
  W.forgetItem('jo', 'a');
  assert.deepStrictEqual(W.entry('jo', day(1)).items, ['b']);
  assert.deepStrictEqual(W.entry('jo', day(1)).fit, {});
  assert.deepStrictEqual(W.entry('jo', TODAY).items, []);
});

test('wornOn answers for a given day', () => {
  W.record('ka', { items: ['a'] }, TODAY);
  assert.strictEqual(W.wornOn('ka', 'a', TODAY), true);
  assert.strictEqual(W.wornOn('ka', 'b', TODAY), false);
});

/* ---------- streak ---------- */

function days(list) { const o = {}; list.forEach(d => { o[d] = { items: ['a'] }; }); return o; }

test('an unlogged today does not break the streak', () => {
  assert.strictEqual(W.streak(days([day(1), day(2)]), TODAY).count, 2);
});

test('a day with nothing on the list is not a logged day', () => {
  const e = days([day(1), day(2)]);
  e[day(3)] = { items: [] };
  e[day(4)] = { items: [] };
  assert.strictEqual(W.streak(e, TODAY).count, 2);
});

test('one rest day a week is forgiven', () => {
  assert.strictEqual(W.streak(days([day(1), day(3), day(4)]), TODAY).count, 3);
});

/* ---------- closet stats ---------- */

test('rotation counts distinct garments worn in 30 days', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => ({ id, createdAt: at(100), worn: 1 }));
  const e = { [day(1)]: { items: ['a', 'b'] }, [day(2)]: { items: ['a'] }, [day(40)]: { items: ['c'] } };
  const s = W.stats(items, e, TODAY);
  assert.strictEqual(s.rotation, 2);
  assert.strictEqual(s.rotationPct, 50);
  assert.strictEqual(s.daysLogged30, 2);
});

test('a garment last worn 60+ days ago is neglected', () => {
  const items = [{ id: 'a', createdAt: at(200), worn: 4 }];
  assert.strictEqual(W.stats(items, { [day(61)]: { items: ['a'] } }, TODAY).neglected.length, 1);
  assert.strictEqual(W.stats(items, { [day(20)]: { items: ['a'] } }, TODAY).neglected.length, 0);
});

test('a never-worn garment owned a month is neglected; a new one is not', () => {
  const s = W.stats([
    { id: 'old', createdAt: at(45), worn: 0 },
    { id: 'new', createdAt: at(5), worn: 0 }
  ], {}, TODAY);
  assert.deepStrictEqual(s.neglected.map(i => i.id), ['old']);
});

test('wears from before the log existed are not called neglect', () => {
  const s = W.stats([{ id: 'loved', createdAt: at(300), worn: 40 }], {}, TODAY);
  assert.strictEqual(s.neglected.length, 0);
});

test('cost per wear ranks cheapest first and skips unworn or unpriced', () => {
  const s = W.stats([
    { id: 'a', price: 100, worn: 10, createdAt: at(10) },
    { id: 'b', price: 30, worn: 15, createdAt: at(10) },
    { id: 'c', price: 50, worn: 0, createdAt: at(10) },
    { id: 'd', worn: 20, createdAt: at(10) }
  ], {}, TODAY);
  assert.deepStrictEqual(s.cpw.map(x => x.item.id), ['b', 'a']);
  assert.strictEqual(s.cpw[0].cpw, 2);
});

test('insights point neglected pieces at resale', () => {
  const items = [1, 2, 3].map(i => ({ id: 'n' + i, createdAt: at(90), worn: 0 }));
  const out = W.insights(items, {}, TODAY);
  assert.strictEqual(out[0].link, 'resale');
  assert.ok(/3 pieces/.test(out[0].text));
});

test('insights are empty for a new closet', () => {
  assert.deepStrictEqual(W.insights([], {}, TODAY), []);
});

/* ---------- fit reports ---------- */

const closet = [
  { id: 'tee', type: 'tshirt', size: 'M', brand: 'Uniqlo' },
  { id: 'jn', type: 'trousers', size: 'W32 L32', brand: 'Levi’s' },
  { id: 'shoe', type: 'sneakers', size: '43', brand: 'Nike' },
  { id: 'nolabel', type: 'shirt', size: '', brand: 'Zara' }
];

test('tight and loose on labelled garments become fit reports', () => {
  const r = W.fitReports({ fit: { tee: 'tight', jn: 'loose' } }, closet);
  assert.deepStrictEqual(r.map(x => [x.garmentType, x.size, x.outcome]).sort(),
    [['jeans', 'W32 L32', 'too-loose'], ['tshirt', 'M', 'too-tight']]);
});

test('length issues, shoes and unlabelled garments are not reported', () => {
  assert.deepStrictEqual(W.fitReports({ fit: { tee: 'short', shoe: 'tight', nolabel: 'tight' } }, closet), []);
});

test('re-saving the same complaint does not report it again', () => {
  const prev = { fit: { tee: 'tight' } };
  assert.deepStrictEqual(W.newFitReports(prev, { fit: { tee: 'tight' } }, closet), []);
  assert.strictEqual(W.newFitReports(prev, { fit: { tee: 'tight', jn: 'loose' } }, closet).length, 1);
  assert.strictEqual(W.newFitReports(null, { fit: { tee: 'tight' } }, closet).length, 1);
});

/* ---------- report ---------- */

if (failures.length) {
  console.error(`\n${passed} passed, ${failures.length} FAILED\n`);
  failures.forEach(f => console.error(`  ✗ ${f.name}\n      ${f.err.message}`));
  process.exit(1);
}
console.log(`wear log: ${passed} tests passed`);
