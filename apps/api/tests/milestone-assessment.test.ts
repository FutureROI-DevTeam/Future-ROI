import assert from 'node:assert/strict';
import test from 'node:test';
import type { TodaySnapshot } from '../src/prediction/snapshot.ts';
import { assessEpisode, contextKey, episodeView, makeEpisode, type EpisodeRow } from '../src/milestone/assessment.ts';
import { DEFAULT_CONFIG, completionDistributionForFrozenState } from '@futureroi/prediction';
import { MILESTONE_PROTOCOL, applyOffset, identityFit, observationLoss } from '../src/milestone/core.ts';
import { localDateIn, shiftLocalDate } from '../src/goals/local-date.ts';
const BUILD = 'synthetic-milestone-assessment';
const origin = '2026-03-28';
function base(): TodaySnapshot {
  return { now: new Date('2026-03-28T12:00:00Z'), goal: { totalRequired: 300, initialProgress: 0, sessionAmount: 10,
    timezone: 'Europe/Berlin', recordStartDate: '2026-03-25', unit: 'minutes', goalSettingsRevision: 0, unitLocked: true },
    question: { question_prior: { a: null, b: null }, answer_revision: '0', question_prior_snapshot: null },
    logs: [-3, -2, -1, 0].map((d, i) => ({ localDate: shiftLocalDate(origin, d), status: i % 2 === 0 ? 'SKIPPED' as const : 'DONE' as const, amount: i % 2 === 0 ? null : 10 })) };
}
function fixture() {
  const snapshot = base();
  const scope = { ownerId: 'synthetic-owner', goalId: 'synthetic-goal', participationId: 'synthetic-participant', contextKey: contextKey(snapshot, BUILD) };
  const row: EpisodeRow = { id: 'synthetic-forecast', issued_at: snapshot.now, expires_at: new Date('2026-06-26T12:00:00Z'), payload: makeEpisode(snapshot, scope, BUILD) };
  return { snapshot, row };
}
test('#248 H+2 is the frozen local calendar maturity across DST, never raw elapsed time', () => {
  const { snapshot, row } = fixture();
  snapshot.logs.push({ localDate: '2026-03-29', status: 'DONE', amount: 10 });
  snapshot.now = new Date('2026-03-30T21:30:00Z');
  assert.equal(localDateIn(snapshot.now, row.payload.timezone), '2026-03-30');
  assert.equal(assessEpisode(row, snapshot, BUILD).state, 'PENDING');
  snapshot.now = new Date('2026-03-31T00:00:00Z');
  assert.deepEqual(assessEpisode(row, snapshot, BUILD).observation, { kind: 'EVENT', lower: 0, upper: 1 });
});
test('#248 missing is not skip; confirmed arrival with a gap yields an interval', () => {
  const { snapshot, row } = fixture();
  snapshot.now = new Date('2026-04-03T12:00:00Z');
  snapshot.logs.push({ localDate: '2026-03-29', status: 'SKIPPED', amount: null }, { localDate: '2026-03-31', status: 'DONE', amount: 10 });
  assert.deepEqual(assessEpisode(row, snapshot, BUILD).observation, { kind: 'INTERVAL', lower: 1, upper: 3 });
  snapshot.logs.pop();
  const censored = assessEpisode(row, snapshot, BUILD);
  assert.deepEqual(censored.observation, { kind: 'CENSOR', lower: 1, upper: 1 });
  assert.equal(censored.reason, 'CENSORED_BEFORE_MISSING');
  assert.equal(censored.closed, false);
  snapshot.logs.pop();
  assert.equal(assessEpisode(row, snapshot, BUILD).state, 'UNKNOWN');
});
test('#248 real amounts and first arrival are used; issuance day is not counted twice', () => {
  const { snapshot, row } = fixture();
  snapshot.now = new Date('2026-04-02T12:00:00Z');
  snapshot.logs.push({ localDate: '2026-03-29', status: 'DONE', amount: 4 }, { localDate: '2026-03-30', status: 'DONE', amount: 6 });
  assert.deepEqual(assessEpisode(row, snapshot, BUILD).observation, { kind: 'EVENT', lower: 1, upper: 2 });
  assert.equal(row.payload.q, 10);
  assert.equal(row.payload.threshold, 30);
  assert.equal(row.payload.comparison.appliedToStandard, false);
});
test('#248 future records do not alter the fixed training cutoff; later corrections do', () => {
  const { snapshot, row } = fixture();
  snapshot.now = new Date('2026-04-01T12:00:00Z');
  snapshot.logs.push({ localDate: '2026-03-29', status: 'SKIPPED', amount: null }, { localDate: '2026-03-30', status: 'SKIPPED', amount: null });
  const training = assessEpisode(row, snapshot, BUILD);
  snapshot.now = new Date('2026-04-04T12:00:00Z');
  snapshot.logs.push({ localDate: '2026-04-02', status: 'DONE', amount: 10 });
  assert.equal(assessEpisode(row, snapshot, BUILD, training.observedThrough).labelHash, training.labelHash);
  snapshot.logs.find(log => log.localDate === '2026-03-29')!.status = 'DONE';
  snapshot.logs.find(log => log.localDate === '2026-03-29')!.amount = 10;
  assert.notEqual(assessEpisode(row, snapshot, BUILD, training.observedThrough).labelHash, training.labelHash);
  assert.throws(() => assessEpisode(row, snapshot, BUILD, '2026-04-04'), /IMMATURE_CUTOFF/);
});
test('#248 prefix, settings, question, build and exact expiry invalidate old observations', () => {
  for (const change of ['prefix', 'settings', 'question', 'build', 'expiry']) {
    const { snapshot, row } = fixture();
    snapshot.now = new Date('2026-04-02T12:00:00Z');
    snapshot.logs.push({ localDate: '2026-03-29', status: 'DONE', amount: 10 });
    if (change === 'prefix') snapshot.logs[3]!.amount = 11;
    if (change === 'settings') snapshot.goal.goalSettingsRevision++;
    if (change === 'question') snapshot.question.answer_revision = '1';
    if (change === 'expiry') snapshot.now = row.expires_at;
    const checked = assessEpisode(row, snapshot, change === 'build' ? 'new-build' : BUILD);
    assert.equal(checked.observation, null);
    assert.ok(checked.state === 'INVALID' || checked.state === 'EXPIRED');
  }
});
test('#248 H30 closure and original fixed final target differ from the recurring milestone', () => {
  const { snapshot, row } = fixture();
  snapshot.now = new Date('2026-04-29T12:00:00Z');
  for (let d = 1; d <= 30; d++) snapshot.logs.push({ localDate: shiftLocalDate(origin, d), status: 'SKIPPED', amount: null });
  const result = assessEpisode(row, snapshot, BUILD);
  assert.deepEqual(result.observation, { kind: 'CENSOR', lower: 30, upper: 30 });
  assert.equal(result.closed, true);
  assert.equal(row.payload.finalCdf[0], 0);
  assert.ok(row.payload.milestone.cdf[0]! > 0);
  assert.equal(row.payload.comparison.finalExtrapolation, true);
});

