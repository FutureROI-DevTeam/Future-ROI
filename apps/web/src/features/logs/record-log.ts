import type { Log, LogPut } from '@contracts';
import { ApiError } from '../../api/client.ts';
import { isUnauthenticated } from '../../api/http.ts';

/**
 * 記録の保存（R-03・R-04、#79・#80）で、画面から切り離した判定。Node のテストで確かめる。
 * DONE は表示した量を必ず送り、設定版の競合で別の量へ置き換わることを防ぐ。
 */

/** 保存しようとしている日合計。DONE は表示時の量を必ず持つ。 */
export type RecordChoice = { status: 'DONE'; amount: number } | { status: 'SKIPPED'; amount: null };

export function toLogPut(choice: RecordChoice, expectedGoalSettingsRevision: number): LogPut {
  if (choice.status === 'SKIPPED') {
    return { status: 'SKIPPED', expectedGoalSettingsRevision };
  }
  return { status: 'DONE', amount: choice.amount, expectedGoalSettingsRevision };
}

/** 画面に出す記録の要約（「やった・20分」「やった・90分」「休んだ」）。amount は記録の単位で量を書く（copy/amount.ts）。 */
export function describeChoice(
  choice: RecordChoice,
  sessionAmount: number,
  amount: (n: number) => string,
  restLabel: string,
): string {
  if (choice.status === 'SKIPPED') {
    return restLabel;
  }
  return `やった・${amount(choice.amount ?? sessionAmount)}`;
}

/**
 * 保存の失敗の種類。どれも「まだ記録されていない」ことを伝え、保存済みに見せない。
 * - signed-out：ログインが切れた（401）
 * - date：記録できる日（今日・昨日、記録開始日以降）から外れた。日付が変わった後に古い画面で押した場合など
 * - failed：通信・サーバーの失敗。同じ内容で再試行できる
 */
export type SaveFailureKind = 'signed-out' | 'date' | 'day-changed' | 'settings' | 'failed';

/** Today の操作は API で分かった今日だけに送る。昨日の補完・訂正には適用しない。
 * Goal が先に翌日へ進んだ場合も、Today が先に進んだ場合も、古い表示の日へ送らない。
 * 初回 Today 取得失敗時は、取得できた Goal の今日で記録できる。
 */
export function isCurrentToday(date: string, goalToday?: string, todayDate?: string): boolean {
  return date === goalToday && (todayDate === undefined || date >= todayDate);
}

/** 送信直前に日付が変わった場合も、HTTP を送らず選び直しを案内する。 */
export class TodayDateChangedError extends Error {
  constructor() {
    super('Today date changed');
  }
}

export function classifySaveError(error: unknown): SaveFailureKind {
  if (error instanceof TodayDateChangedError) {
    return 'day-changed';
  }
  if (isUnauthenticated(error)) {
    return 'signed-out';
  }
  if (error instanceof ApiError && error.status === 409 && (error.body?.error.code === 'GOAL_SETTINGS_CONFLICT' || error.body?.error.code === 'HISTORY_CONFLICT')) {
    return 'settings';
  }
  if (error instanceof ApiError && error.status === 422) {
    const code = error.body?.error.code;
    if (code === 'LOG_DATE_OUT_OF_WINDOW' || code === 'LOG_DATE_BEFORE_START') {
      return 'date';
    }
  }
  return 'failed';
}

/**
 * 昨日の記録の状態（R-04、#80）。記録済みの昨日だけ「昨日：やった・20分［変更］」から訂正できる。
 * - before-start：昨日が記録開始日より前。補完も訂正も出さない
 * - missing：未記録。既存の「昨日はどうでしたか？」で補完する（出すかどうかは /today の yesterdayMissing に従う）
 * - recorded：記録済み。保存済みの記録（量を含む）を訂正の初期値にする
 */
export type YesterdayRecord = { kind: 'before-start' } | { kind: 'missing' } | { kind: 'recorded'; log: Log };

export function yesterdayRecord(yesterday: string, recordStartDate: string, logs: readonly Log[]): YesterdayRecord {
  // YYYY-MM-DD どうしなので文字列の比較で日付の前後が分かる
  if (yesterday < recordStartDate) {
    return { kind: 'before-start' };
  }
  const log = logs.find((l) => l.localDate === yesterday);
  return log ? { kind: 'recorded', log } : { kind: 'missing' };
}

/** 保存済みの記録を、訂正の初期値（RecordChoice）にする。DONE は保存済みの量のまま（今の1回の量に置き換えない）。 */
export function choiceFromLog(log: Log): RecordChoice {
  if (log.status === 'DONE') {
    if (log.amount === null) {
      throw new TypeError('DONE log must have an amount');
    }
    return { status: 'DONE', amount: log.amount };
  }
  return { status: 'SKIPPED', amount: null };
}

/** 通常保存と失敗後の再試行に同じ排他を適用する（#88）。 */
export function unlessLocked(locked: boolean, action: () => void): () => void {
  return () => {
    if (!locked) action();
  };
}

/**
 * 今日と昨日を同時に編集しない（#88の採択条件）。どちらかを編集・保存している間は、もう片方を始めない・送らない。
 * - 今日の編集：記録済みの今日の選び直し（changing）、または記録の2択を出している間の量の入力
 * - 昨日の編集：記録済みの昨日の訂正
 */
export function editLocks(state: {
  changingToday: boolean;
  todayAmountEditing: boolean;
  todayChoicesShown: boolean;
  todaySaving: boolean;
  yesterdayEditing: boolean;
}): { todayAmountEditing: boolean; yesterdayLocked: boolean; todayLocked: boolean; cancelChangeLocked: boolean } {
  // 量の入力は2択を出しているときだけ開いている（別のタブで記録されて2択が消えたら、昨日を止めたままにしない）
  const todayAmountEditing = state.todayAmountEditing && state.todayChoicesShown;
  return {
    todayAmountEditing,
    yesterdayLocked: state.changingToday || todayAmountEditing || state.todaySaving,
    todayLocked: state.yesterdayEditing,
    // 今日の保存中は「変更をやめる」で選び直しを閉じない。閉じて保存の状態を消すと、遅れて届いた失敗と再試行を見失う
    cancelChangeLocked: state.todaySaving,
  };
}

/**
 * 決めた総量に届いた日（デザイン D6）。初期量から記録の DONE を日付順に足し、総量に届いた最初の日。
 * 初期量だけで届いていれば null（記録開始前に届いていた）。届いていなければ undefined。
 * 記録の事実をたどるだけで、予測の計算はしない。
 */
export function reachedDate(initialProgress: number, totalRequired: number, logs: readonly Log[]): string | null | undefined {
  if (initialProgress >= totalRequired) {
    return null;
  }
  let done = initialProgress;
  // YYYY-MM-DD どうしなので文字列の比較で日付順に並ぶ
  const byDateAscending = (a: Log, b: Log) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0);
  for (const log of [...logs].sort(byDateAscending)) {
    if (log.status !== 'DONE') {
      continue;
    }
    done += log.amount ?? 0;
    if (done >= totalRequired) {
      return log.localDate;
    }
  }
  return undefined;
}
