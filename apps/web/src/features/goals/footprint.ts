import type { Goal, Log } from '@contracts';
import { addDays } from '../../copy/date.ts';
import { isRecordAmount } from '../../copy/amount.ts';

export type FootprintGoal = Pick<Goal, 'id' | 'title' | 'unit' | 'timezone' | 'recordStartDate' | 'today' | 'todayStatus' | 'initialProgress' | 'progressDone'>;
/** logsは期間省略の全件GETが成功したときだけ渡す。未取得・失敗・再取得中はnull。 */
export type FootprintSource = { goal: FootprintGoal; logs: readonly Log[] | null };
export type FootprintDay = {
  date: string;
  kind: 'done' | 'rest' | 'unrecorded' | 'unconfirmed' | 'before-start' | 'future';
  goals: FootprintGoal[];
  complete: boolean;
};
const shift = (date: string, days: number) => addDays(date, days).toISOString().slice(0, 10);

function checkedLogs({ goal, logs }: FootprintSource): Map<string, Log> | null {
  if (!logs) {
    return null;
  }
  const result = new Map<string, Log>();
  for (const log of logs) {
    if (log.localDate < goal.recordStartDate || log.localDate > goal.today) {
      return null;
    }
    if (log.status === 'DONE'
      ? !isRecordAmount(log.amount) : log.status !== 'SKIPPED' || log.amount !== null) {
      return null;
    }
    const previous = result.get(log.localDate);
    if (previous && (previous.status !== log.status || previous.amount !== log.amount)) {
      return null;
    }
    result.set(log.localDate, log);
  }
  const done = [...result.values()].reduce(
    (sum, log) => sum + (log.status === 'DONE' ? log.amount ?? 0 : 0),
    goal.initialProgress,
  );
  if (done !== goal.progressDone || (result.get(goal.today)?.status ?? 'UNRECORDED') !== goal.todayStatus) {
    return null;
  }
  return result;
}

/** 単位量を合算せず、現在のGoalの同じ記録日をまとめる。UTCの実時間への変換はしない。 */
export function buildFootprint(sources: readonly FootprintSource[], days = 28, end?: string) {
  const unique = [...new Map(sources.map(source => [source.goal.id, source])).values()];
  const entries = unique.map(source => ({ ...source, records: checkedLogs(source) }));
  const today = entries.map(entry => entry.goal.today).sort().at(-1);
  if (!today) {
    return { today: null, days: [] as FootprintDay[], streak: null, sameToday: true, complete: true };
  }
  const sameToday = entries.every(entry => entry.goal.today === today);
  const complete = entries.every(entry => entry.records !== null);
  const day = (date: string): FootprintDay => {
    const active = entries.filter(entry => date >= entry.goal.recordStartDate && date <= entry.goal.today);
    const pending = active.some(entry => entry.records === null)
      || entries.some(entry => date >= entry.goal.recordStartDate && date > entry.goal.today);
    const goals = active.filter(entry => entry.records?.get(date)?.status === 'DONE').map(entry => entry.goal);
    const rest = active.some(entry => entry.records?.get(date)?.status === 'SKIPPED');
    return {
      date,
      goals,
      complete: !pending,
      kind: date > today ? 'future' : goals.length ? 'done' : pending ? 'unconfirmed'
        : !active.length ? 'before-start' : rest ? 'rest' : 'unrecorded',
    };
  };
  let streak: number | null = null;
  if (complete && sameToday) {
    const active = entries.filter(entry => entry.goal.recordStartDate <= today);
    const allRest = active.length > 0 && active.every(entry => entry.records?.get(today)?.status === 'SKIPPED');
    streak = 0;
    // 未記録の日が残っていれば、今日の実施前も昨日までの連続を残す。全Goalの明示休みは実施にしない。
    if (!allRest) {
      for (
        let date = day(today).kind === 'done' ? today : shift(today, -1);
        day(date).kind === 'done';
        date = shift(date, -1)
      ) {
        streak++;
      }
    }
  }
  return { today, days: Array.from({ length: days }, (_, index) => day(shift(end ?? today, index - days + 1))), streak, sameToday, complete };
}
