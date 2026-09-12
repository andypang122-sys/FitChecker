'use strict';
/* ============================================================
   STALENESS — how old are these measurements, and does it matter?

   THE FAILURE THIS FIXES. Measurements are typed once and then
   trusted forever. Bodies do not hold still: a year on, a waist
   is rarely the number it was, and every verdict in the app is
   computed from it. The app carried on answering with the same
   confidence it had on day one, which is the worst way to be
   wrong — quietly, and about the input rather than the maths.

   Nothing here guesses at the new number. It cannot know. What
   it does is say how old the evidence is, take that off the
   confidence, and ask for a re-measure at a sensible interval.

   Pure functions, no DOM, no storage — so the bands and the
   penalty curve can be tested directly.
   ============================================================ */

const Staleness = (() => {

  const DAY = 86400000;

  /* Bands. Chosen against how fast the answer actually moves rather
     than a round number: a garment verdict turns on centimetres, and a
     few centimetres at the waist is a season of ordinary life. Under
     six months the numbers are usually still good; past a year they
     should not be relied on without a fresh look. */
  const FRESH_DAYS = 180;
  const STALE_DAYS = 365;

  /* The penalty curve. It starts at zero — nagging someone whose
     measurements are three months old teaches them to ignore the
     warning — then climbs once past the fresh window, and stops at 25
     so an old measurement never collapses a verdict into noise. Old
     numbers are worse than new ones, not worthless. */
  const MAX_PENALTY = 25;
  const PENALTY_PER_DAY = 25 / 545;   // reaches the cap ~2 years out

  const REMIND_KIND = 'measure-refresh';
  // Asked twice a year, matching the fresh window. Often enough to keep
  // the numbers honest, rare enough that it is not noise.
  const REMIND_EVERY_DAYS = FRESH_DAYS;

  function days(measuredAt, nowMs) {
    const t = Number(measuredAt);
    if (!isFinite(t) || t <= 0) return null;      // never recorded
    const ms = (nowMs == null ? Date.now() : nowMs) - t;
    if (ms < 0) return 0;                          // clock skew — treat as today
    return Math.floor(ms / DAY);
  }

  function band(d) {
    if (d == null) return 'unknown';
    if (d < FRESH_DAYS) return 'fresh';
    if (d < STALE_DAYS) return 'ageing';
    return 'stale';
  }

  /* How many confidence points to take off. An unknown date is treated
     as ageing rather than fresh: if we never recorded when these were
     taken, that is not evidence they are new. */
  function confidencePenalty(d) {
    if (d == null) return Math.round(MAX_PENALTY / 2);
    if (d < FRESH_DAYS) return 0;
    return Math.min(MAX_PENALTY, Math.round((d - FRESH_DAYS) * PENALTY_PER_DAY));
  }

  /* "8 months", "2 years" — the span, not a date. The point is elapsed
     time, and "March 2024" makes the reader do the subtraction. */
  function ageLabel(d) {
    if (d == null) return 'an unknown time';
    if (d < 1) return 'today';
    if (d < 14) return d + ' day' + (d === 1 ? '' : 's');
    if (d < 60) return Math.round(d / 7) + ' weeks';
    if (d < 365) return Math.round(d / 30) + ' months';
    const years = d / 365;
    const rounded = Math.round(years * 10) / 10;
    return (rounded === Math.round(rounded) ? Math.round(rounded) : rounded) +
           ' year' + (rounded === 1 ? '' : 's');
  }

  /* One sentence, or null when there is nothing worth saying. Never
     claims the measurements are wrong — only that they are old, which
     is the only thing we actually know. */
  function notice(d) {
    const b = band(d);
    if (b === 'fresh') return null;
    if (b === 'unknown') {
      return 'These measurements have no date on them, so this verdict may be working from old numbers. Worth re-checking.';
    }
    if (b === 'ageing') {
      return `Your measurements are ${ageLabel(d)} old. Bodies move — re-measure and this gets sharper.`;
    }
    return `Your measurements are ${ageLabel(d)} old. That is long enough for the answer to be wrong. Re-measure before trusting this.`;
  }

  // Short form for a chip or a list row.
  function shortLabel(d) {
    const b = band(d);
    if (b === 'unknown') return 'Undated';
    if (d < 1) return 'Measured today';
    if (b === 'fresh') return 'Measured ' + ageLabel(d) + ' ago';
    return ageLabel(d) + ' old';
  }

  /* The whole state in one object, so callers do not re-derive it. */
  function check(measuredAt, nowMs) {
    const d = days(measuredAt, nowMs);
    const b = band(d);
    return {
      days: d,
      band: b,
      stale: b === 'stale',
      ageing: b === 'ageing' || b === 'unknown',
      needsAttention: b !== 'fresh',
      penalty: confidencePenalty(d),
      notice: notice(d),
      label: shortLabel(d)
    };
  }

  /* When to ask again. Someone whose numbers are already old should be
     asked now, not in six months' time. */
  function nextCheckDays(measuredAt, nowMs) {
    const d = days(measuredAt, nowMs);
    if (d == null) return 0;
    return Math.max(0, REMIND_EVERY_DAYS - d);
  }

  /* Whether a re-measure actually changed anything. Used so that saving
     a profile without touching the numbers does not reset the clock and
     quietly bless year-old data as fresh. */
  const TRACKED = ['height', 'weight', 'chest', 'waist', 'hips',
                   'shoulders', 'armLength', 'inseam', 'thigh'];

  function changed(before, after) {
    if (!before) return true;
    for (const k of TRACKED) {
      const a = before[k], b = after ? after[k] : undefined;
      const an = (a === '' || a == null) ? null : Number(a);
      const bn = (b === '' || b == null) ? null : Number(b);
      if (an == null && bn == null) continue;
      if (an == null || bn == null) return true;
      if (Math.abs(an - bn) > 0.05) return true;   // ignore float noise
    }
    return false;
  }

  return { check, days, band, confidencePenalty, ageLabel, notice, shortLabel,
           nextCheckDays, changed, TRACKED,
           FRESH_DAYS, STALE_DAYS, MAX_PENALTY, REMIND_KIND, REMIND_EVERY_DAYS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Staleness;
if (typeof window !== 'undefined') window.Staleness = Staleness;
