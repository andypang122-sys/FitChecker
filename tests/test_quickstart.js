'use strict';
/* Quick start ("a size I wear"), estimate penalties, honest brand
   wording, and the paid-tier switch. No DOM, no dependencies.
   Run:  node tests/test_quickstart.js */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = f => path.join(__dirname, '..', 'js', f);
const FitEngine = require(JS('fit-engine.js'));
global.FitEngine = FitEngine;
const Brands = require(JS('brands.js'));
global.Brands = Brands;
const QuickStart = require(JS('quickstart.js'));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, err }); }
}

/* ---------- QuickStart.estimate ---------- */

test('a generic men\'s M estimates the body the M column is cut for', () => {
  const e = QuickStart.estimate({ sex: 'male', size: 'M', brandId: 'generic', heightCm: 178 });
  const top = FitEngine.chartFor('tshirt', 'male').sizes.M;
  const bottom = FitEngine.chartFor('jeans', 'male').sizes.M;
  assert.strictEqual(e.chest, top.chest);
  assert.strictEqual(e.waist, bottom.waist, 'waist comes from the trouser chart');
  assert.strictEqual(e.hips, bottom.hips);
  assert.strictEqual(e.height, 178);
});

test('round trip: the size you said you wear is the size you get back', () => {
  for (const sex of ['male', 'female']) {
    for (const size of ['S', 'M', 'L']) {
      const e = QuickStart.estimate({ sex, size, brandId: 'generic', heightCm: 172 });
      const r = FitEngine.analyze('tshirt', e, 'regular', null, null, sex);
      assert.strictEqual(r.bestSize, size, sex + ' ' + size);
    }
  }
});

test('the brand matters: an M at a small-running brand is a smaller body', () => {
  const std = QuickStart.estimate({ sex: 'male', size: 'M', brandId: 'generic', heightCm: 178 });
  const uni = QuickStart.estimate({ sex: 'male', size: 'M', brandId: 'uniqlo', heightCm: 178 });
  const cos = QuickStart.estimate({ sex: 'male', size: 'M', brandId: 'cos', heightCm: 178 });
  assert.ok(uni.chest < std.chest, 'Uniqlo runs small');
  assert.ok(cos.chest > std.chest, 'COS runs large');
});

test('refuses to guess without a sex or a real size', () => {
  assert.strictEqual(QuickStart.estimate({ size: 'M' }), null);
  assert.strictEqual(QuickStart.estimate({ sex: 'male', size: 'XXXL' }), null);
  assert.strictEqual(QuickStart.estimate({ sex: 'male' }), null);
});

test('an unknown brand falls back to the standard chart', () => {
  const std = QuickStart.estimate({ sex: 'female', size: 'M', brandId: 'generic' });
  const unk = QuickStart.estimate({ sex: 'female', size: 'M', brandId: 'no-such-brand' });
  assert.deepStrictEqual(unk, std);
});

/* ---------- estimate penalty ---------- */

const BODY = { height: 178, chest: 100, waist: 86, hips: 98 };

test('an estimate costs confidence, and is reported apart from age', () => {
  const plain = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male');
  const est = FitEngine.analyze('tshirt', BODY, 'regular', null, null, 'male',
                                { estimatePenalty: QuickStart.PENALTY.size });
  assert.strictEqual(plain.confidence - est.confidence, QuickStart.PENALTY.size);
  assert.strictEqual(est.estimatePenalty, QuickStart.PENALTY.size);
  assert.strictEqual(est.stalePenalty, 0, 'not blamed on the age of the numbers');
  assert.strictEqual(est.bestSize, plain.bestSize, 'the size itself does not move');
});

test('a brand comparison keeps the penalties instead of dropping them', () => {
  const opts = { estimatePenalty: 20, confidencePenalty: 10 };
  const without = Brands.compare('tshirt', BODY, 'regular', 'male', 'uniqlo');
  const withP = Brands.compare('tshirt', BODY, 'regular', 'male', 'uniqlo', opts);
  assert.ok(withP.confidence.value < without.confidence.value,
    'confidence shown for a brand must reflect estimated / old measurements');
});

