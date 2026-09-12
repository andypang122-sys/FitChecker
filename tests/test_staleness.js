'use strict';
/* Measurement-staleness tests.
   Run:  node tests/test_staleness.js */

const assert = require('assert');
const path = require('path');

const Staleness = require(path.join(__dirname, '..', 'js', 'staleness.js'));
const FitEngine = require(path.join(__dirname, '..', 'js', 'fit-engine.js'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, err }); }
}

const DAY = 86400000;
const NOW = Date.parse('2026-06-01T12:00:00Z');
const daysAgo = d => NOW - d * DAY;
const at = d => Staleness.check(daysAgo(d), NOW);

/* ---------- bands ---------- */

test('recent measurements are fresh and cost nothing', () => {
  for (const d of [0, 1, 30, 90, 179]) {
    const s = at(d);
    assert.strictEqual(s.band, 'fresh', d + ' days was ' + s.band);
    assert.strictEqual(s.penalty, 0);
    assert.strictEqual(s.notice, null, 'fresh should say nothing');
    assert.strictEqual(s.needsAttention, false);
  }
});

test('the fresh window ends at six months, not before', () => {
  assert.strictEqual(at(179).band, 'fresh');
  assert.strictEqual(at(180).band, 'ageing');
});

test('past a year the numbers are called stale', () => {
  assert.strictEqual(at(364).band, 'ageing');
  assert.strictEqual(at(365).band, 'stale');
  assert.strictEqual(at(365).stale, true);
});

/* ---------- the penalty curve ---------- */

test('the penalty starts at zero rather than nagging immediately', () => {
  // A warning that fires at three months is a warning people learn to
  // scroll past.
  assert.strictEqual(at(90).penalty, 0);
  assert.strictEqual(at(180).penalty, 0);
});

test('the penalty grows with age', () => {
  let last = -1;
  for (const d of [180, 250, 365, 500, 700, 900]) {
    const p = at(d).penalty;
    assert.ok(p >= last, `penalty fell from ${last} to ${p} at ${d} days`);
    last = p;
  }
});

test('the penalty is capped so old numbers are never worthless', () => {
  for (const d of [900, 2000, 20000]) {
    assert.strictEqual(at(d).penalty, Staleness.MAX_PENALTY, 'at ' + d + ' days');
  }
});

test('an undated measurement is treated as ageing, not as fresh', () => {
  // No date is not evidence of newness.
  const s = Staleness.check(null, NOW);
  assert.strictEqual(s.band, 'unknown');
  assert.ok(s.penalty > 0);
  assert.ok(s.penalty < Staleness.MAX_PENALTY);
  assert.ok(s.needsAttention);
});

test('garbage and future timestamps do not break the maths', () => {
  for (const bad of [undefined, '', 'yesterday', NaN, 0, -1]) {
    const s = Staleness.check(bad, NOW);
    assert.strictEqual(s.band, 'unknown', String(bad));
  }
  // Clock skew: a measurement "from tomorrow" is today, not negative days.
  const future = Staleness.check(NOW + 10 * DAY, NOW);
  assert.strictEqual(future.days, 0);
  assert.strictEqual(future.band, 'fresh');
});

/* ---------- what it says ---------- */

test('fresh measurements produce no notice at all', () => {
  assert.strictEqual(at(30).notice, null);
});

test('ageing and stale each get their own wording', () => {
  const ageing = at(200).notice;
  const stale = at(500).notice;
  assert.ok(ageing && stale);
  assert.notStrictEqual(ageing, stale);
  // The stale one has to be blunter — that is the whole point of the band.
  assert.ok(/wrong/i.test(stale), stale);
});

test('the age is described as elapsed time, not a date', () => {
  assert.strictEqual(Staleness.ageLabel(0), 'today');
  assert.strictEqual(Staleness.ageLabel(3), '3 days');
  assert.strictEqual(Staleness.ageLabel(1), '1 day');
  assert.strictEqual(Staleness.ageLabel(28), '4 weeks');
  assert.strictEqual(Staleness.ageLabel(180), '6 months');
  assert.strictEqual(Staleness.ageLabel(365), '1 year');
  assert.strictEqual(Staleness.ageLabel(730), '2 years');
});

