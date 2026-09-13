'use strict';
/* Style profile and the For You catalogue. No dependencies.
   Run:  node tests/test_style_profile.js */

const assert = require('assert');
const path = require('path');

const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};

const S = require(path.join(__dirname, '..', 'js', 'style-profile.js'));
const RECS = require(path.join(__dirname, '..', 'js', 'recs.js'));
const TYPES = ['tshirt', 'shirt', 'hoodie', 'jacket', 'dress', 'jeans', 'shorts', 'skirt'];

let passed = 0;
const failures = [];
function test(name, fn) { try { fn(); passed++; } catch (err) { failures.push({ name, err }); } }

const rec = (o) => Object.assign({ brand: 'B', name: 'N', types: ['tshirt'], gender: 'unisex', styles: ['minimalist'], tier: 2, url: 'https://x.test/' }, o);

/* ---------- normalising ---------- */

test('an empty profile is not done and shows everything', () => {
  const p = S.normalise(null);
  assert.deepStrictEqual(p, { gender: null, styles: [], budget: 'any', done: false, updatedAt: 0 });
});

test('unknown styles are dropped and duplicates collapse', () => {
  assert.deepStrictEqual(S.normalise({ gender: 'male', styles: ['streetwear', 'banana', 'streetwear'] }).styles, ['streetwear']);
});

test('no more than three styles are kept', () => {
  const p = S.normalise({ gender: 'female', styles: ['streetwear', 'office', 'boho', 'y2k', 'grunge'] });
  assert.deepStrictEqual(p.styles, ['streetwear', 'office', 'boho']);
});

test('a profile cannot be done without a gender answer', () => {
  assert.strictEqual(S.normalise({ done: true, styles: ['office'] }).done, false);
  assert.strictEqual(S.normalise({ done: true, gender: 'all' }).done, true);
});

test('a junk budget falls back to any', () => {
  assert.strictEqual(S.normalise({ budget: 'lots' }).budget, 'any');
  assert.strictEqual(S.normalise({ budget: 2 }).budget, '2');
});

/* ---------- storage ---------- */

test('guests keep the profile on the device', () => {
  S.save(null, { gender: 'female', styles: ['boho'], done: true });
  const p = S.load(null);
  assert.strictEqual(p.gender, 'female');
  assert.deepStrictEqual(p.styles, ['boho']);
  assert.ok(p.updatedAt > 0);
});

test('accounts keep it on the user record and save the user', () => {
  let saved = 0;
  const user = { prefs: { units: 'cm' } };
  const auth = { user: () => user, save: () => { saved++; } };
  S.save(auth, { gender: 'male', styles: ['office'], done: true });
  assert.strictEqual(user.prefs.style.gender, 'male');
  assert.strictEqual(user.prefs.units, 'cm', 'other prefs survive');
  assert.strictEqual(saved, 1);
  assert.strictEqual(S.load(auth).styles[0], 'office');
});

test('a guest who signs up keeps their answers until they change them', () => {
  S.save(null, { gender: 'female', styles: ['y2k'], done: true });
  const fresh = { user: () => ({ prefs: {} }), save() {} };
  assert.deepStrictEqual(S.load(fresh).styles, ['y2k']);
});

/* ---------- gender ---------- */

test('the chosen gender wins over the body profile', () => {
  assert.strictEqual(S.genderFor({ gender: 'all', done: true }, 'male'), 'all');
  assert.strictEqual(S.genderFor({}, 'female'), 'female');
  assert.strictEqual(S.genderFor({}, null), 'all');
});

test('someone shopping womenswear never sees a menswear entry', () => {
  const out = S.rank([rec({ gender: 'male' }), rec({ gender: 'female' }), rec({ gender: 'unisex' })], { gender: 'female', done: true });
  assert.deepStrictEqual(out.map(x => x.rec.gender).sort(), ['female', 'unisex']);
});

test('menswear shoppers never see dresses or skirts', () => {
  const out = S.rank([rec({ types: ['dress'] }), rec({ types: ['skirt'] }), rec({ types: ['jeans'] })], { gender: 'male', done: true });
  assert.deepStrictEqual(out.map(x => x.rec.types[0]), ['jeans']);
});

test('a unisex shop listing a dress among other things still reaches men', () => {
  const out = S.rank([rec({ types: ['jacket', 'dress'] })], { gender: 'male', done: true });
  assert.strictEqual(out.length, 1);
});

test('show me both shows both', () => {
  assert.strictEqual(S.rank([rec({ gender: 'male' }), rec({ gender: 'female', types: ['dress'] })], { gender: 'all', done: true }).length, 2);
});

/* ---------- ranking ---------- */

