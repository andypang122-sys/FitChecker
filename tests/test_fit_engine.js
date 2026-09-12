'use strict';
/* Fit engine tests. Pure math, no DOM, no dependencies.
   Run:  node tests/test_fit_engine.js   (or: npm test) */

const assert = require('assert');
const path = require('path');

const FitEngine = require(path.join(__dirname, '..', 'js', 'fit-engine.js'));

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

/* A body squarely in the middle of the men's M column, so any
   recommendation other than M is the engine being wrong. */
const MALE_M = {
  height: 175, chest: 96, waist: 82, hips: 96,
  shoulders: 45, armLength: 64, inseam: 80, thigh: 58
};

const FEMALE_M = {
  height: 169, chest: 90, waist: 72, hips: 96,
  shoulders: 40, armLength: 61, inseam: 76, thigh: 55
};

/* ---------- size recommendation ---------- */

test('recommends M for a body cut to the men\'s M column', () => {
  const r = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male');
  assert.strictEqual(r.bestSize, 'M');
});

test('recommends M for a body cut to the women\'s M column', () => {
  const r = FitEngine.analyze('tshirt', FEMALE_M, 'regular', null, null, 'female');
  assert.strictEqual(r.bestSize, 'M');
});

test('the same measurements give different sizes for men and women', () => {
  // A 90cm chest is a men's S but a women's M — the whole reason the
  // charts are kept separate.
  const body = Object.assign({}, MALE_M, { chest: 90, waist: 76, shoulders: 43 });
  const male = FitEngine.analyze('tshirt', body, 'regular', null, null, 'male');
  const female = FitEngine.analyze('tshirt', body, 'regular', null, null, 'female');
  assert.notStrictEqual(male.bestSize, female.bestSize);
});

test('a larger body is never recommended a smaller size', () => {
  const order = FitEngine.SIZE_ORDER;
  let previous = -1;
  for (const chest of [84, 90, 96, 104, 112, 120]) {
    const body = Object.assign({}, MALE_M, { chest, waist: chest - 14, shoulders: 41 + (chest - 84) / 6 });
    const r = FitEngine.analyze('tshirt', body, 'regular', null, null, 'male');
    const idx = order.indexOf(r.bestSize);
    assert.ok(idx >= previous, `chest ${chest} gave ${r.bestSize}, smaller than the previous size`);
    previous = idx;
  }
});

test('every garment type produces a usable verdict', () => {
  for (const type of Object.keys(FitEngine.SIZE_CHARTS)) {
    const r = FitEngine.analyze(type, FEMALE_M, 'regular', null, null, 'female');
    assert.ok(r, `${type} returned nothing`);
    assert.ok(FitEngine.SIZE_ORDER.includes(r.bestSize), `${type} gave size ${r.bestSize}`);
    assert.ok(r.score >= 0 && r.score <= 100, `${type} score out of range: ${r.score}`);
  }
});

test('an unknown garment type returns null rather than throwing', () => {
  assert.strictEqual(FitEngine.analyze('spacesuit', MALE_M, 'regular', null, null, 'male'), null);
});

/* ---------- determinism ---------- */

test('the same input produces byte-identical output every time', () => {
  const a = FitEngine.analyze('shirt', MALE_M, 'regular', null, null, 'male');
  for (let i = 0; i < 25; i++) {
    const b = FitEngine.analyze('shirt', MALE_M, 'regular', null, null, 'male');
    assert.strictEqual(b.verdict, a.verdict, 'verdict text changed between identical runs');
    assert.strictEqual(b.score, a.score);
    assert.strictEqual(b.bestSize, a.bestSize);
  }
});

/* ---------- confidence ---------- */

test('confidence rises as measurements are added', () => {
  const sparse = { height: 175, chest: 96 };
  const full = MALE_M;
  const lo = FitEngine.analyze('shirt', sparse, 'regular', null, null, 'male').confidence;
  const hi = FitEngine.analyze('shirt', full, 'regular', null, null, 'male').confidence;
  assert.ok(hi > lo, `full (${hi}) should beat sparse (${lo})`);
});