test('the short label never reads "today ago"', () => {
  assert.strictEqual(Staleness.shortLabel(0), 'Measured today');
  assert.ok(!/today ago/.test(Staleness.shortLabel(0)));
  assert.strictEqual(Staleness.shortLabel(null), 'Undated');
});

/* ---------- when to ask again ---------- */

test('a fresh measurement pushes the next ask out', () => {
  assert.strictEqual(Staleness.nextCheckDays(daysAgo(0), NOW), Staleness.REMIND_EVERY_DAYS);
  assert.strictEqual(Staleness.nextCheckDays(daysAgo(30), NOW), Staleness.REMIND_EVERY_DAYS - 30);
});

test('already-old measurements are asked about immediately', () => {
  assert.strictEqual(Staleness.nextCheckDays(daysAgo(400), NOW), 0);
});

/* ---------- did the numbers actually change? ---------- */

test('an identical body is not a re-measure', () => {
  // Fixing a typo in a profile name must not reset the clock and bless
  // two-year-old numbers as fresh.
  const b = { height: 175, chest: 96, waist: 82, hips: 96 };
  assert.strictEqual(Staleness.changed(b, Object.assign({}, b)), false);
});

test('any real change counts as a re-measure', () => {
  const b = { height: 175, chest: 96, waist: 82 };
  assert.ok(Staleness.changed(b, Object.assign({}, b, { waist: 84 })));
  assert.ok(Staleness.changed(b, Object.assign({}, b, { thigh: 58 })));
  assert.ok(Staleness.changed({ chest: 96, waist: 82 }, { chest: 96 }));
});

test('floating-point noise is not a change', () => {
  assert.strictEqual(Staleness.changed({ chest: 96 }, { chest: 96.01 }), false);
  assert.ok(Staleness.changed({ chest: 96 }, { chest: 96.5 }));
});

test('empty strings and nulls are the same absent value', () => {
  assert.strictEqual(Staleness.changed({ thigh: null }, { thigh: '' }), false);
  assert.strictEqual(Staleness.changed({ thigh: undefined }, { thigh: null }), false);
});

test('a first-ever measurement always counts as a change', () => {
  assert.ok(Staleness.changed(null, { chest: 96 }));
});

/* ---------- the engine honours the penalty ---------- */

const BODY = {
  height: 175, chest: 96, waist: 82, hips: 96,
  shoulders: 45, armLength: 64, inseam: 80, thigh: 58
};

test('a stale penalty lowers reported confidence', () => {
  const fresh = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male');
  const old = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male',
                                { confidencePenalty: 25 });
  assert.strictEqual(old.confidence, fresh.confidence - 25);
  assert.strictEqual(old.stalePenalty, 25);
});

test('the penalty never changes the recommended size', () => {
  // Age is doubt about the input, not a different answer.
  const fresh = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male');
  const old = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male',
                                { confidencePenalty: 25 });
  assert.strictEqual(old.bestSize, fresh.bestSize);
  assert.strictEqual(old.score, fresh.score);
});

test('confidence never falls below the floor', () => {
  const r = FitEngine.analyze('jeans', { height: 175 }, 'regular', null, null, 'male',
                              { confidencePenalty: 40 });
  assert.ok(r.confidence >= 5, 'got ' + r.confidence);
});

test('a garbage or negative penalty is ignored', () => {
  const base = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male').confidence;
  for (const bad of ['old', null, -30, undefined]) {
    const r = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male',
                                { confidencePenalty: bad });
    assert.strictEqual(r.confidence, base, 'penalty ' + bad);
  }
});

test('an absurd penalty is clamped rather than trusted', () => {
  const r = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male',
                              { confidencePenalty: 9999 });
  assert.strictEqual(r.stalePenalty, 40);
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
console.log(`staleness: ${passed} tests passed`);
