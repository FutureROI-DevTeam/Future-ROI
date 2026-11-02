import type { GoalR11, Log, TodayR11 } from '@contracts';
import { isSameSnapshot } from '../today/snapshot.ts';

export type FeedbackSnapshot = { goal: GoalR11; today: TodayR11; logs: Log[] };
export type SaveFeedback = {
  amount: number;
  points: number;
  unit: GoalR11['unit'];
  localDate: string;
  sequence?: number;
};
const logValue = (log: Log | undefined) => log?.status === 'DONE' ? log.amount ?? 0 : 0;
const sameLog = (x: Log | undefined, y: Log) => x?.localDate === y.localDate && x.status === y.status && x.amount === y.amount;
const otherLogs = (logs: Log[], date: string) => JSON.stringify(logs.filter(l => l.localDate !== date).sort((a, b) => a.localDate.localeCompare(b.localDate)));

/** 取得済みの整合したsnapshot同士の差。別端末が介在したときの今回のPUTの増分は証明できない。 */
export function confirmedSaveFeedback(before: FeedbackSnapshot, after: FeedbackSnapshot, saved: Log): SaveFeedback | null {
  if (!isSameSnapshot(before.goal, before.today, before.logs)
    || !isSameSnapshot(after.goal, after.today, after.logs)) {
    return null;
  }
  if (before.goal.progressDone !== before.today.prediction.progress.done
    || after.goal.progressDone !== after.today.prediction.progress.done) {
    return null;
  }
  if ([before.logs, after.logs].some(logs => new Set(logs.map(l => l.localDate)).size !== logs.length)) {
    return null;
  }
  for (const key of [
    'id', 'unit', 'timezone', 'recordStartDate', 'totalRequired', 'initialProgress',
    'sessionAmount', 'goalSettingsRevision', 'answerRevision', 'today',
  ] as const) {
    if (before.goal[key] !== after.goal[key]) {
      return null;
    }
  }
  if (saved.localDate < before.goal.recordStartDate || saved.localDate > before.today.today) {
    return null;
  }
  if (!sameLog(after.logs.find(l => l.localDate === saved.localDate), saved)) {
    return null;
  }
  if (otherLogs(before.logs, saved.localDate) !== otherLogs(after.logs, saved.localDate)) {
    return null;
  }
  if (before.goal.historyRevision !== undefined || after.goal.historyRevision !== undefined) {
    if (before.goal.historyRevision === undefined || after.goal.historyRevision === undefined
      || BigInt(after.goal.historyRevision) !== BigInt(before.goal.historyRevision) + 1n) return null;
  }
  const amount = logValue(saved) - logValue(before.logs.find(l => l.localDate === saved.localDate));
  if (after.today.prediction.progress.done - before.today.prediction.progress.done !== amount) {
    return null;
  }
  // 同値の再保存には加算表示しない。SKIPPED新規も量は0のまま。
  if (amount === 0) {
    return null;
  }
  return { amount, points: amount / before.goal.totalRequired * 100, unit: before.goal.unit, localDate: saved.localDate };
}

/** 同じoriginの別tabの操作検知。量・回答・認証情報は送信せず、保存期間も持たない。 */
const tabId = globalThis.crypto?.randomUUID?.();
export function createSavePeerGuard(goalId: string, onPeerActivity: () => void) {
  let version = 0;
  let busy = false;
  const peers = new Set<string>();
  const id = tabId;
  let channel: BroadcastChannel | undefined;
  try {
    if (id && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(`future-roi:save:${goalId}`);
    }
  } catch {
    // unavailable時は増分を出さない。
  }
  const send = (type: 'start' | 'end' | 'probe') => channel?.postMessage({ type, sender: id });
  if (channel) {
    channel.onmessage = event => {
      const m = event.data;
      if (!m || typeof m.sender !== 'string' || m.sender.length > 80 || m.sender === id) {
        return;
      }
      if (m.type === 'probe') {
        if (busy) send('start');
        return;
      }
      if (m.type !== 'start' && m.type !== 'end') {
        return;
      }
      version += 1;
      if (m.type === 'start') {
        peers.add(m.sender);
      } else {
        peers.delete(m.sender);
      }
      onPeerActivity();
    };
    send('probe');
  }
  return {
    get version() { return version; },
    get canCompare() { return channel !== undefined && peers.size === 0; },
    start() {
      busy = true;
      send('start');
    },
    end() {
      busy = false;
      send('end');
    },
    close() {
      if (busy) send('end');
      channel?.close();
      channel = undefined;
    },
  };
}
