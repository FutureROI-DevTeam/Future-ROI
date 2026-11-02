import { Type, type Static } from '@sinclair/typebox';
import { GoalSettingsRevision, LocalDate } from './goal.ts';

// 記録（ActionLog）とTodayの契約（#77）。Architecture「API契約」「記録の上書きと予測の再計算」、Product R-03〜R-08に対応する。

const strict = { additionalProperties: false } as const;
const INT4_MAX = 2_147_483_647;

export const LogStatus = Type.Union([Type.Literal('DONE'), Type.Literal('SKIPPED')]);
export type LogStatus = Static<typeof LogStatus>;

// 保存済みの記録。SKIPPEDのamountはnull（Engine入力と同じ形）。
export const Log = Type.Object(
  {
    localDate: LocalDate,
    status: LogStatus,
    amount: Type.Union([Type.Integer(), Type.Null()]),
  },
  strict,
);
export type Log = Static<typeof Log>;

export const LogList = Type.Array(Log);

// #148: DONEは表示量を必ず送り、設定版で古い画面からの保存を拒否する。SKIPPEDに量を送らない。
export const LogPut = Type.Object(
  {
    status: LogStatus,
    expectedGoalSettingsRevision: GoalSettingsRevision,
    expectedHistoryRevision: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
    amount: Type.Optional(Type.Integer({ minimum: 1, maximum: INT4_MAX })),
  },
  { ...strict, allOf: [{ if: { properties: { status: { const: 'DONE' } }, required: ['status'] }, then: { required: ['amount'] } }] },
);
export type LogPut = Static<typeof LogPut>;

export const HistoryEdit = Type.Object({
  status: Type.Union([LogStatus, Type.Literal('UNRECORDED')]),
  amount: Type.Optional(Type.Integer({ minimum: 1, maximum: INT4_MAX })),
  expectedGoalSettingsRevision: GoalSettingsRevision,
  expectedHistoryRevision: Type.String({ pattern: '^[0-9]+$' }),
}, strict);
export type HistoryEdit = Static<typeof HistoryEdit>;
export const HistoryEditResult = Type.Object({ historyRevision: Type.String(), log: Type.Union([Log, Type.Null()]) }, strict);
export const LogParams = Type.Object({ goalId: Type.String(), localDate: LocalDate }, strict);
export type LogParams = Static<typeof LogParams>;

// 省略時は全期間。両端を含む。
export const LogsQuery = Type.Object({ from: Type.Optional(LocalDate), to: Type.Optional(LocalDate) }, strict);
export type LogsQuery = Static<typeof LogsQuery>;

// packages/prediction の PredictionResult と同じ形。応答の直列化に使うため、Engine側の型変更はここにも反映する
// （双方向の互換は apps/api/src/prediction/engine.ts で型検査する）。
const beta = Type.Object({ alpha: Type.Number(), beta: Type.Number() }, strict);
export const PredictionResultSchema = Type.Object(
  {
    modelVersion: Type.String(),
    today: Type.String(),
    todayStatus: Type.Union([Type.Literal('DONE'), Type.Literal('SKIPPED'), Type.Literal('UNRECORDED')]),
    progress: Type.Object({ done: Type.Number(), total: Type.Number(), completed: Type.Boolean() }, strict),
    observations: Type.Object(
      {
        nDD: Type.Number(),
        nDS: Type.Number(),
        nSD: Type.Number(),
        nSS: Type.Number(),
        effectiveTransitions: Type.Number(),
        observedDays: Type.Number(),
        recordedDays: Type.Number(),
      },
      strict,
    ),
    posterior: Type.Object({ a: beta, b: beta }, strict),
    coreMetric: Type.Union([
      Type.Object({ status: Type.Literal('available'), g50: Type.Number(), g80: Type.Number() }, strict),
      Type.Object({ status: Type.Literal('insufficient'), reason: Type.Literal('NO_SKIP_ORIGIN_TRANSITION') }, strict),
      Type.Object(
        { status: Type.Literal('not_applicable'), reason: Type.Union([Type.Literal('TODAY_RECORDED'), Type.Literal('COMPLETED')]) },
        strict,
      ),
    ]),
    completion: Type.Union([
      Type.Object(
        {
          status: Type.Literal('available'),
          scenario: Type.Union([Type.Literal('TODAY_DONE'), Type.Literal('CURRENT_STATE')]),
          p50Days: Type.Union([Type.Number(), Type.Null()]),
          p80Days: Type.Union([Type.Number(), Type.Null()]),
        },
        strict,
      ),
      Type.Object(
        {
          status: Type.Literal('insufficient'),
          reason: Type.Union([Type.Literal('NO_DONE_ORIGIN_TRANSITION'), Type.Literal('NO_SKIP_ORIGIN_TRANSITION')]),
        },
        strict,
      ),
      Type.Object({ status: Type.Literal('completed') }, strict),
    ]),
    config: Type.Object({ prior: Type.Number(), samples: Type.Number(), horizonDays: Type.Number(), seed: Type.Number() }, strict),
  },
  strict,
);

// GET /api/goals/:goalId/today。yesterdayMissingは「昨日が記録開始日以降で、昨日の記録がない」とき true。
export const Today = Type.Object(
  {
    today: LocalDate,
    yesterday: LocalDate,
    todayLog: Type.Union([Log, Type.Null()]),
    yesterdayMissing: Type.Boolean(),
    prediction: PredictionResultSchema,
  },
  strict,
);
export type Today = Static<typeof Today>;
