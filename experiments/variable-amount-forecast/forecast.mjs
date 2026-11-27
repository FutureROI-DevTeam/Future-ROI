import {
  completionDistributionForFrozenState, DEFAULT_CONFIG, predict,
} from '../../packages/prediction/dist/src/index.js';

export const HORIZON = 14;
export const REMAINING = 180;
export const PLAN = 30;
const CONFIG = { ...DEFAULT_CONFIG, horizonDays: HORIZON };
const DAY_MS = 86_400_000;

export function calendar(startDate) {
  const start = Date.parse(startDate + 'T00:00:00Z');
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== startDate) {
    throw new Error('startDate must be an ISO calendar date (YYYY-MM-DD)');
  }
  return {
    date: index => new Date(start + index * DAY_MS).toISOString().slice(0, 10),
    weekend: index => (new Date(start + index * DAY_MS).getUTCDay() + 6) % 7 >= 5,
  };
}

export function checkAmounts(values, label) {
  if (!Array.isArray(values) || !values.length ||
      values.some(value => value !== null && (!Number.isSafeInteger(value) || value < 0))) {
    throw new Error(label + ' must contain nonnegative integer minutes or null for unknown');
  }
}

function empiricalLaw(positive) {
  const counts = new Map();
  for (const amount of positive) counts.set(amount, (counts.get(amount) ?? 0) + 1);
  return [...counts].map(([amount, count]) => [amount, count / positive.length]);
}

function calendarLaw(positive, pooled) {
  // Four pseudo-observations from this person's pooled positive amounts stabilize sparse weekends.
  const weights = new Map(pooled.map(([amount, probability]) => [amount, 4 * probability]));
  for (const amount of positive) weights.set(amount, weights.get(amount) + 1);
  return [...weights].map(([amount, weight]) => [amount, weight / (positive.length + 4)]);
}

// Distribution of the first number of DONE sessions needed to cross the remaining amount.
// Active mass below the threshold stays in the tail if H future sessions still do not suffice.
export function crossingWeights(law, remaining, horizon) {
  let active = new Float64Array(remaining);
  active[0] = 1;
  return Array.from({ length: horizon }, () => {
    const next = new Float64Array(remaining);
    let crossed = 0;
    for (let sum = 0; sum < remaining; sum++) {
      if (active[sum] === 0) continue;
      for (const [amount, probability] of law) {
        const mass = active[sum] * probability;
        if (amount >= remaining - sum) crossed += mass;
        else next[sum + amount] += mass;
      }
    }
    active = next;
    return crossed;
  });
}

function fitFrequency(history, dates) {
  const examples = [];
  for (let i = 1; i < history.length; i++) {
    // Preserve calendar adjacency. Removing missing rows before pairing would bridge gaps.
    if (history[i - 1] === null || history[i] === null) continue;
    examples.push([Number(history[i - 1] > 0), Number(dates.weekend(i)), Number(history[i] > 0)]);
  }
  const coefficients = [0, 0, 0];
  const probability = (done, weekend) =>
    1 / (1 + Math.exp(-(coefficients[0] + coefficients[1] * done + coefficients[2] * weekend)));
  const penalty = 2;
  // The summed logistic loss has Hessian bounded by 3n/4 + penalty for these binary features.
  const step = 1 / (0.75 * examples.length + penalty);
  for (let iteration = 0; iteration < 300; iteration++) {
    const gradient = coefficients.map(value => penalty * value);
    for (const [done, weekend, outcome] of examples) {
      const error = probability(done, weekend) - outcome;
      gradient[0] += error;
      gradient[1] += error * done;
      gradient[2] += error * weekend;
    }
    if (Math.max(...gradient.map(Math.abs)) < 1e-8) break;
    for (let j = 0; j < coefficients.length; j++) coefficients[j] -= step * gradient[j];
  }
  return probability;
}

