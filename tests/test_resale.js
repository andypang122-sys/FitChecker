'use strict';
/* Second-hand listing parser + size ledger tests.
   Run:  node tests/test_resale.js */

const assert = require('assert');
const path = require('path');

// Resale reads FitEngine off the global, the way the browser provides it.
global.FitEngine = require(path.join(__dirname, '..', 'js', 'fit-engine.js'));
const Resale = require(path.join(__dirname, '..', 'js', 'resale.js'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, err }); }
}

const BODY = {
  height: 180, chest: 100, waist: 86, hips: 100,
  shoulders: 46, armLength: 65, inseam: 82, thigh: 60
};
const cm = (parsed, zone) => parsed.measurements[zone] && parsed.measurements[zone].cm;

/* ---------- the flat-measurement problem ---------- */

test('a flat pit-to-pit is doubled into a real chest girth', () => {
  // The whole point: sellers measure the garment lying on a table, so
  // 54cm across is a 108cm garment.
  assert.strictEqual(cm(Resale.parse('Pit to pit: 54cm'), 'chest'), 108);
});

test('a figure already given as a full girth is left alone', () => {
  assert.strictEqual(cm(Resale.parse('Chest 104 cm around'), 'chest'), 104);
});

test('lengths are never doubled', () => {
  const p = Resale.parse('Length 71cm\nSleeve 62cm\nInseam 80cm');
  assert.strictEqual(cm(p, 'torsoLength'), 71);
  assert.strictEqual(cm(p, 'sleeveLength'), 62);
  assert.strictEqual(cm(p, 'inseam'), 80);
});

test('shoulders are a width, not a girth, so they are not doubled', () => {
  assert.strictEqual(cm(Resale.parse('Shoulder to shoulder 47cm'), 'shoulders'), 47);
});

/* ---------- the vocabulary sellers actually use ---------- */

test('every common way of writing pit-to-pit is understood', () => {
  for (const label of ['Pit to pit', 'pit-to-pit', 'P2P', 'ptp',
                       'Armpit to armpit', 'Chest', 'Bust']) {
    const p = Resale.parse(label + ' 54cm');
    assert.strictEqual(cm(p, 'chest'), 108, 'failed on: ' + label);
  }
});

test('trouser vocabulary is understood', () => {
  const p = Resale.parse('Waist 40cm\nInside leg 78cm\nThigh 30cm');
  assert.strictEqual(cm(p, 'waist'), 80);
  assert.strictEqual(cm(p, 'inseam'), 78);
  assert.strictEqual(cm(p, 'thigh'), 60);
});

test('bullets, dashes and em-dashes all separate a label from its number', () => {
  const p = Resale.parse('MEASUREMENTS•Pit to Pit – 52 cm•Total Length — 71cm•Sleeve: 60');
  assert.strictEqual(cm(p, 'chest'), 104);
  assert.strictEqual(cm(p, 'torsoLength'), 71);
  assert.strictEqual(cm(p, 'sleeveLength'), 60);
});

/* ---------- units ---------- */

test('inches are converted, however they are written', () => {
  for (const unit of ['in', 'inch', 'inches', '"', '”']) {
    const p = Resale.parse('Length 27' + unit);
    assert.ok(Math.abs(cm(p, 'torsoLength') - 68.6) < 0.2, 'failed on: ' + unit);
  }
});

test('a unit attached to the number still sets the listing hint', () => {
  // "54cm" has no word boundary before the unit; a naive \bcm\b misses the
  // most common way sellers write it and reports the unit as guessed.
  const p = Resale.parse('p2p 54cm, length 70cm');
  assert.strictEqual(p.unit, 'cm');
  assert.ok(!p.warnings.includes('unit-guessed'));
});

test('the word "in" in prose is not mistaken for inches', () => {
  const p = Resale.parse('Kept in a smoke free home, in great condition. Pit to pit 54cm');
  assert.strictEqual(p.unit, 'cm');
});

test('a bare number is resolved from the rest of the listing', () => {
  const p = Resale.parse('All measurements in inches\nChest 24\nLength 27');
  assert.ok(Math.abs(cm(p, 'chest') - 121.9) < 0.2, 'got ' + cm(p, 'chest'));
});

