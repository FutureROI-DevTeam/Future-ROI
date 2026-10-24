import { createHash } from 'node:crypto';
import { DEFAULT_CONFIG, completionDistributionForFrozenState, frozenCompletionCdf } from '@futureroi/prediction';
import type { TodaySnapshot } from '../prediction/snapshot.ts';
import { makeEvaluation, prefixFingerprint } from '../evaluation/assessment.ts';
import { localDateIn, shiftLocalDate } from '../goals/local-date.ts';
import {
  MILESTONE_PROTOCOL,
  applyOffset,
  identityFit,
  observationLoss,
  type Observation,
  type OffsetFit,
  type Scope,
} from './core.ts';

// jsonbはkey順を保存しない。配列順は維持し、objectだけを正規化して発行/読取のhashを一致させる。
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function contextKey(snapshot: TodaySnapshot, buildVersion: string) {
  const { totalRequired, initialProgress, sessionAmount, timezone, recordStartDate, unit, goalSettingsRevision } = snapshot.goal;
  // Editing eligibility markers change after normal observations; they are not prediction conditions.
  return fingerprint({
    goal: { totalRequired, initialProgress, sessionAmount, timezone, recordStartDate, unit, goalSettingsRevision },
    answerRevision: snapshot.question.answer_revision,
    question: snapshot.question.question_prior_snapshot,
    config: DEFAULT_CONFIG,
    buildVersion,
    protocol: MILESTONE_PROTOCOL.version,
  });
}

export type FrozenEpisode = {
  schemaVersion: 'session-milestone-forecast-v1'; scope: Scope; origin: string; timezone: string;
  unit: 'minutes' | 'sessions'; q: number; threshold: number; remainingAmount: number;
  goalSettingsRevision: number; answerRevision: number; buildVersion: string; prefixHash: string;
  modelVersion: string; source: ReturnType<typeof makeEvaluation>;
  milestone: ReturnType<typeof completionDistributionForFrozenState>; finalCdf: number[];
  comparison: { artifactId: string | null; artifactHash: string | null; u: number;
    milestoneCdf: number[]; finalCdf: number[]; status: OffsetFit['status']; reason: string | null;
    appliedToStandard: false; finalExtrapolation: true; evidenceScope: 'milestone' };
};
export type EpisodeRow = { id: string; issued_at: Date; expires_at: Date; payload: FrozenEpisode };
export type Assessment = { state: 'EVENT' | 'INTERVAL' | 'CENSOR' | 'PENDING' | 'UNKNOWN' | 'INVALID' | 'EXPIRED';
  reason: string | null; closed: boolean; observation: Observation | null; observedThrough: string; labelHash: string };

export function makeEpisode(
  snapshot: TodaySnapshot,
  scope: Scope,
  buildVersion: string,
  candidate?: { id: string; hash: string; fit: OffsetFit },
): FrozenEpisode {
  const source = makeEvaluation(snapshot, buildVersion);
  if (source.predictionStatus !== 'available' || !source.computation) {
    throw new Error('BASELINE_INSUFFICIENT');
  }
  const q = snapshot.goal.sessionAmount, remaining = source.remainingAmount;
  if (remaining < q) throw new Error('NEAR_GOAL');
  const initialState = source.issuedTodayStatus;
  const milestone = completionDistributionForFrozenState(source.posterior, initialState, 1, source.config);
  const n = Number((BigInt(remaining) + BigInt(q) - 1n) / BigInt(q));
  const finalCdf = frozenCompletionCdf({
    posterior: source.posterior,
    initialState,
    requiredFutureDone: n,
    computation: source.computation,
  });
  const fit = candidate?.fit ?? identityFit('NO_VALID_ARTIFACT');
  const milestoneComparison = applyOffset(milestone.cdf, fit), finalComparison = applyOffset(finalCdf, fit);
  return { schemaVersion: 'session-milestone-forecast-v1', scope, origin: source.anchorDate, timezone: source.timezone,
    unit: source.unit, q, threshold: snapshot.goal.totalRequired - remaining + q, remainingAmount: remaining,
    goalSettingsRevision: source.goalSettingsRevision, answerRevision: source.answerRevision, buildVersion,
    prefixHash: source.prefixHash, modelVersion: source.modelVersion, source, milestone, finalCdf,
    comparison: {
      artifactId: candidate?.id ?? null,
      artifactHash: candidate?.hash ?? null,
      u: milestoneComparison.u,
      milestoneCdf: milestoneComparison.cdf,
      finalCdf: finalComparison.cdf,
      status: fit.status,
      reason: fit.reason,
      appliedToStandard: false,
      finalExtrapolation: true,
      evidenceScope: 'milestone',
    },
  };
}

