// APIとWebで共有する契約（TypeBox）。APIは実行時検証と応答の直列化、Webは型と実行時確認に使う。
// Webからは vite / tsconfig の alias `@contracts` でこのファイルを参照する。
// Web bundleにも入るため、ここからpg・server専用処理・環境変数をimportしない。
export { ErrorBody } from './error.ts';
export { Goal, GoalCreate, GoalList, GoalParams, GoalPatch, GoalUnit, LocalDate, TodayStatus } from './goal.ts';
export { Health } from './health.ts';
export { HistoryEdit, HistoryEditResult, Log, LogChange, LogSaveResult, LogSaveQuery, LogList, LogParams, LogPut, LogStatus, LogsQuery, PredictionResultSchema, Today } from './log.ts';
export { QuestionAnswer, QuestionAnswers, AnswerRevision } from './question.ts';
export { GoalR11, PredictionR11, TodayR11, R11ViewQuery } from './r11.ts';
export { EvaluationPolicy, EvaluationForecast, EvaluationState, EvaluationQuantileCounts, EvaluationReport, EvaluationParticipation, EvaluationCapture } from './evaluation.ts';