test('#248 finite analytic scores survive adjacent displayed CDF rounding in the actual N=1 Engine', () => {
  // Pure frozen-payload numerical oracles; no database, fitting, or evaluation cohort.
  for (const kind of ['EVENT', 'CENSOR'] as const) {
    const { snapshot, row } = fixture();
    const posterior = kind === 'EVENT' ? { a: { alpha: 6, beta: 31 }, b: { alpha: 31, beta: 2 } } :
      { a: { alpha: 2, beta: 30 }, b: { alpha: 30, beta: 2 } };
    const frozen = completionDistributionForFrozenState(posterior, 'DONE', 1, DEFAULT_CONFIG);
    const u = MILESTONE_PROTOCOL.bound;
    const shifted = applyOffset(frozen.cdf, { ...identityFit('NUMERICAL_ORACLE'), status: 'FIT', u });
    // Both targets here are N=1: exercise the two score paths using one frozen numerical example.
    row.payload.milestone = frozen;
    row.payload.finalCdf = frozen.cdf;
    row.payload.remainingAmount = row.payload.q;
    row.payload.comparison = { ...row.payload.comparison, u, status: 'FIT',
      milestoneCdf: shifted.cdf, finalCdf: shifted.cdf };
    snapshot.now = new Date('2026-04-29T12:00:00Z');
    for (let d = 1; d <= 30; d++) snapshot.logs.push({ localDate: shiftLocalDate(origin, d),
      status: kind === 'EVENT' && d === 29 ? 'DONE' : 'SKIPPED',
      amount: kind === 'EVENT' && d === 29 ? row.payload.q : null });
    const observation = { kind, lower: kind === 'EVENT' ? 28 : 30, upper: kind === 'EVENT' ? 29 : 30 };
    const baseline = observationLoss(frozen.cdf, observation, 0).loss;
    const candidate = observationLoss(frozen.cdf, observation, u).loss;
    assert.ok(Number.isFinite(candidate) && candidate > baseline);
    if (kind === 'EVENT') {
      assert.equal(shifted.cdf[27], shifted.cdf[28]);
      assert.equal(observationLoss(shifted.cdf, observation, 0).loss, Infinity);
      assert.ok(Math.abs(candidate - 36.95994412099131) < 1e-12);
    } else assert.ok(Math.abs(candidate - 36.95994412099131) < 1e-12);
    const view = episodeView(row, snapshot, BUILD);
    assert.equal(view.state, kind);
    assert.deepEqual(view.milestoneScore, { baseline, candidate });
    assert.deepEqual(view.finalScore, { baseline, candidate, state: kind, extrapolation: true });
  }
});