test('confidence is honest when almost nothing is known', () => {
  // The old formula floored at 50%, which read as a coin flip's worth of
  // certainty for a wearer we knew nothing about.
  const r = FitEngine.analyze('jeans', { height: 175 }, 'regular', null, null, 'male');
  assert.ok(r.confidence < 50, `expected well under 50, got ${r.confidence}`);
});

test('a generic ladder never claims full confidence', () => {
  const r = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male');
  assert.ok(r.confidence <= 90, `generic chart claimed ${r.confidence}`);
});

/* ---------- fit preference ---------- */

test('a slim preference never recommends a larger size than relaxed', () => {
  const order = FitEngine.SIZE_ORDER;
  const slim = FitEngine.analyze('tshirt', MALE_M, 'slim', null, null, 'male');
  const relaxed = FitEngine.analyze('tshirt', MALE_M, 'relaxed', null, null, 'male');
  assert.ok(order.indexOf(slim.bestSize) <= order.indexOf(relaxed.bestSize));
});

/* ---------- zone reporting ---------- */

test('an unmeasured zone is reported as info, not judged', () => {
  const r = FitEngine.analyze('jeans', { height: 175, waist: 82 }, 'regular', null, null, 'male');
  assert.strictEqual(r.zones.thigh.status, 'info');
});

test('a too-small garment reports tight, with a positive cm figure', () => {
  const big = Object.assign({}, MALE_M, { chest: 125, waist: 115 });
  const r = FitEngine.analyze('tshirt', big, 'regular', 'XS', null, 'male');
  assert.strictEqual(r.zones.chest.status, 'tight');
  // The message used to be built from a ternary whose branches were
  // identical; guard against a negative or NaN centimetre figure.
  assert.ok(/about \d+(\.\d+)? cm less room/.test(r.zones.chest.message),
    'unexpected tight message: ' + r.zones.chest.message);
});

test('a far-too-large garment reports loose', () => {
  const small = Object.assign({}, MALE_M, { chest: 80, waist: 66 });
  const r = FitEngine.analyze('tshirt', small, 'regular', 'XXL', null, 'male');
  assert.strictEqual(r.zones.chest.status, 'loose');
});

/* ---------- layering ---------- */

test('outerwear allows room for what goes underneath', () => {
  // Same body, same chart ladder: the jacket must never come out smaller
  // than the t-shirt, because it goes on over one.
  const order = FitEngine.SIZE_ORDER;
  const tee = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male');
  const jacket = FitEngine.analyze('jacket', MALE_M, 'regular', null, null, 'male');
  assert.ok(order.indexOf(jacket.bestSize) >= order.indexOf(tee.bestSize));
});

/* ---------- calibration bias ---------- */

test('a positive ease bias never recommends a smaller size', () => {
  const order = FitEngine.SIZE_ORDER;
  const base = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male');
  const biased = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male', { easeBias: 4 });
  assert.ok(order.indexOf(biased.bestSize) >= order.indexOf(base.bestSize));
});

test('the ease bias is clamped so it cannot run away with the answer', () => {
  const wild = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male', { easeBias: 999 });
  assert.strictEqual(wild.easeBias, 4);
  const other = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male', { easeBias: -999 });
  assert.strictEqual(other.easeBias, -4);
});

test('a garbage bias is treated as no bias', () => {
  const r = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male', { easeBias: 'lots' });
  assert.strictEqual(r.easeBias, 0);
});

/* ---------- real-world size labels ---------- */

test('a women\'s size carries US, UK and EU equivalents', () => {
  const r = FitEngine.analyze('dress', FEMALE_M, 'regular', null, null, 'female');
  const names = r.bestLabels.systems.map(s => s.name);
  assert.deepStrictEqual(names.sort(), ['EU', 'UK', 'US']);
});

