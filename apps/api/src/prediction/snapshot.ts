import type { Log } from '../contracts/log.ts';
import type { QuestionRow } from '../questions/snapshot.ts';

export type TodaySnapshot = {
  goal: {
    totalRequired: number;
    initialProgress: number;
    sessionAmount: number;
    timezone: string;
    recordStartDate: string;
    unit: 'minutes' | 'sessions';
    goalSettingsRevision: number;
    historyRevision?: string;
    unitLocked: boolean;
  };
  question: QuestionRow;
  logs: Log[];
  now: Date;
};

export type SnapshotGoalRow = {
  total_required: number;
  initial_progress: number;
  session_amount: number;
  timezone: string;
  record_start_date: string;
  unit: 'minutes' | 'sessions';
  goal_settings_revision: number;
  history_revision?: string;
  unit_history_locked: boolean;
} & QuestionRow;

export type SnapshotLogRow = {
  local_date: string;
  status: Log['status'];
  amount: number | null;
};

// 3 storeの読み取り結果を同じ入力へ写す。SQL・lock・時計・検証は各storeが所有する。
export function toTodaySnapshot(
  goal: SnapshotGoalRow,
  logs: readonly SnapshotLogRow[],
  now: Date,
): TodaySnapshot {
  return {
    now,
    goal: {
      totalRequired: goal.total_required,
      initialProgress: goal.initial_progress,
      sessionAmount: goal.session_amount,
      timezone: goal.timezone,
      recordStartDate: goal.record_start_date,
      unit: goal.unit,
      goalSettingsRevision: goal.goal_settings_revision,
      ...(goal.history_revision === undefined ? {} : { historyRevision: goal.history_revision }),
      unitLocked: goal.unit_history_locked || goal.initial_progress > 0,
    },
    question: {
      question_prior: goal.question_prior,
      answer_revision: goal.answer_revision,
      question_prior_snapshot: goal.question_prior_snapshot,
    },
    logs: logs.map(log => ({
      localDate: log.local_date,
      status: log.status,
      amount: log.amount,
    })),
  };
}
