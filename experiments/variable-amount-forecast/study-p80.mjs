import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { diaryCase, evaluateCalibration, fitCalibration } from './p80-calibration.mjs';

const DIGESTS = {
  longer: 'a1ca29477341999aaa58fea1c216e29acb9407d1c976f7d2aac8137873dc24af',
  gap: '64c9e5a724912cdd0234e69d7d481ae1be376b0ffff54cd10b41e9e1d31c14e7',
};
const adapter = fileURLToPath(new URL('./study-diary.R', import.meta.url));
const protocol = 'FutureROI-study-P80-v1';

export function inCalibration(id) {
  return createHash('sha256').update(protocol + '|longer|' + id).digest()[0] % 2 === 0;
}

function numberOrNull(field) {
  if (field === '') return null;
  const value = Number(field);
  if (!Number.isFinite(value)) throw new Error('Non-numeric diary field');
  return value;
}

function observation(hours, studied, quality, evening, restPolicy) {
  if (quality === 3) return [null, 'qualityFlag'];
  if (hours !== null && (hours < 0 || hours >= 15)) return [null, 'invalidHours'];
  if (studied === 0 && hours > 0) return [null, 'conflict'];
  if (hours !== null) return [hours > 0 ? Math.max(1, Math.round(hours * 60)) : 0, 'reportedHours'];
  if (studied === 0) {
    const useFlag = restPolicy === 'includeRestFlag' || (restPolicy === 'withEveningResponse' && evening === 1);
    return [useFlag ? 0 : null, evening === 1 ? 'restFlagWithEvening' : 'restFlagWithoutEvening'];
  }
  return [null, 'unreported'];
}

// Counts and total minutes by day identify duplicate study arms without linking individual records.
function recordDay(totals, arm, day, hours) {
  if (!totals.has(arm)) totals.set(arm, Array.from({ length: 30 }, () => [0, 0, 0, 0]));
  const counts = totals.get(arm)[day - 1];
  counts[0]++;
  if (hours === null) return;
  counts[1]++;
  counts[2] += Number(hours > 0);
  counts[3] += Math.round(hours * 60);
}

export function matchingDays(a, b) {
  return a.filter((counts, i) => counts.every((value, j) => value === b[i][j])).length;
}

export function decodeDiaries(csv, restPolicy = 'includeRestFlag') {
  const [header, ...lines] = csv.trimEnd().split(/\r?\n/);
  if (header !== 'id,day,hours,studied,quality,arm,evening') throw new Error('Incorrect diary columns');
  const participants = new Map();
  const arms = new Map();
  const dailyTotals = new Map();
  const reasons = {};
  let duplicateRows = 0;
  let conflicts = 0;
  for (const line of lines) {
    const fields = line.split(',');
    const [id, dayField, hoursField, studiedField, qualityField, armField, eveningField] = fields;
    if (fields.length !== 7 || !/^\d+$/.test(id)) throw new Error('Invalid participant row');
    const day = Number(dayField);
    if (!Number.isInteger(day) || day < 1 || day > 30) throw new Error('Invalid study day');
    const studied = numberOrNull(studiedField);
    if (![null, 0, 1].includes(studied)) throw new Error('Invalid study flag');
    const hours = numberOrNull(hoursField);
    const arm = numberOrNull(armField);
    if (arms.has(id) && arms.get(id) !== arm) throw new Error('Inconsistent study arm');
    arms.set(id, arm);
    recordDay(dailyTotals, arm, day, hours);
    const evening = numberOrNull(eveningField);
    if (evening !== 0 && evening !== 1) throw new Error('Invalid evening response flag');
    const [minutes, reason] = observation(hours, studied, numberOrNull(qualityField), evening, restPolicy);
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    if (!participants.has(id)) participants.set(id, new Map());
    const dates = participants.get(id);
    if (!dates.has(day)) dates.set(day, minutes);
    else {
      duplicateRows++;
      if (dates.get(day) !== minutes && dates.get(day) !== 'conflict') {
        conflicts++;
        dates.set(day, 'conflict');
      }
    }
  }
  const diaries = new Map();
  let observedDays = 0;
  let restDays = 0;
  for (const [id, dates] of participants) {
    const days = Array.from({ length: 30 }, (_, i) => {
      const amount = dates.get(i + 1);
      return typeof amount === 'number' ? amount : null;
    });
    observedDays += days.filter(x => x !== null).length;
    restDays += days.filter(x => x === 0).length;
    diaries.set(id, days);
  }
  return { diaries, arms, dailyTotals, audit: { participants: diaries.size, rows: lines.length, reasons, duplicateRows,
    conflictingDates: conflicts, absentDates: 30 * diaries.size - (lines.length - duplicateRows),
    observedDays, restDays, unknownDays: 30 * diaries.size - observedDays } };
}

