'use strict';
/* Size-ledger tests — the sizes proven by what you actually own.
   Run:  node tests/test_ledger.js */

const assert = require('assert');
const path = require('path');
const { Wardrobe } = require(path.join(__dirname, '..', 'js', 'wardrobe.js'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, err }); }
}

let seq = 0;
const item = (o) => Object.assign({
  id: 'i' + (++seq), owner: 'me@example.com', type: 'tshirt', slot: 'top',
  name: '', brand: '', size: '', worn: 0, createdAt: Date.now()
}, o);

const ledger = items => Wardrobe.ledgerFrom(items);

/* ---------- the basic claim ---------- */

test('a single labelled garment reports that size for its brand', () => {
  const rows = ledger([item({ brand: 'Uniqlo', size: 'M', worn: 3 })]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].brand, 'Uniqlo');
  assert.strictEqual(rows[0].slot, 'top');
  assert.strictEqual(rows[0].size, 'M');
});

test('items without a brand or a size are ignored', () => {
  assert.deepStrictEqual(ledger([
    item({ brand: 'Uniqlo', size: '' }),
    item({ brand: '', size: 'M' }),
    item({ brand: '   ', size: '  ' })
  ]), []);
});

test('an empty closet produces an empty ledger', () => {
  assert.deepStrictEqual(ledger([]), []);
});

/* ---------- wears are the evidence, not item count ---------- */

test('the most-worn size wins over the most-owned size', () => {
  // Three unworn impulse buys say less than one much-worn garment: the
  // unworn ones are exactly the ones that might not fit.
  const rows = ledger([
    item({ brand: 'COS', size: 'L', worn: 0 }),
    item({ brand: 'COS', size: 'L', worn: 0 }),
    item({ brand: 'COS', size: 'L', worn: 0 }),
    item({ brand: 'COS', size: 'M', worn: 30 })
  ]);
  assert.strictEqual(rows[0].size, 'M');
  assert.deepStrictEqual(rows[0].alternatives, ['L']);
});

test('with no wears at all, the most-owned size wins', () => {
  const rows = ledger([
    item({ brand: 'Gap', size: 'L' }),
    item({ brand: 'Gap', size: 'L' }),
    item({ brand: 'Gap', size: 'M' })
  ]);
  assert.strictEqual(rows[0].size, 'L');
});

/* ---------- brands and slots are kept apart ---------- */

test('a brand\'s tops and bottoms are reported separately', () => {
  // Cut to different ladders; one number for both would describe neither.
  const rows = ledger([
    item({ brand: 'Levi', size: 'M', slot: 'top', worn: 5 }),
    item({ brand: 'Levi', size: 'W32', slot: 'bottom', type: 'jeans', worn: 9 })
  ]);
  assert.strictEqual(rows.length, 2);
  const bySlot = Object.fromEntries(rows.map(r => [r.slot, r.size]));
  assert.strictEqual(bySlot.top, 'M');
  assert.strictEqual(bySlot.bottom, 'W32');
});

test('different brands never merge', () => {
  const rows = ledger([
    item({ brand: 'Uniqlo', size: 'M', worn: 4 }),
    item({ brand: 'COS', size: 'S', worn: 4 })
  ]);
  assert.strictEqual(rows.length, 2);
});

test('the same brand spelled inconsistently is treated as one brand', () => {
  // "COS", "cos" and "Cos " must not become three entries.
  const rows = ledger([
    item({ brand: 'COS', size: 'M', worn: 2 }),
    item({ brand: 'cos', size: 'M', worn: 2 }),
    item({ brand: '  Cos  ', size: 'M', worn: 2 })
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].items, 3);
});

test('sizes are matched case-insensitively', () => {
  const rows = ledger([
    item({ brand: 'Zara', size: 'm', worn: 1 }),
    item({ brand: 'Zara', size: 'M', worn: 1 })
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].items, 2);
  assert.deepStrictEqual(rows[0].alternatives, []);
});

test('slots without a meaningful size are skipped', () => {
  // Hats and bags carry a size that says nothing about how clothes fit.
  assert.deepStrictEqual(
    ledger([item({ brand: 'Uniqlo', size: 'One size', slot: 'head', type: 'hat' })]), []);
});

/* ---------- honesty about what we know ---------- */

test('one consistent worn size is marked proven', () => {
  const rows = ledger([
    item({ brand: 'Uniqlo', size: 'M', worn: 6 }),
    item({ brand: 'Uniqlo', size: 'M', worn: 2 })
  ]);
  assert.strictEqual(rows[0].settled, true);
  assert.deepStrictEqual(rows[0].alternatives, []);
});

test('an unworn garment is not proof', () => {
  const rows = ledger([item({ brand: 'Uniqlo', size: 'M', worn: 0 })]);
  assert.strictEqual(rows[0].settled, false);
});

test('two sizes at one brand is never called proven', () => {
  const rows = ledger([
    item({ brand: 'Zara', size: 'M', worn: 5 }),
    item({ brand: 'Zara', size: 'L', worn: 3 })
  ]);
  assert.strictEqual(rows[0].settled, false);
  assert.deepStrictEqual(rows[0].alternatives, ['L']);
});

test('wear counts are totalled per brand', () => {
  const rows = ledger([
    item({ brand: 'Uniqlo', size: 'M', worn: 5 }),
    item({ brand: 'Uniqlo', size: 'M', worn: 7 })
  ]);
  assert.strictEqual(rows[0].worn, 12);
  assert.strictEqual(rows[0].items, 2);
});

test('the most-worn brand is listed first', () => {
  const rows = ledger([
    item({ brand: 'Rarely', size: 'M', worn: 1 }),
    item({ brand: 'Often', size: 'L', worn: 40 })
  ]);
  assert.strictEqual(rows[0].brand, 'Often');
});

test('missing or malformed wear counts do not break the maths', () => {
  const rows = ledger([
    item({ brand: 'Uniqlo', size: 'M', worn: undefined }),
    item({ brand: 'Uniqlo', size: 'M', worn: 'lots' })
  ]);
  assert.strictEqual(rows[0].worn, 0);
  assert.strictEqual(rows[0].items, 2);
});

/* ---------- report ---------- */

if (failures.length) {
  console.error(`\n${passed} passed, ${failures.length} FAILED\n`);
  failures.forEach(f => {
    console.error(`  ✗ ${f.name}`);
    console.error(`      ${f.err.message}`);
  });
  process.exit(1);
}
console.log(`size ledger: ${passed} tests passed`);
