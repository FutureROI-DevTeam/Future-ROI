import { createHash } from 'node:crypto';
import type { EvaluationForecast, EvaluationQuantileCounts, EvaluationState } from '../contracts/evaluation.ts';
import type { Log } from '../contracts/log.ts';
import { localDateIn, shiftLocalDate } from '../goals/local-date.ts';
import type { TodayR11 } from '../contracts/r11.ts';
import { runQuestionPredictionWithDiagnostics } from '../prediction/engine.ts';
import { validateSavedQuestion } from '../questions/snapshot.ts';
import type { TodaySnapshot } from '../prediction/snapshot.ts';

export type SavedEvaluation = Omit<EvaluationForecast, 'id' | 'issuedAt' | 'expiresAt' | 'p50State' | 'p80State'> & {
  schemaVersion: 'evaluation-v1';
  prefixHash: string;
  sessionAmount: number;
  issuedTodayStatus: 'DONE' | 'SKIPPED';
  // 数値の十分統計量。古い全日次記録や回答全文を複製する履歴機能ではない。
  observations: TodayR11['prediction']['observations'];
  posterior: TodayR11['prediction']['posterior'];
  config: TodayR11['prediction']['config'];
  provenance: TodayR11['provenance'];
  mappingVersion: string;
  usedPrior: TodayR11['prediction']['posterior'];
  computation: import('@futureroi/prediction').CompletionComputation | null;
  stateVersion: 'explicit-daily-state-v1';
  featureVersion: 'adjacent-record-counts-v1';
  evaluationVersion: 'frozen-remaining-quantile-v1';
  presentationPolicyVersion: 'manual-current-state-v1';
};
export type ForecastRow = { id: string; issued_at: Date; expires_at: Date; payload: SavedEvaluation };

export function prefixFingerprint(logs: readonly Log[], anchor: string): string {
  return createHash('sha256')
    .update(JSON.stringify(logs
      .filter(log => log.localDate <= anchor)
      .map(log => [log.localDate, log.status, log.amount])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))))
    .digest('hex');
}

export function makeEvaluation(snapshot: TodaySnapshot, buildVersion: string): SavedEvaluation {
  const today = localDateIn(snapshot.now, snapshot.goal.timezone);
  const savedQuestion = validateSavedQuestion(snapshot.question, {
    unit: snapshot.goal.unit,
    sessionAmount: snapshot.goal.sessionAmount,
    recordStartDate: snapshot.goal.recordStartDate,
  });
  const { prediction, provenance } = runQuestionPredictionWithDiagnostics({
    prediction: {
      goal: {
        totalRequired: snapshot.goal.totalRequired,
        initialProgress: snapshot.goal.initialProgress,
        sessionAmount: snapshot.goal.sessionAmount,
      },
      logs: snapshot.logs,
      today,
    },
    answers: savedQuestion.answers,
    mapping: savedQuestion.mapping,
  });
  if (prediction.todayStatus === 'UNRECORDED' || prediction.progress.completed) {
    throw new Error('Evaluation requires recorded, incomplete state');
  }

  const completion = prediction.completion;
  return { schemaVersion: 'evaluation-v1', anchorDate: today, timezone: snapshot.goal.timezone, unit: snapshot.goal.unit,
    remainingAmount: prediction.progress.total - prediction.progress.done,
    sessionAmount: snapshot.goal.sessionAmount, issuedTodayStatus: prediction.todayStatus,
    goalSettingsRevision: snapshot.goal.goalSettingsRevision, answerRevision: savedQuestion.revision,
    modelVersion: prediction.modelVersion, buildVersion,
    predictionStatus: completion.status === 'available' ? 'available' : 'insufficient',
    predictionReason: completion.status === 'insufficient' ? completion.reason : null,
    p50Days: completion.status === 'available' ? completion.p50Days : null,
    p80Days: completion.status === 'available' ? completion.p80Days : null,
    prefixHash: prefixFingerprint(snapshot.logs, today),
    observations: prediction.observations, posterior: prediction.posterior, config: prediction.config, provenance,
    mappingVersion: savedQuestion.mapping.version,
    usedPrior: {
      a: {
        alpha: prediction.posterior.a.alpha - prediction.observations.nDD,
        beta: prediction.posterior.a.beta - prediction.observations.nDS,
      },
      b: {
        alpha: prediction.posterior.b.alpha - prediction.observations.nSD,
        beta: prediction.posterior.b.beta - prediction.observations.nSS,
      },
    },
    computation: completion.status === 'available' ? completion.computation ?? null : null,
    stateVersion: 'explicit-daily-state-v1', featureVersion: 'adjacent-record-counts-v1',
    evaluationVersion: 'frozen-remaining-quantile-v1', presentationPolicyVersion: 'manual-current-state-v1' };
}

