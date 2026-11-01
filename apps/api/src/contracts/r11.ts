import { Type, type Static } from '@sinclair/typebox';
import { Goal, GoalUnit, GoalSettingsRevision, LocalDate } from './goal.ts';
import { PredictionResultSchema, Today } from './log.ts';
import { AnswerRevision, QuestionAnswers } from './question.ts';

const strict = { additionalProperties: false } as const;
// GET Goal/Todayだけで使う読取表現の選択。書込bodyと回答版はqueryに依存しない。
export const R11ViewQuery = Type.Object({ view: Type.Optional(Type.Literal('r11')) }, strict);
export type R11ViewQuery = Static<typeof R11ViewQuery>;
export const GoalR11 = Type.Object({ ...Goal.properties,
  historyFingerprint: Type.Optional(Type.String()),
  historyRevision: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  schemaVersion: Type.Literal('r11-v1'), questionPrior: QuestionAnswers, answerRevision: AnswerRevision,
}, strict);
export type GoalR11 = Static<typeof GoalR11>;
export const PredictionR11 = Type.Object({ ...PredictionResultSchema.properties,
  config: Type.Object({ samples: Type.Number(), horizonDays: Type.Number(), seed: Type.Number() }, strict),
}, strict);
const source = Type.Union([Type.Literal('NONE'), Type.Literal('QUESTION'), Type.Literal('RECORDS'), Type.Literal('QUESTION_AND_RECORDS')]);
export const TodayR11 = Type.Object({ ...Today.properties,
  schemaVersion: Type.Literal('r11-v1'), prediction: PredictionR11,
  context: Type.Object({ historyRevision: Type.Optional(Type.String()), historyFingerprint: Type.Optional(Type.String()), recordStartDate: LocalDate, unit: GoalUnit, sessionAmount: Type.Integer(), goalSettingsRevision: GoalSettingsRevision, answerRevision: AnswerRevision, unitLocked: Type.Boolean() }, strict),
  provenance: Type.Object({ a: source, b: source }, strict),
  plan: Type.Union([Type.Object({ remainingAmount: Type.Integer(), remainingSessions: Type.Integer(), lastSessionAmount: Type.Integer() }, strict), Type.Null()]),
}, strict);
export type TodayR11 = Static<typeof TodayR11>;
