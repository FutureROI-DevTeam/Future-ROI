import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { diaryCase, evaluateCalibration, evaluateFixedDay, fitCalibration } from './p80-calibration.mjs';
import { decodeDiaries, inCalibration, matchingDays, splitRelease } from './study-p80.mjs';

const header = 'id,day,hours,studied,quality,arm,evening';
const row = (raw, arrivals, group = 'noRestFollowed') => ({ raw, arrivals, group, reason: null });

test('recorded minutes, explicit rest, missing, quality flags and contradictory days stay distinct', () => {
  const data = [header, '7,1,0,1,,0,0', '7,2,,0,,0,0', '7,3,,1,,0,1', '7,4,1.25,1,,0,1',
    '7,5,2,0,,0,1', '7,6,1,1,3,0,1', '7,7,15,1,,0,1', '7,8,1,1,,0,1', '7,8,2,1,,0,1',
    '7,10,,0,,0,1'].join('\n');
  const primary = decodeDiaries(data);
  assert.deepEqual(primary.diaries.get('7').slice(0, 9), [0, 0, null, 75, null, null, null, null, null]);
  assert.equal(primary.audit.absentDates, 21);
  assert.equal(primary.audit.conflictingDates, 1);
  assert.equal(primary.audit.observedDays, 4);
  assert.deepEqual(decodeDiaries(data, 'recordedHoursOnly').diaries.get('7').slice(0, 4), [0, null, null, 75]);
  const backed = decodeDiaries(data, 'withEveningResponse').diaries.get('7');
  assert.deepEqual([backed[1], backed[9]], [null, 0]);
});

test('both quoting layers preserve dates and a subject field with a comma in the CSV release', t => {
  const dir = mkdtempSync(join(tmpdir(), 'study-p80-test-'));
  const path = join(dir, 'gap.csv');
  t.after(() => { rmSync(path, { force: true }); rmdirSync(dir); });
  writeFileSync(path, 'nr,day0,tessh,Testudy,TEZielE,TEStress,TECalm,TEEnergy,fach\n' +
    '11,0,0,0,1,2,3,4,A\n"11,1,1.5,1,1,2,3,4,""A, B"""\n');
  const adapter = fileURLToPath(new URL('./study-diary.R', import.meta.url));
  const csv = execFileSync(process.env.RSCRIPT || 'Rscript', ['--vanilla', adapter, 'gap', path], { encoding: 'utf8' });
  const result = decodeDiaries(csv);
  assert.deepEqual(result.diaries.get('11').slice(0, 3), [0, 90, null]);
  assert.equal(result.audit.rows, 2);
});

test('the release overlap check uses daily aggregates and calibration excludes the entire control arm', () => {
  const ids = Array.from({ length: 40 }, (_, i) => String(i + 1));
  const data = decodeDiaries([header, ...ids.map((id, i) => [id, 1, 1, 1, '', i % 2, 1].join(','))].join('\n'));
  const { training, holdout, trainingWithoutControl, holdoutWithoutControl } = splitRelease(data);
  for (const [id, days] of data.diaries) {
    assert.equal(training.includes(days), inCalibration(id));
    assert.equal(holdout.includes(days), !inCalibration(id));
    assert.equal(trainingWithoutControl.includes(days), inCalibration(id) && data.arms.get(id) !== 0);
    assert.equal(holdoutWithoutControl.includes(days), !inCalibration(id) && data.arms.get(id) !== 0);
  }
  const otherIds = decodeDiaries([header, '101,1,1,1,,,1', '102,1,2,1,,,1'].join('\n'));
  const sameCounts = decodeDiaries([header, '42,1,2,1,,0,1', '43,1,1,1,,0,1'].join('\n'));
  assert.equal(matchingDays(otherIds.dailyTotals.get(null), sameCounts.dailyTotals.get(0)), 30);
  assert.equal(matchingDays(data.dailyTotals.get(0), sameCounts.dailyTotals.get(0)), 29);
});

