import type { Pool } from 'pg';
import { isGoalId } from '../goals/goal-id.ts';
import {
  toTodaySnapshot,
  type SnapshotGoalRow,
  type SnapshotLogRow,
  type TodaySnapshot,
} from './snapshot.ts';

export type { TodaySnapshot } from './snapshot.ts';

// Goalと全記録を同じrepeatable read snapshotで取り、途中の更新と混ぜない。
export async function loadTodaySnapshot(
  pool: Pool,
  userId: string,
  goalId: string,
  clock: () => Date,
): Promise<TodaySnapshot | null> {
  if (!isGoalId(goalId)) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const goal = (
      await client.query<SnapshotGoalRow>(
        'select total_required, initial_progress, session_amount, timezone, record_start_date::text as record_start_date, unit, goal_settings_revision, history_revision::text as history_revision, unit_history_locked, question_prior, answer_revision::text as answer_revision, question_prior_snapshot from goal where id = $1 and user_id = $2',
        [goalId, userId],
      )
    ).rows[0];
    if (!goal) {
      await client.query('commit');
      return null;
    }
    // BEGINではsnapshotが確定しないため、最初のSELECT後に時計を採取する。
    const now = clock();
    const logs = await client.query<SnapshotLogRow>(
      'select local_date::text as local_date, status, amount from action_log where goal_id = $1 order by local_date',
      [goalId],
    );
    await client.query('commit');
    return toTodaySnapshot(goal, logs.rows, now);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
