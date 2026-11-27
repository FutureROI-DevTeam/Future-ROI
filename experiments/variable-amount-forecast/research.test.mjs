import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, predict } from '../../packages/prediction/dist/src/index.js';
import { calendar, calendarCdf, crossingWeights, forecast, HORIZON, PLAN, REMAINING } from './forecast.mjs';
import { evaluate, possibleArrivalDays, quantileDay, rps } from './evaluate.mjs';
import { syntheticWindow } from './benchmark.mjs';

const START = '2026-11-02';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
  'expected ' + expected + ', received ' + actual);

test('fixed positive quantities recover public M1 quantiles from either recorded start state', () => {
  for (const last of [0, PLAN]) {
    const history = [PLAN, PLAN, 0, 0, PLAN, null, PLAN, 0, PLAN, PLAN, last];
    const dates = calendar(START);
    const input = {
      today: dates.date(history.length - 1),
      goal: { initialProgress: 0, totalRequired: history.reduce((s, x) => s + (x ?? 0), REMAINING),
        sessionAmount: PLAN },
      logs: history.flatMap((amount, i) => amount === null ? [] : [{
        localDate: dates.date(i), status: amount ? 'DONE' : 'SKIPPED', amount: amount || null,
      }]),
    };
    const { completion } = predict(input, { ...DEFAULT_CONFIG, horizonDays: HORIZON });
    const { curves, fixedQuantiles } = forecast(START, history);
    assert.equal(fixedQuantiles.m1Empirical.p80Days, completion.p80Days);
    assert.equal(fixedQuantiles.m1Plan.p50Days, completion.p50Days);
    assert.equal(completion.scenario, 'CURRENT_STATE');
    assert.equal(quantileDay(curves.m1Plan, 0.5), completion.p50Days);
    assert.equal(quantileDay(curves.m1Plan, 0.8), completion.p80Days);
    assert.deepEqual(curves.m1Mean, curves.m1Plan);
    assert.deepEqual(curves.m1Empirical, curves.m1Plan);
  }
});

test('variable-amount M1 matches enumeration with one shared Beta draw per transition probability', () => {
  // History has one of each adjacent transition. Pooled positive amounts are 60 (1/3), 120 (2/3).
  const history = [60, 120, 0, 0, 120];
  const { curves } = forecast(START, history);
  const expected = Array(5).fill(0);
  // The Beta(2,2) priors plus this history give Beta(3,3) for both transition rows.
  // Updating the predictive counts along each hypothetical path integrates the shared draw exactly.
  function visit(day, done, sum, ways, mass) {
    if (sum >= REMAINING) {
      for (let i = day - 1; i < expected.length; i++) expected[i] += mass;
      return;
    }
    if (day === expected.length) return;
    const index = done ? 0 : 2;
    const p = ways[index] / (ways[index] + ways[index + 1]);
    const skipped = [...ways];
    skipped[index + 1]++;
    visit(day + 1, false, sum, skipped, mass * (1 - p));
    const continued = [...ways];
    continued[index]++;
    visit(day + 1, true, sum + 60, continued, mass * p / 3);
    visit(day + 1, true, sum + 120, continued, mass * p * 2 / 3);
  }
  visit(0, true, 0, [3, 3, 3, 3], 1);
  expected.forEach((value, i) => near(curves.m1Empirical[i], value));
});

test('weekday-dependent activity and quantity follow the simulated previous state', () => {
  const days = [false, true, false, true];
  const chance = (previous, weekend) => (previous ? 0.5 : 0.2) + 0.25 * weekend;
  const amount = weekend => weekend ? 3 : 1;
  const cdf = calendarCdf(false, days, chance, weekend => [[amount(weekend), 1]], 4);
  for (let t = 1; t <= days.length; t++) {
    let expected = 0;
    for (let path = 0; path < 2 ** t; path++) {
      let previous = 0;
      let total = 0;
      let mass = 1;
      for (let i = 0; i < t; i++) {
        const done = (path >> i) & 1;
        const probability = chance(previous, Number(days[i]));
        mass *= done ? probability : 1 - probability;
        if (done) total += amount(days[i]);
        previous = done;
      }
      if (total >= 4) expected += mass;
    }
    near(cdf[t - 1], expected);
  }
});

