import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HISTORY_DAYS, SCENARIOS, syntheticWindow } from './benchmark.mjs';
import { trainAnalog } from './analog.mjs';
import { evaluate } from './evaluate.mjs';
import { HORIZON, PLAN, REMAINING } from './forecast.mjs';
import { evaluatePersonal } from './personal.mjs';

const TRAIN_START = 1_000;
const TRAIN_PER_GROUP = 1_024;
const TEST_PER_GROUP = 512;
const NEIGHBORS = 64;

function diaries(scenario, days, start, count) {
  return Array.from({ length: count }, (_, i) => syntheticWindow(scenario, days, start + i));
}

function run([method, ...args]) {
  const usage = 'Usage: followup.mjs analog|personal [--input file|-]';
  if (method !== 'analog' && method !== 'personal') throw new Error(usage);
  const testStart = method === 'analog' ? 10_000 : 20_000;
  let input;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--input') throw new Error(usage);
    input = JSON.parse(readFileSync(args[1] === '-' ? 0 : args[1], 'utf8'));
    if (!Array.isArray(input) || !input.length || input.some(row => !HISTORY_DAYS.includes(row?.history?.length))) {
      throw new Error('Input must contain diary windows with 7 or 28 historical days');
    }
  }
  const training = [];
  const cohorts = [];
  for (const days of HISTORY_DAYS) {
    const external = input?.filter(w => w.history.length === days);
    if (external && !external.length) continue;
    let score = evaluatePersonal;
    if (method === 'analog') {
      const library = SCENARIOS.flatMap(s => diaries(s, days, TRAIN_START, TRAIN_PER_GROUP));
      const model = trainAnalog(library, days, NEIGHBORS);
      training.push({ historyDays: days, offered: library.length, eligible: model.eligible });
      score = windows => evaluate(windows, model.predict);
    }
    if (external) {
      const result = score(external);
      const complete = external.filter(w => !w.future.includes(null));
      cohorts.push({ scenario: 'external', historyDays: days, ...result,
        completeFollowup: complete.length ? score(complete) : null });
    } else {
      for (const scenario of SCENARIOS) {
        const windows = diaries(scenario, days, testStart, TEST_PER_GROUP);
        cohorts.push({ scenario, historyDays: days, ...score(windows) });
      }
    }
  }
  return { protocol: 'variable-amount-' + method + '-v1', horizon: HORIZON, plan: PLAN, remaining: REMAINING,
    ...(method === 'analog' ? { neighbors: NEIGHBORS, trainStart: TRAIN_START, trainPerGroup: TRAIN_PER_GROUP } : {}),
    testStart: input ? null : testStart, testPerGroup: input ? null : TEST_PER_GROUP, training, cohorts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
}
