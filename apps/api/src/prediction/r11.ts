import type { TodayR11 } from '../contracts/r11.ts';
import { localDateIn, shiftLocalDate } from '../goals/local-date.ts';
import { validateSavedQuestion } from '../questions/snapshot.ts';
import { runQuestionPrediction } from './engine.ts';
import type { TodaySnapshot } from './snapshot.ts';

// 呼出元はsnapshot取得とDB接続返却を完了してから呼ぶ。回答は保存mappingで全実ログへ接続する。
export function buildR11Today(snapshot: TodaySnapshot): TodayR11 {
  const answerContext = {
    unit: snapshot.goal.unit,
    sessionAmount: snapshot.goal.sessionAmount,
    recordStartDate: snapshot.goal.recordStartDate,
  };
  const saved = validateSavedQuestion(snapshot.question, answerContext);
  // 回答版も同じDB snapshotから返す。保存回答snapshotの文脈や設定版の意味は変えない。
  const context = {
    ...answerContext,
    goalSettingsRevision: snapshot.goal.goalSettingsRevision,
    answerRevision: saved.revision,
    unitLocked: snapshot.goal.unitLocked,
  };
  const today = localDateIn(snapshot.now, snapshot.goal.timezone);
  const yesterday = shiftLocalDate(today, -1);
  const { prediction, provenance, plan } = runQuestionPrediction({
    prediction: {
      goal: {
        totalRequired: snapshot.goal.totalRequired,
        initialProgress: snapshot.goal.initialProgress,
        sessionAmount: snapshot.goal.sessionAmount,
      },
      logs: snapshot.logs,
      today,
    },
    answers: saved.answers,
    mapping: saved.mapping,
  });
  return {
    schemaVersion: 'r11-v1',
    today,
    yesterday,
    todayLog: snapshot.logs.find(log => log.localDate === today) ?? null,
    yesterdayMissing: yesterday >= context.recordStartDate && !snapshot.logs.some(log => log.localDate === yesterday),
    prediction,
    context,
    provenance,
    plan,
  };
}