test('the fitted frequency learns a weekend pattern and the amount model uses only positive days', () => {
  const dates = calendar(START);
  const weekendOnly = Array.from({ length: 28 }, (_, i) => dates.weekend(i) ? REMAINING : 0);
  const curve = forecast(START, weekendOnly).curves.logisticEmpirical;
  // Every DONE crosses in one day, so the Friday and Saturday hazards after no arrival
  // compare fitted probabilities from the same preceding SKIPPED state.
  const hazard = i => (curve[i] - curve[i - 1]) / (1 - curve[i - 1]);
  assert.ok(hazard(5) > hazard(4) + 0.1);
  const mixed = Array.from({ length: 28 }, (_, i) => [5, 0, 0, 5, 0, REMAINING, 0][i % 7]);
  const { curves } = forecast(START, mixed);
  // Next Monday: eight short weekday DONEs; four pooled pseudo-counts give 1/3
  // of the overall probability of a single-session crossing.
  near(curves.logisticCalendarAmount[0] / curves.logisticEmpirical[0], 1 / 3);
});

test('unknown breaks adjacency and an unknown origin cannot be scored as a recorded rest day', () => {
  assert.equal(forecast(START, [0, 0, null, 30, null, 0]).reason, 'NO_DONE_ORIGIN_TRANSITION');
  assert.equal(forecast(START, [0, 0, 30, 30, null]).reason, 'UNKNOWN_ORIGIN');
  assert.ok(forecast(START, [0, 0, 30, 30, 0]).curves);
});

test('right tail remains present and a quantile unavailable within H stays null', () => {
  assert.deepEqual(crossingWeights([[1, 1]], 4, 3), [0, 0, 0]);
  const { curves } = forecast(START, [0, 1, 1, 0, 1, 0]);
  assert.ok(curves.m1Empirical.every(value => value === 0));
  assert.equal(quantileDay(curves.m1Empirical, 0.8), null);
  assert.equal(quantileDay([0.1, 0.8], 0.8), 2);
});

test('possible crossing days agree with enumerating every missing minute up to the target', () => {
  function completions(days, i, targets) {
    if (i === days.length) {
      let sum = 0;
      const crossing = days.findIndex(x => (sum += x) >= 3);
      targets.add(crossing < 0 ? days.length + 1 : crossing + 1);
    } else {
      for (const amount of days[i] === null ? [0, 1, 2, 3] : [days[i]]) {
        const filled = [...days];
        filled[i] = amount;
        completions(filled, i + 1, targets);
      }
    }
  }
  for (const a of [0, 1, 3, null]) for (const b of [0, 1, 3, null]) {
    for (const c of [0, 1, 3, null]) {
      const days = [a, b, c];
      const targets = new Set();
      completions(days, 0, targets);
      assert.deepEqual(possibleArrivalDays(days, 3), [...targets].sort((x, y) => x - y));
    }
  }
});

test('scoring uses the frozen past for different futures and pairs losses on the same feasible crossing', () => {
  const history = [5, 55, 0, 0, 55, 5, 0];
  const { curves } = forecast(START, history);
  const zero = Array(HORIZON).fill(0);
  for (const future of [zero, [REMAINING, ...zero.slice(1)], [null, ...zero.slice(1)]]) {
    const result = evaluate([{ startDate: START, history, future }]);
    const contrast = result.contrasts.find(x => x.model === 'm1Empirical' && x.reference === 'm1Plan');
    const possible = possibleArrivalDays(future, REMAINING);
    const deltas = possible.map(t => rps(curves.m1Empirical, t) - rps(curves.m1Plan, t));
    assert.deepEqual(contrast.deltaRps, [Math.min(...deltas), Math.max(...deltas)].map(x => Number(x.toFixed(6))));
    assert.equal(result.ambiguous, Number(possible.length > 1));
    assert.deepEqual(result.reachesByH, [Number(possible.at(-1) <= HORIZON), Number(possible[0] <= HORIZON)]);
  }
  const unsupported = evaluate([{ startDate: START, history: [null], future: zero }]);
  assert.equal(unsupported.issued, 0);
  assert.equal(unsupported.models.m1Plan.rps, null);
  assert.equal(unsupported.models.m1Plan.p80.reachedFractionAmongFinite, null);
});

test('fixed seed reproduces windows; invalid diary dates, quantities and follow-up are rejected', () => {
  assert.deepEqual(syntheticWindow('weekend', 7, 20), syntheticWindow('weekend', 7, 20));
  assert.notDeepEqual(syntheticWindow('weekend', 7, 20), syntheticWindow('weekend', 7, 21));
  assert.throws(() => forecast('2026-02-30', [0, 1]), /calendar date/);
  assert.throws(() => forecast(START, [0, -2]), /minutes/);
  assert.throws(() => evaluate([{ startDate: START, history: [0], future: [0] }]), /14 calendar days/);
});