function readRelease(source, path, restPolicy) {
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (digest !== DIGESTS[source]) throw new Error('Unexpected input SHA-256 for ' + source);
  const run = spawnSync(process.env.RSCRIPT || 'Rscript', ['--vanilla', adapter, source, path],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error('R diary adapter failed for ' + source + ': ' + run.stderr.trim());
  return decodeDiaries(run.stdout, restPolicy);
}

export function splitRelease(release) {
  const training = [];
  const holdout = [];
  const trainingWithoutControl = [];
  const holdoutWithoutControl = [];
  for (const [id, days] of release.diaries) {
    const train = inCalibration(id);
    (train ? training : holdout).push(days);
    if (release.arms.get(id) !== 0) (train ? trainingWithoutControl : holdoutWithoutControl).push(days);
  }
  return { training, holdout, trainingWithoutControl, holdoutWithoutControl };
}

function run([longerPath, gapPath, ...options]) {
  const policies = new Map([['--recorded-hours-only', 'recordedHoursOnly'], ['--evening-response', 'withEveningResponse']]);
  if (!longerPath || !gapPath || options.length > 1 || (options.length && !policies.has(options[0]))) {
    throw new Error('Usage: study-p80.mjs <longer.RData> <gap.csv> [--recorded-hours-only | --evening-response]');
  }
  const restPolicy = policies.get(options[0]) ?? 'includeRestFlag';
  const longer = readRelease('longer', longerPath, restPolicy);
  const { training, holdout, trainingWithoutControl, holdoutWithoutControl } = splitRelease(longer);
  const scenarios = [];
  for (const historyDays of [7, 14]) {
    for (const remaining of [180, 600]) {
      const fit = diaries => fitCalibration(diaries.map(days => diaryCase(days, historyDays, remaining)));
      scenarios.push({ historyDays, remaining, fit: fit(training), controlFit: fit(trainingWithoutControl) });
    }
  }
  const gap = readRelease('gap', gapPath, restPolicy);
  const sharedDays = matchingDays(longer.dailyTotals.get(0), gap.dailyTotals.get(null));
  if (sharedDays !== 30) throw new Error('The expected overlap of the two fixed releases was not reproduced');
  for (const scenario of scenarios) {
    const evaluate = (diaries, fit) => evaluateCalibration(
      diaries.map(days => diaryCase(days, scenario.historyDays, scenario.remaining)), fit);
    scenario.holdout = evaluate(holdout, scenario.fit);
    scenario.control = evaluate([...gap.diaries.values()], scenario.controlFit);
    scenario.nonControlHoldout = evaluate(holdoutWithoutControl, scenario.controlFit);
  }
  return { protocol, restPolicy,
    audits: { longer: longer.audit, gap: gap.audit, sharedDays },
    split: { calibration: training.length, holdout: holdout.length,
      calibrationWithoutControl: trainingWithoutControl.length, holdoutWithoutControl: holdoutWithoutControl.length,
      control: gap.diaries.size }, scenarios };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
}
