import { checkAmounts, crossingWeights, empiricalLaw, forecast, HORIZON, PLAN, REMAINING } from './forecast.mjs';
import { scoreForecasts } from './evaluate.mjs';

// Count future sessions with a shared Beta activity probability. A path that already
// contains j sessions changes the probability of its next session (beta-binomial).
export function personalForecast(history) {
  checkAmounts(history, 'history');
  if (history.at(-1) === null) return { reason: 'UNKNOWN_ORIGIN' };
  const positive = history.filter(x => x > 0);
  if (!positive.length) return { reason: 'NO_OBSERVED_AMOUNT' };
  const alpha = 1 + positive.length;
  const beta = 1 + history.filter(x => x === 0).length;
  const weights = crossingWeights(empiricalLaw(positive), REMAINING, HORIZON);
  const reachedByCount = [0];
  for (const weight of weights) reachedByCount.push(reachedByCount.at(-1) + weight);
  const fixedCount = Math.ceil(REMAINING / PLAN);
  let counts = [1];
  const curves = { iidPlan: [], iidEmpirical: [] };
  for (let d = 0; d < HORIZON; d++) {
    const next = Array(d + 2).fill(0);
    for (let j = 0; j <= d; j++) {
      const p = (alpha + j) / (alpha + beta + d);
      next[j] += counts[j] * (1 - p);
      next[j + 1] += counts[j] * p;
    }
    counts = next;
    curves.iidPlan.push(counts.slice(fixedCount).reduce((sum, prob) => sum + prob, 0));
    curves.iidEmpirical.push(counts.reduce((sum, prob, j) => sum + prob * reachedByCount[j], 0));
  }
  return { curves, fixedQuantiles: {} };
}

export function evaluatePersonal(windows) {
  const common = [];
  const additional = [];
  for (const { startDate, history, future } of windows) {
    const base = forecast(startDate, history);
    const personal = personalForecast(history);
    if (base.reason) {
      common.push({ future, prediction: base });
      additional.push({ future, prediction: personal });
    } else {
      if (personal.reason) throw new Error('Missing personal forecast for an M1-eligible diary');
      common.push({ future, prediction: {
        curves: { ...base.curves, ...personal.curves }, fixedQuantiles: base.fixedQuantiles,
      } });
    }
  }
  return {
    common: scoreForecasts(common, ['m1Plan', 'm1Mean', 'm1Empirical', 'iidPlan', 'iidEmpirical'], [
      ['iidEmpirical', 'm1Empirical'], ['iidEmpirical', 'm1Plan'], ['iidEmpirical', 'm1Mean'],
      ['iidEmpirical', 'iidPlan'],
    ]),
    additional: scoreForecasts(additional, ['iidPlan', 'iidEmpirical'], [['iidEmpirical', 'iidPlan']]),
  };
}
