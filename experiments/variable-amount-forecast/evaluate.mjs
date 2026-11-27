import { checkAmounts, forecast, HORIZON, REMAINING } from './forecast.mjs';

const MODELS = ['m1Plan', 'm1Mean', 'm1Empirical', 'logisticPlan', 'logisticEmpirical', 'logisticCalendarAmount'];
const CONTRASTS = [
  ['m1Mean', 'm1Plan'], ['m1Empirical', 'm1Mean'], ['m1Empirical', 'm1Plan'],
  ['logisticPlan', 'm1Plan'], ['logisticEmpirical', 'm1Empirical'],
  ['logisticEmpirical', 'logisticPlan'], ['logisticCalendarAmount', 'logisticEmpirical'],
  ['logisticCalendarAmount', 'm1Plan'],
];

// For an unknown day, any nonnegative integer amount is consistent with the diary.
// Enumerate feasible first crossings, including the single outcome "later than H".
export function possibleArrivalDays(future, remaining) {
  let minimum = 0;
  let earlierUnknown = false;
  const possible = [];
  for (const [i, amount] of future.entries()) {
    if (amount === null || (amount > 0 && (earlierUnknown || minimum + amount >= remaining))) {
      possible.push(i + 1);
    }
    if (amount === null) earlierUnknown = true;
    else minimum += amount;
    if (minimum >= remaining) return possible;
  }
  possible.push(future.length + 1);
  return possible;
}

export function quantileDay(cdf, probability) {
  const index = cdf.findIndex(value => value + 1e-12 >= probability);
  return index < 0 ? null : index + 1;
}

export function rps(cdf, arrival) {
  return cdf.reduce((sum, value, i) => sum + (value - Number(i + 1 >= arrival)) ** 2, 0) / cdf.length;
}

function bounds(values) {
  return [Math.min(...values), Math.max(...values)];
}

function addPair(total, pair) {
  total[0] += pair[0];
  total[1] += pair[1];
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function average(pair, denominator) {
  return denominator ? pair.map(value => rounded(value / denominator)) : null;
}

function coverage() {
  return { finite: 0, hits: [0, 0] };
}

function summarizeCoverage(metric, issued) {
  return {
    finite: metric.finite,
    finiteRate: issued ? rounded(metric.finite / issued) : null,
    reachedFractionAmongFinite: average(metric.hits, metric.finite),
  };
}

export function evaluate(windows) {
  if (!Array.isArray(windows) || !windows.length) throw new Error('Provide at least one diary window');
  const scores = Object.fromEntries(MODELS.map(name =>
    [name, { losses: [0, 0], p50: coverage(), p80: coverage() }]));
  const paired = CONTRASTS.map(([model, reference]) =>
    ({ model, reference, differences: [0, 0], sumSquares: 0 }));
  const notIssued = {};
  let issued = 0;
  let ambiguous = 0;
  const reachesByH = [0, 0];
  const noArrivalLosses = [0, 0];
  const noArrivalCurve = Array(HORIZON).fill(0);
  for (const { startDate, history, future } of windows) {
    checkAmounts(future, 'future');
    if (future.length !== HORIZON) throw new Error('future must have exactly ' + HORIZON + ' calendar days');
    const prediction = forecast(startDate, history);
    if (prediction.reason) {
      notIssued[prediction.reason] = (notIssued[prediction.reason] ?? 0) + 1;
      continue;
    }
    issued++;
    const arrivals = possibleArrivalDays(future, REMAINING);
    if (arrivals.length > 1) ambiguous++;
    addPair(reachesByH, bounds(arrivals.map(day => Number(day <= HORIZON))));
    addPair(noArrivalLosses, bounds(arrivals.map(day => rps(noArrivalCurve, day))));
    const losses = {};
    for (const name of MODELS) {
      const cdf = prediction.curves[name];
      const invalid = cdf.some((p, i) => !Number.isFinite(p) || p < -1e-10 || p > 1 + 1e-10 ||
        (i > 0 && p < cdf[i - 1] - 1e-10));
      if (cdf.length !== HORIZON || invalid) throw new Error('Invalid arrival distribution from ' + name);
      losses[name] = arrivals.map(day => rps(cdf, day));
      const score = scores[name];
      addPair(score.losses, bounds(losses[name]));
      for (const [level, key, metric] of [[0.5, 'p50Days', score.p50], [0.8, 'p80Days', score.p80]]) {
        const fixed = prediction.fixedQuantiles[name];
        const q = fixed ? fixed[key] : quantileDay(cdf, level);
        if (q === null) continue;
        metric.finite++;
        addPair(metric.hits, bounds(arrivals.map(day => Number(day <= q))));
      }
    }
    for (const contrast of paired) {
      // Both models must face the same possible future even when a day was not recorded.
      const delta = losses[contrast.model].map((loss, i) => loss - losses[contrast.reference][i]);
      addPair(contrast.differences, bounds(delta));
      contrast.sumSquares += delta[0] ** 2;
    }
  }
  const models = Object.fromEntries(Object.entries(scores).map(([key, score]) => [key, {
    rps: average(score.losses, issued),
    p50: summarizeCoverage(score.p50, issued), p80: summarizeCoverage(score.p80, issued),
  }]));
  const contrasts = paired.map(({ model, reference, differences, sumSquares }) => {
    let ci95 = null;
    if (issued > 1 && ambiguous === 0) {
      const mean = differences[0] / issued;
      const variance = Math.max(0, (sumSquares - issued * mean ** 2) / (issued - 1));
      const margin = 1.96 * Math.sqrt(variance / issued);
      ci95 = [rounded(mean - margin), rounded(mean + margin)];
    }
    return { model, reference, deltaRps: average(differences, issued), pairedApproxCI95: ci95 };
  });
  return { windows: windows.length, issued, notIssued, ambiguous, reachesByH,
    noArrivalReferenceRps: average(noArrivalLosses, issued), models, contrasts };
}