function quantileState(
  saved: SavedEvaluation,
  q: number | null,
  snapshot: TodaySnapshot,
  now: Date,
  horizon: number,
): EvaluationState {
  if (
    snapshot.goal.goalSettingsRevision !== saved.goalSettingsRevision ||
    snapshot.question.answer_revision !== String(saved.answerRevision)
  ) {
    return 'CONTEXT_CHANGED';
  }
  if (prefixFingerprint(snapshot.logs, saved.anchorDate) !== saved.prefixHash) return 'INPUT_CORRECTED';
  if (q === null) return 'NULL';
  if (q > horizon) return 'OUTSIDE_HORIZON';
  const today = localDateIn(now, saved.timezone);
  const last = shiftLocalDate(saved.anchorDate, q);
  // 昨日の値はまだ訂正可能。UTCの経過時間ではなく凍結timezoneの暦日で成熟を待つ。
  if (today < shiftLocalDate(last, 2)) return 'PENDING';
  const records = new Map(snapshot.logs.map(log => [log.localDate, log]));
  let amount = 0, missing = false;
  for (let d = 1; d <= q; d++) {
    const log = records.get(shiftLocalDate(saved.anchorDate, d));
    if (!log) {
      missing = true;
    } else if (log.status === 'DONE') {
      amount += log.amount ?? 0;
    }
  }
  // 既知量だけで到達していれば、途中にUNKNOWNがあってもq日以内の到達は確定する。
  return amount >= saved.remainingAmount ? 'REACHED' : missing ? 'UNKNOWN' : 'NOT_REACHED';
}

export function assessEvaluation(
  row: ForecastRow,
  snapshot: TodaySnapshot,
  now: Date,
  horizon: number,
): EvaluationForecast {
  const saved = row.payload;
  if (saved.schemaVersion !== 'evaluation-v1') throw new Error('Unsupported evaluation snapshot');
  return { id: row.id, issuedAt: row.issued_at.toISOString(), expiresAt: row.expires_at.toISOString(),
    anchorDate: saved.anchorDate, timezone: saved.timezone, unit: saved.unit, remainingAmount: saved.remainingAmount,
    goalSettingsRevision: saved.goalSettingsRevision, answerRevision: saved.answerRevision,
    modelVersion: saved.modelVersion, buildVersion: saved.buildVersion, predictionStatus: saved.predictionStatus,
    predictionReason: saved.predictionReason, p50Days: saved.p50Days, p80Days: saved.p80Days,
    p50State: quantileState(saved, saved.p50Days, snapshot, now, horizon),
    p80State: quantileState(saved, saved.p80Days, snapshot, now, horizon) };
}

export function countQuantiles(
  forecasts: readonly EvaluationForecast[],
  field: 'p50State' | 'p80State',
): EvaluationQuantileCounts {
  const counts: EvaluationQuantileCounts = { REACHED: 0, NOT_REACHED: 0, UNKNOWN: 0, PENDING: 0, NULL: 0,
    OUTSIDE_HORIZON: 0, INPUT_CORRECTED: 0, CONTEXT_CHANGED: 0, lowerCoverage: null, upperCoverage: null };
  for (const forecast of forecasts) counts[forecast[field]]++;
  const mature = counts.REACHED + counts.NOT_REACHED + counts.UNKNOWN;
  if (mature > 0) {
    counts.lowerCoverage = counts.REACHED / mature;
    counts.upperCoverage = (counts.REACHED + counts.UNKNOWN) / mature;
  }
  return counts;
}
