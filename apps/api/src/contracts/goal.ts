import { Type, type Static } from '@sinclair/typebox';
import { QuestionAnswers, AnswerRevision } from './question.ts';

// Goal API（#76）の契約。Architecture「API契約」「Data Model」とProduct R-02に対応する。
// 入力はDBのCHECK制約と同じ範囲をここで先に検証し、違反はすべて422のfieldsへ入れる（AjvはallErrors）。

const strict = { additionalProperties: false } as const;
const INT4_MAX = 2_147_483_647;

// #148: 設定版は回答版と独立し、int4範囲でCASに使う。
export const GoalSettingsRevision = Type.Integer({ minimum: 0, maximum: INT4_MAX });

export const GoalUnit = Type.Union([Type.Literal('minutes'), Type.Literal('sessions')]);
export type GoalUnit = Static<typeof GoalUnit>;

/** Goalのtimezoneでの暦日（YYYY-MM-DD）。 */
export const LocalDate = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });

export const TodayStatus = Type.Union([Type.Literal('DONE'), Type.Literal('SKIPPED'), Type.Literal('UNRECORDED')]);
export type TodayStatus = Static<typeof TodayStatus>;

// 一覧・取得・作成・編集で共通のGoal DTO。DB列をそのまま返さず、画面に必要な導出値を足す。
export const Goal = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    unit: GoalUnit,
    totalRequired: Type.Integer(),
    sessionAmount: Type.Integer(),
    initialProgress: Type.Integer(),
    timezone: Type.String(),
    /** 記録開始日。作成時のtimezoneの暦日で固定し、以後動かさない。 */
    recordStartDate: LocalDate,
    /** 記録が1件でもあるか。timezoneの編集制限に使う。開始前の累計は設定版付きで訂正できる（P-26）。 */
    hasLogs: Type.Boolean(),
    /** 過去DONEの永続marker、または現在の初期量がある場合は単位を変更できない。 */
    unitLocked: Type.Boolean(),
    goalSettingsRevision: GoalSettingsRevision,
    /** 応答時点の、このGoalのtimezoneでの今日。 */
    today: LocalDate,
    /** 今日の記録状態。行がなければUNRECORDED（SKIPPEDとみなさない）。 */
    todayStatus: TodayStatus,
    /**
     * 記録した累計（#146）。initialProgress＋今日までのDONEの量（記録は記録開始日以降だけ）。
     * Todayの予測のprogress.doneと同じ数え方で、一覧の進捗表示に使う。totalRequiredを超えることがある（R-02・R-08）。
     */
    progressDone: Type.Integer(),
    /** 到達予定日（#157、P-19）。任意で、未設定はnull。設定・変更のときはGoalのtimezoneの今日より後だけを受け付ける。 */
    targetDate: Type.Union([LocalDate, Type.Null()]),
  },
  strict,
);
export type Goal = Static<typeof Goal>;

export const GoalList = Type.Array(Goal);

// PostgreSQLのtextに保存できないNULはDBへ渡さず、他の違反と同じ422のfieldsへまとめる。
// 空白のみの拒否は維持し、改行・日本語・絵文字などNUL以外の文字は従来どおり扱う。
const title = Type.String({ minLength: 1, maxLength: 100, pattern: '^(?=[\\s\\S]*\\S)[^\\u0000]*$' });
const amount = Type.Integer({ minimum: 1, maximum: INT4_MAX });
const initialProgress = Type.Integer({ minimum: 0, maximum: INT4_MAX });
// APIのAjv custom formatでIANA名も検証し、通常のschema違反と一緒に全fieldsへ返す。
const timezone = Type.String({ minLength: 1, maxLength: 64, format: 'iana-timezone' });

export const GoalCreate = Type.Object(
  {
    title,
    unit: GoalUnit,
    totalRequired: amount,
    sessionAmount: amount,
    /** 記録開始日の前日までに終えた量。省略時は0。 */
    initialProgress: Type.Optional(initialProgress),
    timezone,
    questionPrior: Type.Optional(QuestionAnswers),
    /** 到達予定日。省略・nullは未設定。 */
    targetDate: Type.Optional(Type.Union([LocalDate, Type.Null()])),
  },
  strict,
);
export type GoalCreate = Static<typeof GoalCreate>;

// 省略した項目は維持する。nullは受け付けない（到達予定日だけは、nullで未設定に戻す）。空objectは422。
export const GoalPatch = Type.Object(
  {
    expectedGoalSettingsRevision: GoalSettingsRevision,
    title: Type.Optional(title),
    unit: Type.Optional(GoalUnit),
    totalRequired: Type.Optional(amount),
    sessionAmount: Type.Optional(amount),
    initialProgress: Type.Optional(initialProgress),
    timezone: Type.Optional(timezone),
    questionPrior: Type.Optional(QuestionAnswers),
    expectedAnswerRevision: Type.Optional(AnswerRevision),
    targetDate: Type.Optional(Type.Union([LocalDate, Type.Null()])),
  },
  { ...strict, minProperties: 1 },
);
export type GoalPatch = Static<typeof GoalPatch>;

export const GoalParams = Type.Object({ goalId: Type.String() }, strict);
export type GoalParams = Static<typeof GoalParams>;