// Calendar-dependent amounts and occurrence share the same future day. Carry both the
// previous action and accumulated amount so a Saturday session can have its own amount law.
export function calendarCdf(startDone, days, probability, lawForDay, remaining) {
  let active = [new Float64Array(remaining), new Float64Array(remaining)];
  active[Number(startDone)][0] = 1;
  let reached = 0;
  return days.map(weekend => {
    const next = [new Float64Array(remaining), new Float64Array(remaining)];
    const law = lawForDay(weekend);
    for (let previous = 0; previous <= 1; previous++) {
      const p = probability(previous, Number(weekend));
      for (let sum = 0; sum < remaining; sum++) {
        const at = active[previous][sum];
        if (at === 0) continue;
        next[0][sum] += at * (1 - p);
        for (const [amount, weight] of law) {
          const mass = at * p * weight;
          if (amount >= remaining - sum) reached += mass;
          else next[1][sum + amount] += mass;
        }
      }
    }
    active = next;
    return reached;
  });
}

export function forecast(startDate, history) {
  checkAmounts(history, 'history');
  const dates = calendar(startDate);
  if (history.at(-1) === null) return { reason: 'UNKNOWN_ORIGIN' };
  const logs = history.flatMap((amount, i) => amount === null ? [] : [{
    localDate: dates.date(i), status: amount > 0 ? 'DONE' : 'SKIPPED', amount: amount || null,
  }]);
  const sum = history.reduce((total, amount) => total + (amount ?? 0), 0);
  const input = {
    today: dates.date(history.length - 1), logs,
    goal: { initialProgress: 0, totalRequired: sum + REMAINING, sessionAmount: PLAN },
  };
  const base = predict(input, CONFIG);
  if (base.completion.status !== 'available') return { reason: base.completion.reason };

  const countCurves = new Map();
  function atSessions(n) {
    if (n > HORIZON) return { cdf: Array(HORIZON).fill(0), p50Days: null, p80Days: null };
    if (!countCurves.has(n)) {
      const result = completionDistributionForFrozenState(base.posterior, base.todayStatus, n, CONFIG);
      countCurves.set(n, { cdf: result.cdf.slice(0, HORIZON), p50Days: result.p50Days, p80Days: result.p80Days });
    }
    return countCurves.get(n);
  }
  const positive = history.filter(value => value > 0);
  const pooled = empiricalLaw(positive);
  const amountCdf = Array(HORIZON).fill(0);
  const weights = crossingWeights(pooled, REMAINING, HORIZON);
  for (const [i, weight] of weights.entries()) {
    if (weight === 0) continue;
    const curve = atSessions(i + 1).cdf;
    for (let d = 0; d < HORIZON; d++) amountCdf[d] += weight * curve[d];
  }

  const probability = fitFrequency(history, dates);
  const futureDays = Array.from({ length: HORIZON }, (_, i) => dates.weekend(history.length + i));
  const groupLaw = [false, true].map(weekend =>
    calendarLaw(history.filter((amount, i) => amount > 0 && dates.weekend(i) === weekend), pooled));
  const byCalendar = law => calendarCdf(history.at(-1) > 0, futureDays, probability, law, REMAINING);
  const plan = atSessions(Math.ceil(REMAINING / PLAN));
  const mean = atSessions(Math.ceil(REMAINING * positive.length / sum));
  // Reuse the Engine's exact threshold decisions for fixed-quantity forecasts.
  const fixedQuantiles = { m1Plan: base.completion, m1Mean: mean };
  if (pooled.length === 1) fixedQuantiles.m1Empirical = mean;
  return { fixedQuantiles, curves: {
    m1Plan: plan.cdf,
    m1Mean: mean.cdf,
    m1Empirical: amountCdf,
    logisticPlan: byCalendar(() => [[PLAN, 1]]),
    logisticEmpirical: byCalendar(() => pooled),
    logisticCalendarAmount: byCalendar(weekend => groupLaw[Number(weekend)]),
  } };
}
