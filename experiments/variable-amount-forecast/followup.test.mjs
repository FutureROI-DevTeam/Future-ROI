import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFeatures, trainAnalog } from './analog.mjs';
import { evaluate, rps } from './evaluate.mjs';
import { forecast, HORIZON, REMAINING } from './forecast.mjs';
import { evaluatePersonal, personalForecast } from './personal.mjs';

const startDate = '2016-04-04';
const history = [30, null, 0, 60, 0, 30, 0];
const empty = Array(HORIZON).fill(0);
const dayOne = [REMAINING, ...empty.slice(1)];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, a + ' differs from ' + b);

test('history features break transitions at unknown days and repeat on the same weekday', () => {
  const x = historyFeatures(startDate, history);
  assert.deepEqual(x.slice(0, 3), [0.5, 0.75, 0.25]);
  near(x[3], (2 * Math.log(2) + Math.log(3)) / 3);
  assert.deepEqual(historyFeatures('2016-04-11', history), x);
  assert.equal(historyFeatures(startDate, [0, 0, 0]), null);
  assert.equal(historyFeatures(startDate, [30, null]), null);
});

test('a tie at the kth distance shares mass, including after day 14, in either input order', () => {
  const dayThree = [0, 0, REMAINING, ...empty.slice(3)];
  const rows = [dayOne, empty, dayThree].map(future => ({ startDate, history, future }));
  for (const ordered of [rows, [...rows].reverse()]) {
    const learned = trainAnalog(ordered, 7, 2);
    const cdf = learned.predict(startDate, history);
    near(cdf[0], 1 / 3);
    near(cdf[1], 1 / 3);
    for (const p of cdf.slice(2)) near(p, 2 / 3);
  }
  assert.throws(() => trainAnalog(rows, 7, 4), /Too few/);
  assert.throws(() => trainAnalog([{ startDate, history, future: [null, ...empty.slice(1)] }], 7, 1), /Complete/);
});

test('closest known history selects its own training outcome and the blend sees only the query prefix', () => {
  const longer = [180, 180, 180, 0, 0, 180, 180];
  const model = trainAnalog([{ startDate, history, future: empty }, { startDate, history: longer, future: dayOne }], 7, 1);
  assert.ok(model.predict(startDate, history).every(x => x === 0));
  assert.ok(model.predict(startDate, longer).every(x => x === 1));
  assert.throws(() => model.predict(startDate, longer.slice(1)), /history length/);
  const personal = forecast(startDate, history).curves.m1Empirical;
  const mixed = personal.map(p => p / 2);
  for (const [future, arrival] of [[empty, HORIZON + 1], [dayOne, 1]]) {
    const report = evaluate([{ startDate, history, future }], (...args) => {
      assert.deepEqual(args, [startDate, history]);
      return model.predict(...args);
    });
    const delta = report.contrasts.find(row => row.model === 'analogBlend' && row.reference === 'm1Empirical');
    assert.equal(delta.deltaRps[0], Number((rps(mixed, arrival) - rps(personal, arrival)).toFixed(6)));
  }
});

test('the beta-binomial forecast matches exact first-session probabilities and ignores an unrecorded day', () => {
  const a = personalForecast([0, null, 180, 180]).curves.iidEmpirical;
  assert.deepEqual(a, personalForecast([0, 180, 180]).curves.iidEmpirical);
  // Two sessions and one recorded rest produce a Beta(3,2) posterior.
  let noSession = 1;
  for (let i = 0; i < HORIZON; i++) {
    noSession *= (2 + i) / (5 + i);
    near(a[i], 1 - noSession);
  }
  const fixed = personalForecast([30, 0, 30]).curves;
  fixed.iidEmpirical.forEach((x, i) => near(x, fixed.iidPlan[i]));
  assert.equal(personalForecast([30, null]).reason, 'UNKNOWN_ORIGIN');
  assert.equal(personalForecast([0, null, 0]).reason, 'NO_OBSERVED_AMOUNT');
});

test('beta-binomial count and variable session amounts match enumerating raw activity paths', () => {
  const curve = personalForecast([60, 120, 0, 0]).curves.iidEmpirical;
  const expected = [0, 0, 0];
  function visit(depth, done, sum, mass) {
    if (sum >= REMAINING) {
      for (let i = depth - 1; i < 3; i++) expected[i] += mass;
      return;
    }
    if (depth === 3) return;
    const p = (3 + done) / (6 + depth);
    visit(depth + 1, done, sum, mass * (1 - p));
    for (const amount of [60, 120]) visit(depth + 1, done + 1, sum + amount, mass * p / 2);
  }
  visit(0, 0, 0, 1);
  expected.forEach((p, i) => near(curve[i], p));
});

test('additional predictions are scored only on previously ineligible people, preserving missing outcomes', () => {
  const future = [null, ...empty.slice(1)];
  const windows = [history, Array(7).fill(30), Array(7).fill(0), [...history.slice(1), null]]
    .map(past => ({ startDate, history: past, future }));
  const { common, additional } = evaluatePersonal(windows);
  assert.equal(common.windows, 4);
  assert.equal(common.issued, 1);
  assert.equal(additional.windows, 3);
  assert.equal(additional.issued, 1);
  assert.deepEqual(additional.notIssued, { NO_OBSERVED_AMOUNT: 1, UNKNOWN_ORIGIN: 1 });
  assert.equal(additional.ambiguous, 1);
  assert.equal(additional.contrasts[0].pairedApproxCI95, null);
  assert.deepEqual(additional.contrasts[0].deltaRps, [0, 0]);
});
