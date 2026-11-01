import type { GoalR11 as Goal, Log, TodayR11 as Today } from '@contracts';

/**
 * 別々の GET で届く Goal・Today・記録の、重なる値が一致する組を照合する。
 * 同じDB transactionや全fieldの一致を保証する検査ではない。
 * 取得順や到着時刻に頼らず、食い違えば useTodayData が取り直す。
 *
 * API が同じ snapshot から返す照合値（FE で予測を計算し直さない）：
 * - 日付：Goal の today と Today の today
 * - 回答版：質問回答だけの更新・撤回でも、古い回答で計算した予測と新しいGoalを組み合わせない
 * - 予測に使った設定：R-11 の context（1回の量・単位・記録開始日）と Goal。
 *   総量・累計が同じでも、1回量だけ違う組み合わせを止める
 * - 総量：Goal の totalRequired と予測の progress.total
 * - 実績：Goal の initialProgress ＋ 記録開始日から今日までの DONE の量 と 予測の progress.done
 * - 今日の記録：記録の一覧の今日の行と Today の todayLog、Goal の todayStatus と予測の todayStatus
 * - 昨日の記録の有無：Today の yesterdayMissing と、記録の一覧に昨日の行があるか（昨日が記録開始日以降のとき）
 */
export function isSameSnapshot(goal: Goal, today: Today, logs: readonly Log[]): boolean {
  if (goal.historyRevision !== today.context.historyRevision) return false;
  if (today.context.historyFingerprint !== undefined
    && today.context.historyFingerprint !== JSON.stringify([...logs].sort((a,b) => a.localDate.localeCompare(b.localDate)).map(log => [log.localDate, log.status, log.amount]))) return false;
  if (goal.today !== today.today) {
    return false;
  }
  if (goal.goalSettingsRevision !== today.context.goalSettingsRevision) {
    return false;
  }
  if (goal.answerRevision !== today.context.answerRevision) {
    return false;
  }

  const { context } = today;
  if (
    context.sessionAmount !== goal.sessionAmount
    || context.unit !== goal.unit
    || context.recordStartDate !== goal.recordStartDate
  ) {
    return false;
  }
  if (goal.totalRequired !== today.prediction.progress.total) {
    return false;
  }
  if (goal.todayStatus !== today.prediction.todayStatus) {
    return false;
  }

  const done = logs
    .filter((log) => (
      log.status === 'DONE'
      && log.localDate >= goal.recordStartDate
      && log.localDate <= today.today
    ))
    .reduce((sum, log) => sum + (log.amount ?? 0), goal.initialProgress);
  if (done !== today.prediction.progress.done) {
    return false;
  }

  // YYYY-MM-DD どうしなので文字列の比較で日付の前後が分かる
  const yesterdayMissing = today.yesterday >= goal.recordStartDate
    && !logs.some((log) => log.localDate === today.yesterday);
  if (yesterdayMissing !== today.yesterdayMissing) {
    return false;
  }

  const todayLog = logs.find((log) => log.localDate === today.today) ?? null;
  return sameLog(todayLog, today.todayLog);
}

function sameLog(a: Log | null, b: Log | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.localDate === b.localDate && a.status === b.status && a.amount === b.amount;
}