test('a brand comparison uses the wearer\'s own fit calibration', () => {
  // A large enough "I always need more room" bias must be able to move
  // the headline, or the line can argue with the size beside it.
  const loose = Brands.compare('tshirt', BODY, 'regular', 'male', 'generic', { easeBias: 4 });
  const main = FitEngine.analyze('tshirt', BODY, 'regular', null,
    Brands.chartFor('generic', 'tshirt', 'male'), 'male', { easeBias: 4 });
  assert.strictEqual(loose.brandSize, main.bestSize);
});

/* ---------- honest brand wording ---------- */

test('modelled brands are flagged as estimates; nothing claims "most people"', () => {
  for (const b of Brands.list()) {
    const d = Brands.drift(b.id, 'tshirt');
    assert.ok(!/most people/i.test(d.advice), b.id + ': ' + d.advice);
    if (b.confidence === 'modelled') assert.strictEqual(d.estimate, true, b.id);
  }
});

test('the headline says "by our estimate" for a modelled brand', () => {
  // 98cm chest: a standard M that Uniqlo's smaller cut pushes to L.
  const body = Object.assign({}, BODY, { chest: 98, waist: 84 });
  const cmp = Brands.compare('tshirt', body, 'regular', 'male', 'uniqlo');
  assert.strictEqual(cmp.shift, 1, cmp.line);
  assert.ok(/by our estimate/i.test(cmp.line), cmp.line);
});

test('Trissan does not claim an exact first-party chart it does not have yet', () => {
  const t = Brands.get('trissan');
  assert.notStrictEqual(t.confidence, 'first-party');
  const c = Brands.chartFor('trissan', 'tshirt', 'male');
  const std = Brands.chartFor('generic', 'tshirt', 'male');
  assert.deepStrictEqual(c.sizes, std.sizes, 'no invented offsets');
});

/* ---------- the paid-tier switch ---------- */

function loadMoney(appConfig, hostname) {
  const store = {};
  const toasts = [];
  const sandbox = {
    window: { APP_CONFIG: appConfig, __toast: m => toasts.push(m) },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    location: { hostname: hostname || 'fitchecker.example' },
    URL
    // no `document`: anything that tries to draw a paywall throws
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(JS('monetize.js'), 'utf8'), sandbox);
  return { Money: sandbox.window.Money, toasts };
}

test('paid:false opens everything and renders nothing that sells', () => {
  const { Money } = loadMoney({ id: 'fitcheck', name: 'FitChecker', money: { paid: false } });
  assert.strictEqual(Money.paidOn(), false);
  assert.strictEqual(Money.isPro(), true);
  assert.strictEqual(Money.canUse(), true);
  assert.strictEqual(Money.remaining(), Infinity);
  assert.strictEqual(Money.creditsBadgeHTML(), '');
  assert.strictEqual(Money.proCardHTML(), '');
  assert.strictEqual(Money.bannerHTML('more'), '');
  let granted = false;
  Money.showPaywall(() => { granted = true; });   // must not touch the DOM
  assert.ok(granted, 'the action the paywall stood in front of goes ahead');
});

test('paid tier on by default, with the daily meter', () => {
  const { Money } = loadMoney({ id: 'fitcheck', name: 'FitChecker', money: { freePerDay: 5 } });
  assert.strictEqual(Money.paidOn(), true);
  assert.strictEqual(Money.isPro(), false);
  assert.strictEqual(Money.remaining(), 5);
});

test('no checkout link never hands a real user the free "testing" unlock', () => {
  const { Money, toasts } = loadMoney({ id: 'fitcheck', name: 'FitChecker', money: {} },
                                      'fitchecker-p4xe.onrender.com');
  Money.startCheckout('annual');                  // would throw if it drew the dev modal
  assert.strictEqual(Money.isPro(), false);
  assert.ok(toasts.some(t => /isn't on sale yet/.test(t)), toasts.join('|'));
});

/* ---------- report ---------- */

if (failures.length) {
  for (const f of failures) {
    console.error('✕ ' + f.name);
    console.error('  ' + (f.err && f.err.stack || f.err));
  }
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`quick start: ${passed} passed`);