/** observedThroughを指定した再照合はtraining cutoffを固定し、新しい未来記録を旧fitへ入れない。 */
export function assessEpisode(
  row: EpisodeRow,
  snapshot: TodaySnapshot,
  buildVersion: string,
  observedThrough?: string,
): Assessment {
  const saved = row.payload;
  const today = localDateIn(snapshot.now, saved.timezone);
  const lastMature = shiftLocalDate(today, -2), end = shiftLocalDate(saved.origin, 30);
  const through = observedThrough ?? (lastMature < end ? lastMature : end);
  const empty = (state: Assessment['state'], reason: string, closed = true): Assessment =>
    ({ state, reason, closed, observation: null, observedThrough: through, labelHash: fingerprint([state, reason, through]) });
  if (row.expires_at <= snapshot.now) return empty('EXPIRED', 'SOURCE_EXPIRED');
  if (
    saved.schemaVersion !== 'session-milestone-forecast-v1' ||
    saved.scope.contextKey !== contextKey(snapshot, buildVersion)
  ) {
    return empty('INVALID', 'CONTEXT_CHANGED');
  }
  if (prefixFingerprint(snapshot.logs, saved.origin) !== saved.prefixHash) return empty('INVALID', 'INPUT_CORRECTED');
  if (through > lastMature || through > end) throw new Error('IMMATURE_CUTOFF');
  if (through <= saved.origin) return empty('PENDING', 'PENDING_MATURITY', false);
  const records = new Map(snapshot.logs.map(log => [log.localDate, log]));
  let known = 0, complete = true, certainBelow = 0;
  const inputs: unknown[] = [];
  for (let day = 1; day <= 30; day++) {
    const date = shiftLocalDate(saved.origin, day);
    if (date > through) break;
    const log = records.get(date);
    inputs.push([date, log?.status ?? null, log?.amount ?? null]);
    if (!log) {
      complete = false;
    } else if (log.status === 'DONE') {
      known += log.amount!;
    }
    if (known >= saved.q) {
      const observation: Observation = {
        kind: complete ? 'EVENT' : 'INTERVAL',
        lower: complete ? day - 1 : certainBelow,
        upper: day,
      };
      return { state: observation.kind, reason: null, closed: true, observation,
        observedThrough: date, labelHash: fingerprint({ observation, inputs }) };
    }
    if (complete) certainBelow = day;
  }
  const closed = today >= shiftLocalDate(end, 2);
  if (certainBelow === 0) {
    return { ...empty('UNKNOWN', 'NO_CONFIRMED_RISK_TIME', closed), labelHash: fingerprint(inputs) };
  }
  const observation: Observation = { kind: 'CENSOR', lower: certainBelow, upper: certainBelow };
  return { state: 'CENSOR', reason: complete ? null : 'CENSORED_BEFORE_MISSING', closed, observation,
    observedThrough: through, labelHash: fingerprint({ observation, inputs }) };
}

export function episodeView(row: EpisodeRow, snapshot: TodaySnapshot, buildVersion: string) {
  const assessment = assessEpisode(row, snapshot, buildVersion);
  const saved = row.payload;
  // Score the frozen mathematical odds transform; displayed CDF differences may lose tiny positive mass.
  const score = (cdf: number[], u: number) => {
    if (!assessment.observation) return null;
    const value = observationLoss(cdf, assessment.observation, u).loss;
    return Number.isFinite(value) ? value : null;
  };
  const finalObservation = assessEpisode(
    { ...row, payload: { ...saved, q: saved.remainingAmount } },
    snapshot,
    buildVersion,
  );
  const finalScore = (cdf: number[], u: number) => {
    if (!finalObservation.observation) return null;
    const value = observationLoss(cdf, finalObservation.observation, u).loss;
    return Number.isFinite(value) ? value : null;
  };
  return { id: row.id, issuedAt: row.issued_at.toISOString(), expiresAt: row.expires_at.toISOString(),
    origin: saved.origin, q: saved.q, threshold: saved.threshold, unit: saved.unit,
    state: assessment.state, reason: assessment.reason, observation: assessment.observation, closed: assessment.closed,
    comparison: saved.comparison, baselineMilestoneCdf: saved.milestone.cdf, baselineFinalCdf: saved.finalCdf,
    milestoneScore: { baseline: score(saved.milestone.cdf, 0), candidate: score(saved.milestone.cdf, saved.comparison.u) },
    finalScore: { baseline: finalScore(saved.finalCdf, 0), candidate: finalScore(saved.finalCdf, saved.comparison.u),
      state: finalObservation.state, extrapolation: true as const },
    baselineEngineQuantiles: { p50Days: saved.source.p50Days, p80Days: saved.source.p80Days },
    candidateMilestoneQuantiles: saved.comparison.u === 0 ?
      { p50Days: saved.milestone.p50Days !== null && saved.milestone.p50Days <= 30 ? saved.milestone.p50Days : null,
        p80Days: saved.milestone.p80Days !== null && saved.milestone.p80Days <= 30 ? saved.milestone.p80Days : null } :
      { p50Days: saved.comparison.milestoneCdf.findIndex(p => p >= .5) + 1 || null,
        p80Days: saved.comparison.milestoneCdf.findIndex(p => p >= .8) + 1 || null } };
}