test('the style named first outranks the style named second', () => {
  const out = S.rank([rec({ name: 'office', styles: ['office'] }), rec({ name: 'street', styles: ['streetwear'] })],
    { gender: 'all', styles: ['streetwear', 'office'], done: true });
  assert.deepStrictEqual(out.map(x => x.rec.name), ['street', 'office']);
});

test('matching two chosen styles beats matching one', () => {
  const out = S.rank([rec({ name: 'one', styles: ['streetwear'] }), rec({ name: 'two', styles: ['office', 'streetwear'] })],
    { gender: 'all', styles: ['streetwear', 'office'], done: true });
  assert.strictEqual(out[0].rec.name, 'two');
  assert.deepStrictEqual(out[0].matched, ['streetwear', 'office']);
});

test('budget: a match helps, two steps off hurts', () => {
  const out = S.rank([rec({ name: 'premium', tier: 3 }), rec({ name: 'budget', tier: 1 })], { gender: 'all', budget: '1', done: true });
  assert.strictEqual(out[0].rec.name, 'budget');
  assert.ok(out[1].score < 0);
});

test('the garment just checked moves to the front', () => {
  const out = S.rank([rec({ name: 'tee' }), rec({ name: 'jeans', types: ['jeans'] })], { gender: 'all', done: true }, { type: 'jeans' });
  assert.strictEqual(out[0].rec.name, 'jeans');
});

test('a fit that clashes with the fit preference sinks', () => {
  const out = S.rank([rec({ name: 'slimonly', fits: ['slim'] }), rec({ name: 'any' })], { gender: 'all', done: true }, { fitPref: 'relaxed' });
  assert.strictEqual(out[0].rec.name, 'any');
});

test('ties keep catalogue order', () => {
  const out = S.rank([rec({ name: 'a' }), rec({ name: 'b' }), rec({ name: 'c' })], { gender: 'all', done: true });
  assert.deepStrictEqual(out.map(x => x.rec.name), ['a', 'b', 'c']);
});

test('the reason line names the matched styles', () => {
  const [top] = S.rank([rec({ styles: ['grunge', 'vintage'] })], { gender: 'all', styles: ['vintage', 'grunge'], done: true });
  assert.strictEqual(S.reason(top), 'Vintage & retro · Grunge & rock');
});

test('summary reads like a sentence fragment', () => {
  assert.strictEqual(S.summary({ gender: 'female', styles: ['streetwear', 'y2k'], budget: '1', done: true }), 'Female · Streetwear, Y2K · €');
  assert.strictEqual(S.summary({}), '');
});

/* ---------- the real catalogue ---------- */

test('every catalogue entry is valid', () => {
  const p = S.problems(RECS, TYPES);
  assert.deepStrictEqual(p, [], '\n  ' + p.join('\n  '));
});

test('every style has shops, and every style that suits both has shops for both', () => {
  const femaleOnlyStyles = ['romantic', 'boho'];
  S.STYLES.forEach(st => {
    const f = S.forStyle(RECS, { gender: 'female', done: true }, st.id).length;
    const m = S.forStyle(RECS, { gender: 'male', done: true }, st.id).length;
    assert.ok(f >= 1, `${st.id} has nothing for women`);
    if (femaleOnlyStyles.indexOf(st.id) === -1) assert.ok(m >= 1, `${st.id} has nothing for men`);
  });
});

test('both sides of the shop are covered for every garment they wear', () => {
  TYPES.forEach(t => {
    assert.ok(S.forType(RECS, { gender: 'female', done: true }, t).length >= 1, `no women's ${t}`);
    if (S.typeAllowed(t, 'male')) assert.ok(S.forType(RECS, { gender: 'male', done: true }, t).length >= 1, `no men's ${t}`);
  });
});

test('a woman checking a T-shirt is no longer sent to menswear', () => {
  const top = S.forType(RECS, { gender: 'female', done: true }, 'tshirt', { type: 'tshirt' });
  assert.ok(top.length >= 3);
  assert.ok(top.every(x => x.rec.gender !== 'male'));
  assert.ok(!top.some(x => /\/men\//.test(x.rec.url)), 'a women’s pick links to a /men/ page');
});

test('a men’s entry never links to a women’s section, and vice versa', () => {
  RECS.forEach(r => {
    if (r.gender === 'male') assert.ok(!/\/(women|ladies|dam)\b/i.test(r.url), `${r.brand} ${r.name} → ${r.url}`);
    if (r.gender === 'female') assert.ok(!/\/(men|herr)\b/i.test(r.url), `${r.brand} ${r.name} → ${r.url}`);
  });
});

/* ---------- report ---------- */

if (failures.length) {
  console.error(`\n${passed} passed, ${failures.length} FAILED\n`);
  failures.forEach(f => console.error(`  ✗ ${f.name}\n      ${f.err.message}`));
  process.exit(1);
}
console.log(`style profile: ${passed} tests passed`);
