import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { calendar, HORIZON, PLAN, REMAINING } from './forecast.mjs';
import { evaluate } from './evaluate.mjs';

const SEED = 3522026;
const PEOPLE = 256;
export const SCENARIOS = ['constant', 'variable', 'belowPlan', 'weekend'];
export const HISTORY_DAYS = [7, 28];

// Mulberry32. Independent seeds drive behavior and recording, so a missing row never
// changes the simulated behavior, and all candidate models see exactly the same future.
function randomStream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticWindow(scenario, historyDays, index) {
  const group = SCENARIOS.indexOf(scenario);
  if (group < 0 || !HISTORY_DAYS.includes(historyDays)) throw new Error('Unknown synthetic cohort');
  const seed = SEED + group * 1_000_000 + historyDays * 10_000 + 2 * index;
  const behavior = randomStream(seed);
  const recording = randomStream(seed + 1);
  const startDate = calendar('2026-01-05').date(index % 7);
  const dates = calendar(startDate);
  const offset = 0.20 * (behavior() - 0.5);
  let did = false;
  const history = [];
  const future = [];
  for (let i = 0; i < historyDays + HORIZON; i++) {
    const weekend = dates.weekend(i);
    let continuation = 0.72;
    let restart = 0.35;
    if (scenario === 'weekend') {
      continuation = weekend ? 0.88 : 0.45;
      restart = weekend ? 0.74 : 0.18;
    }
    did = behavior() < (did ? continuation : restart) + offset;
    const high = behavior() >= 0.5;
    let amount = PLAN;
    if (scenario === 'variable') amount = high ? 55 : 5;
    if (scenario === 'belowPlan') amount = high ? 25 : 5;
    if (scenario === 'weekend') amount = weekend ? (high ? 75 : 45) : (high ? 15 : 5);
    const actual = did ? amount : 0;
    if (i < historyDays) history.push(recording() < 0.1 ? null : actual);
    else future.push(actual);
  }
  return { startDate, history, future };
}

function main(args) {
  if (args.length === 2 && args[0] === '--input') {
    const windows = JSON.parse(readFileSync(args[1], 'utf8'));
    return { protocol: 'variable-amount-v1', horizon: HORIZON, remaining: REMAINING, plan: PLAN,
      input: evaluate(windows) };
  }
  if (args.length) throw new Error('Usage: node benchmark.mjs [--input local-windows.json]');
  const cohorts = [];
  for (const scenario of SCENARIOS) {
    for (const historyDays of HISTORY_DAYS) {
      const windows = Array.from({ length: PEOPLE }, (_, i) => syntheticWindow(scenario, historyDays, i));
      cohorts.push({ scenario, historyDays, ...evaluate(windows) });
    }
  }
  return { protocol: 'variable-amount-v1', seed: SEED, horizon: HORIZON,
    remaining: REMAINING, plan: PLAN, peoplePerCohort: PEOPLE, cohorts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
}