test('an explicit unit beats the listing-wide hint', () => {
  // Mixed listings are common: inches for the leg, cm for the waist.
  const p = Resale.parse('Levis 501\nWaist 44cm flat\nInseam 32"');
  assert.strictEqual(cm(p, 'waist'), 88);
  assert.ok(Math.abs(cm(p, 'inseam') - 81.3) < 0.2);
});

test('millimetres are handled', () => {
  assert.strictEqual(cm(Resale.parse('Length 710mm'), 'torsoLength'), 71);
});

/* ---------- rejecting nonsense ---------- */

test('a listing with no measurements yields nothing, not a guess', () => {
  const p = Resale.parse('Lovely jumper, size M, worn twice, smoke free home');
  assert.deepStrictEqual(p.measurements, {});
  assert.ok(p.warnings.includes('nothing-found'));
});

test('implausible figures are discarded', () => {
  // A 900cm chest is a typo, not a garment.
  assert.strictEqual(cm(Resale.parse('Chest 900cm'), 'chest'), undefined);
  assert.strictEqual(cm(Resale.parse('Length 2cm'), 'torsoLength'), undefined);
});

test('the first reading of a zone wins over later repeats', () => {
  const p = Resale.parse('Pit to pit 54cm\nRoughly, chest is about 60cm');
  assert.strictEqual(cm(p, 'chest'), 108);
});

test('empty and junk input do not throw', () => {
  for (const bad of ['', null, undefined, '!!!', '12345']) {
    const p = Resale.parse(bad);
    assert.deepStrictEqual(p.measurements, {});
  }
});

/* ---------- the verdict ---------- */

test('a listing that fits gets a positive verdict', () => {
  const out = Resale.check('Pit to pit 52cm\nLength 70cm\nShoulder to shoulder 45cm',
                           'tshirt', BODY, 'regular', 'male');
  assert.ok(out.ok);
  assert.ok(out.result.score >= 82, 'score was ' + out.result.score);
});

test('a listing far too small is refused outright', () => {
  const out = Resale.check('Pit to pit 40cm\nLength 60cm', 'tshirt', BODY, 'regular', 'male');
  assert.ok(out.ok);
  assert.ok(out.result.score < 55, 'score was ' + out.result.score);
  assert.strictEqual(out.result.zones.chest.status, 'tight');
  assert.ok(/walk away/i.test(out.result.verdict), out.result.verdict);
});

test('the verdict never reads "Size This item"', () => {
  // The engine's own lines are written for choosing between sizes; a
  // single second-hand garment needs its own voice.
  const out = Resale.check('Pit to pit 52cm\nLength 70cm', 'tshirt', BODY, 'regular', 'male');
  assert.ok(!/Size This item/i.test(out.result.verdict), out.result.verdict);
});

test('no measurements means no verdict at all', () => {
  const out = Resale.check('Great jumper, size M', 'tshirt', BODY, 'regular', 'male');
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'nothing-found');
});

/* ---------- confidence honesty ---------- */

test('confidence reflects the garment, not how much of the listing parsed', () => {
  // One pit-to-pit is not full knowledge of a t-shirt, even though it is
  // 100% of what the seller offered.
  const thin = Resale.check('Pit to pit 52cm', 'tshirt', BODY, 'regular', 'male');
  const full = Resale.check('Pit to pit 52cm\nWaist 50cm\nShoulder to shoulder 45cm\nLength 70cm',
                            'tshirt', BODY, 'regular', 'male');
  assert.ok(thin.result.confidence < 50, 'thin listing claimed ' + thin.result.confidence);
  assert.ok(full.result.confidence > thin.result.confidence);
});

test('what the seller left out is named', () => {
  const out = Resale.check('Pit to pit 52cm', 'tshirt', BODY, 'regular', 'male');
  assert.ok(out.result.missingZones.includes('waist'));
  assert.ok(out.result.missingZones.includes('torsoLength'));
});

/* ---------- the chart handed to the engine ---------- */

test('a listing is a garment chart, so ease is not added on top', () => {
  const chart = Resale.toChart({ chest: { cm: 108 } });
  assert.strictEqual(chart.measurements, 'garment');
  assert.deepStrictEqual(chart.sizeOrder, [Resale.LISTING_SIZE]);
  assert.strictEqual(chart.sizes[Resale.LISTING_SIZE].chest, 108);
});

test('an empty measurement set produces no chart', () => {
  assert.strictEqual(Resale.toChart({}), null);
  assert.strictEqual(Resale.toChart(null), null);
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
console.log(`resale: ${passed} tests passed`);