test('only the prefix controls the forecast, eligibility and the known rest-day pair', () => {
  const days = Array(30).fill(180);
  const before = diaryCase(days, 7, 180);
  assert.equal(before.raw, 1);
  assert.ok(diaryCase(days, 7, 600).raw > before.raw);
  days.fill(0, 14);
  const after = diaryCase(days, 7, 180);
  assert.equal(after.raw, before.raw);
  assert.equal(after.group, before.group);
  assert.deepEqual(after.arrivals, [15]);
  days[10] = 0;
  days[11] = null;
  assert.equal(diaryCase(days, 7, 180).group, 'noRestFollowed');
  days[11] = 180;
  assert.equal(diaryCase(days, 7, 180).group, 'restFollowed');
  days[13] = null;
  assert.equal(diaryCase(days, 7, 180).reason, 'UNKNOWN_ORIGIN');
});

test('the one-sided finite-sample rank uses worst feasible arrivals and pools sparse strata', () => {
  const early = row(3, [1]);
  const late = row(3, [1, 6], 'restFollowed');
  assert.equal(fitCalibration([early, early, early]).pooled.offset, null);
  assert.equal(fitCalibration([early, early, early, early]).pooled.offset, 0);
  assert.equal(fitCalibration([early, early, early, early, late]).pooled.offset, 3);
  const fit = fitCalibration([...Array(25).fill(early), ...Array(24).fill(late), row(null, [15])]);
  assert.deepEqual(fit.strata.noRestFollowed, { n: 25, offset: 0, from: 'stratum' });
  assert.deepEqual(fit.strata.restFollowed, { n: 24, offset: 3, from: 'pooled' });
});

test('a date outside the horizon is withdrawn and paired loss evaluates the same missing outcome', () => {
  const fit = fitCalibration(Array(4).fill(row(2, [3])));
  const cases = [row(14, [14]), row(2, [2, 3]), row(null, [1])];
  const report = evaluateCalibration(cases, fit).all;
  assert.equal(report.participants, 3);
  assert.equal(report.raw.issued, 2);
  assert.deepEqual(report.stratified, { issued: 1, hits: [1, 1], rawHitsOnRetained: [0, 1],
    gainsOnRetained: [0, 1], withdrawn: 1, meanShiftDays: 1, cappedLossDelta: [-0.3, 0.2] });
});

test('a zero on a blank external questionnaire stays unknown, while a documented rest stays zero', t => {
  const dir = mkdtempSync(join(tmpdir(), 'study-p80-external-'));
  const path = join(dir, 'study.RData');
  t.after(() => { rmSync(path, { force: true }); rmdirSync(dir); });
  const rscript = process.env.RSCRIPT || 'Rscript';
  const fixture = 'data <- data.frame(id=1, day=0:3, time_use=c(0,0,2.5,18), control_beliefs=c(NA,4,NA,NA),' +
    'value_beliefs=NA, procrastination=NA, goal_achiev=NA, goal_achiev1=NA, goal_achiev2=NA);' +
    'save(data, file=commandArgs(TRUE)[1])';
  execFileSync(rscript, ['--vanilla', '-e', fixture, path]);
  const adapter = fileURLToPath(new URL('./study-diary.R', import.meta.url));
  const csv = execFileSync(rscript, ['--vanilla', adapter, 'liborius', path], { encoding: 'utf8' });
  const release = decodeDiaries(csv, 'recordedHoursOnly', 154);
  assert.deepEqual(release.diaries.get('1').slice(0, 4), [null, 0, 150, null]);
  assert.equal(release.audit.unknownDays, 152);
});

test('the external rule changes only the fixed target and history group, including at the later origin', () => {
  const cases = [row(3, [4]), row(3, [4], 'restFollowed')];
  assert.deepEqual(evaluateFixedDay(cases, 180).all.targeted.hits, [0, 0]);
  assert.deepEqual(evaluateFixedDay(cases, 600).all.targeted.hits, [1, 1]);
  const diary = Array(154).fill(60);
  diary[28] = 600;
  assert.deepEqual(diaryCase(diary, 28, 600, 28).arrivals, [1]);
  assert.deepEqual(diaryCase(diary, 7, 600, 14).arrivals, [10]);
  assert.throws(() => diaryCase(diary, 28, 600, 14), /calendar/);
});