test('a men\'s shirt carries a collar size', () => {
  const r = FitEngine.analyze('shirt', MALE_M, 'regular', null, null, 'male');
  const collar = r.bestLabels.systems.find(s => s.name === 'Collar');
  assert.ok(collar, 'no collar size on a men\'s shirt');
  assert.ok(/^\d+(\.\d+)?"$/.test(collar.value), 'odd collar value: ' + collar.value);
});

test('jeans are labelled W x L from the body, not from a letter', () => {
  const r = FitEngine.analyze('jeans', MALE_M, 'regular', null, null, 'male');
  const d = r.bestLabels.denim;
  assert.ok(d, 'no denim label on jeans');
  assert.strictEqual(d.waist, 32);   // 82cm waist -> 32"
  assert.strictEqual(d.inseam, 32);  // 80cm inseam -> 32"
  assert.strictEqual(d.label, 'W32 L32');
  assert.strictEqual(d.estimatedInseam, false);
});

test('leg length falls back to height and says so', () => {
  const noInseam = Object.assign({}, MALE_M);
  delete noInseam.inseam;
  const d = FitEngine.analyze('jeans', noInseam, 'regular', null, null, 'male').bestLabels.denim;
  assert.ok(d.inseam >= 28 && d.inseam <= 36, 'estimated inseam out of range: ' + d.inseam);
  assert.strictEqual(d.estimatedInseam, true);
});

test('denim sizing is skipped when there is no waist to work from', () => {
  assert.strictEqual(FitEngine.denimSize({ height: 175 }, 'M'), null);
});

test('tops get no denim label', () => {
  const r = FitEngine.analyze('tshirt', MALE_M, 'regular', null, null, 'male');
  assert.strictEqual(r.bestLabels.denim, null);
});

test('men\'s trousers are not labelled with a chest or jacket size', () => {
  // "Chest 38" / EU 48" is a jacket measurement and means nothing on a
  // pair of jeans — the W x L tag is the whole answer there.
  for (const type of ['jeans', 'shorts']) {
    const r = FitEngine.analyze(type, MALE_M, 'regular', null, null, 'male');
    assert.deepStrictEqual(r.bestLabels.systems, [], `${type} carried top-half sizes`);
    assert.ok(r.bestLabels.denim, `${type} lost its W x L label`);
  }
});

test('women\'s trousers keep their numeric sizes alongside W x L', () => {
  // Womenswear runs one numeric ladder that does cover bottoms.
  const r = FitEngine.analyze('jeans', FEMALE_M, 'regular', null, null, 'female');
  assert.deepStrictEqual(r.bestLabels.systems.map(s => s.name).sort(), ['EU', 'UK', 'US']);
  assert.ok(r.bestLabels.denim);
});

test('a skirt keeps numeric sizes and gets no denim tag', () => {
  const r = FitEngine.analyze('skirt', FEMALE_M, 'regular', null, null, 'female');
  assert.ok(r.bestLabels.systems.length);
  assert.strictEqual(r.bestLabels.denim, null);
});

/* ---------- unit conversion ---------- */

test('cm and inches round-trip', () => {
  assert.strictEqual(FitEngine.cmToIn(2.54), 1);
  assert.strictEqual(FitEngine.inToCm(1), 2.5);
});

/* ---------- hashing ---------- */

test('hashIndex is stable and stays in range', () => {
  for (const s of ['a', 'tshirt|M|88|regular', '', 'ünïcødé']) {
    const first = FitEngine.hashIndex(s, 3);
    assert.strictEqual(FitEngine.hashIndex(s, 3), first);
    assert.ok(first >= 0 && first < 3, `${s} -> ${first}`);
  }
});

/* ---------- silhouette ---------- */

test('silhouette notes are capped and shaped correctly', () => {
  const notes = FitEngine.silhouetteNotes({
    height: 195, chest: 110, waist: 78, hips: 104,
    shoulders: 56, armLength: 76, inseam: 95
  });
  assert.ok(notes.length <= 3);
  notes.forEach(n => {
    assert.ok(typeof n.label === 'string' && n.label);
    assert.ok(typeof n.note === 'string' && n.note);
  });
});

test('an empty body produces no silhouette notes and does not throw', () => {
  assert.deepStrictEqual(FitEngine.silhouetteNotes({}), []);
  assert.deepStrictEqual(FitEngine.silhouetteNotes(null), []);
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
console.log(`fit-engine: ${passed} tests passed`);