test('#248 scoring does not rescue structural zero mass or a certain-arrival tail with epsilon', () => {
  for (const kind of ['EVENT', 'CENSOR'] as const) {
    const { snapshot, row } = fixture();
    const cdf = Array(30).fill(kind === 'EVENT' ? 0 : 1);
    row.payload.milestone.cdf = cdf;
    row.payload.finalCdf = cdf;
    row.payload.remainingAmount = row.payload.q;
    row.payload.comparison = { ...row.payload.comparison, u: MILESTONE_PROTOCOL.bound,
      milestoneCdf: cdf, finalCdf: cdf };
    snapshot.now = new Date('2026-03-31T12:00:00Z');
    snapshot.logs.push({ localDate: '2026-03-29', status: kind === 'EVENT' ? 'DONE' : 'SKIPPED',
      amount: kind === 'EVENT' ? row.payload.q : null });
    const view = episodeView(row, snapshot, BUILD);
    assert.deepEqual(view.milestoneScore, { baseline: null, candidate: null });
    assert.equal(view.finalScore.baseline, null);
    assert.equal(view.finalScore.candidate, null);
  }
});


test('#248 context includes prediction settings but excludes the first-DONE editing marker', () => {
  const { snapshot, row } = fixture();
  const key = contextKey(snapshot, BUILD);
  snapshot.goal.unitLocked = !snapshot.goal.unitLocked;
  assert.equal(contextKey(snapshot, BUILD), key);
  for (const field of ['unit', 'sessionAmount', 'timezone'] as const) {
    const changed = { ...snapshot, goal: { ...snapshot.goal,
      ...(field === 'unit' ? { unit: 'sessions' as const } : field === 'sessionAmount' ? { sessionAmount: 11 } : { timezone: 'UTC' }) } };
    assert.notEqual(contextKey(changed, BUILD), row.payload.scope.contextKey);
  }
});
