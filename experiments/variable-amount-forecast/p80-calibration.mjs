import { possibleArrivalDays, quantileDay } from './evaluate.mjs';
import { HORIZON } from './forecast.mjs';
import { personalForecast } from './personal.mjs';

const ORIGIN = 14;
const GROUPS = ['restFollowed', 'noRestFollowed'];

// One prediction per participant. Neither the release ID nor the future enters the forecast or its stratum.
export function diaryCase(days, historyDays, remaining) {
  const history = days.slice(ORIGIN - historyDays, ORIGIN);
  const prediction = personalForecast(history, remaining);
  const raw = prediction.reason ? null : quantileDay(prediction.curves.iidEmpirical, 0.8);
  const hasRestPair = history.some((amount, i) => i > 0 && amount !== null && history[i - 1] === 0);
  return {
    group: hasRestPair ? 'restFollowed' : 'noRestFollowed',
    raw, reason: prediction.reason ?? (raw === null ? 'OUTSIDE_HORIZON' : null),
    arrivals: possibleArrivalDays(days.slice(ORIGIN, ORIGIN + HORIZON), remaining),
  };
}

function fitOffset(cases) {
  const scores = cases.map(row => row.arrivals.at(-1) - row.raw).sort((a, b) => a - b);
  const rank = Math.ceil(4 * (scores.length + 1) / 5);
  return { n: scores.length, offset: rank > scores.length ? null : Math.max(0, scores[rank - 1]) };
}

export function fitCalibration(cases) {
  const finite = cases.filter(row => row.raw !== null);
  const pooled = fitOffset(finite);
  const strata = Object.fromEntries(GROUPS.map(group => {
    const fit = fitOffset(finite.filter(row => row.group === group));
    return [group, { n: fit.n, offset: fit.n >= 25 ? fit.offset : pooled.offset,
      from: fit.n >= 25 ? 'stratum' : 'pooled' }];
  }));
  return { pooled, strata };
}

function moveDate(raw, offset) {
  if (raw === null || offset === null || raw + offset > HORIZON) return null;
  return raw + offset;
}

function hitBounds(arrivals, q) {
  return [Number(arrivals.at(-1) <= q), Number(arrivals[0] <= q)];
}

// 80% quantile loss in days, with all times beyond the evaluation window in one ordered category.
function loss(day, q) {
  return day >= q ? 0.8 * (day - q) : 0.2 * (q - day);
}

function addBounds(total, pair) {
  total[0] += pair[0];
  total[1] += pair[1];
}

const rounded = value => Number(value.toFixed(4));

function scoreDates(cases, chooseOffset) {
  let issued = 0;
  let shift = 0;
  const hits = [0, 0];
  const rawHitsOnRetained = [0, 0];
  const gainsOnRetained = [0, 0];
  const delta = [0, 0];
  for (const { raw, group, arrivals } of cases) {
    const date = moveDate(raw, chooseOffset(group));
    if (date !== null) {
      issued++;
      shift += date - raw;
      addBounds(hits, hitBounds(arrivals, date));
      addBounds(rawHitsOnRetained, hitBounds(arrivals, raw));
      const gains = arrivals.map(day => Number(day > raw && day <= date));
      addBounds(gainsOnRetained, [Math.min(...gains), Math.max(...gains)]);
    }
    const capped = date ?? HORIZON + 1;
    const differences = arrivals.map(day => loss(day, capped) - loss(day, raw));
    addBounds(delta, [Math.min(...differences), Math.max(...differences)]);
  }
  return {
    issued, hits, rawHitsOnRetained, gainsOnRetained, withdrawn: cases.length - issued,
    meanShiftDays: issued ? rounded(shift / issued) : null,
    cappedLossDelta: cases.length ? delta.map(x => rounded(x / cases.length)) : null,
  };
}

function compare(cases, fit) {
  const finite = cases.filter(row => row.raw !== null);
  const reasons = {};
  for (const { reason } of cases) if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
  return {
    participants: cases.length, noRawDate: reasons,
    raw: scoreDates(finite, () => 0),
    oneDay: scoreDates(finite, () => 1),
    pooled: scoreDates(finite, () => fit.pooled.offset),
    stratified: scoreDates(finite, group => fit.strata[group].offset),
  };
}

export function evaluateCalibration(cases, fit) {
  return {
    all: compare(cases, fit),
    ...Object.fromEntries(GROUPS.map(group => [group, compare(cases.filter(row => row.group === group), fit)])),
  };
}
