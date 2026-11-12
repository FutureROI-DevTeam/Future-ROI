import type { Pool } from 'pg';
import type { Log, LogPut, LogChange, HistoryEdit } from '../contracts/log.ts';
import { isGoalId } from '../goals/goal-id.ts';
import { localDateIn, shiftLocalDate } from '../goals/local-date.ts';

// 記録のSQL。所有者条件（goal.user_id）を全ての読み書きに付け、他人のGoalは「存在しない」として扱う。
// 行動日（local_date）はGoalのtimezoneの暦日。date型はpgがDateへ変換するため、SQL側でtextにして受け取る。

type LogRow = { local_date: string; status: Log['status']; amount: number | null };
const toLog = (r: LogRow): Log => ({ localDate: r.local_date, status: r.status, amount: r.amount });

export type PutLogResult =
  | { kind: 'saved'; log: Log; change?: LogChange }
  | { kind: 'not_found' | 'settings_conflict' | 'history_conflict' }
  | { kind: 'out_of_window'; today: string; yesterday: string }
  | { kind: 'before_start'; recordStartDate: string };

// 作成・上書き（R-03・R-04、P-14）。許可窓は「Goalのtimezoneで今日・昨日」かつ「記録開始日以降」。
// 窓の判定と保存を同じtransactionで行い、Goal行を排他ロックして、同時のPATCH・同Goal PUTを時計の取得前に順序づける。
// DONEの表示量と設定版を固定して送る。SKIPPEDはNULL。初回DONEのmarkerも同transactionで保存する。
export async function putLog(
  pool: Pool,
  userId: string,
  goalId: string,
  localDate: string,
  body: LogPut,
  clock: () => Date,
  includeChange = false,
): Promise<PutLogResult> {
  if (!isGoalId(goalId)) return { kind: 'not_found' };
  const client = await pool.connect();
  try {
    await client.query('begin isolation level read committed');
    const goal = (
      await client.query<{ timezone: string; record_start_date: string; session_amount: number; goal_settings_revision: number; history_revision: string; unit: LogChange['unit']; total_required: number }>(
        'select timezone, record_start_date::text as record_start_date, session_amount, goal_settings_revision, history_revision::text as history_revision, unit, total_required from goal where id = $1 and user_id = $2 for update',
        [goalId, userId],
      )
    ).rows[0];
    if (!goal) {
      await client.query('rollback');
      return { kind: 'not_found' };
    }
    if (body.expectedGoalSettingsRevision !== goal.goal_settings_revision) {
      await client.query('rollback');
      return { kind: 'settings_conflict' };
    }
    if (body.expectedHistoryRevision !== undefined && body.expectedHistoryRevision !== goal.history_revision) {
      await client.query('rollback');
      return { kind: 'history_conflict' };
    }
    const today = localDateIn(clock(), goal.timezone);
    const yesterday = shiftLocalDate(today, -1);
    if (localDate !== today && localDate !== yesterday) {
      await client.query('rollback');
      return { kind: 'out_of_window', today, yesterday };
    }
    if (localDate < goal.record_start_date) {
      await client.query('rollback');
      return { kind: 'before_start', recordStartDate: goal.record_start_date };
    }
    const amount = body.status === 'DONE' ? body.amount! : null;
    // 同じGoalの記録・設定更新はこのlockで順序づく。画面の旧量ではなくDBの直前量を使う。
    const previous = includeChange ? (await client.query<LogRow>(
      'select local_date::text as local_date, status, amount from action_log where goal_id = $1 and local_date = $2::date',
      [goalId, localDate],
    )).rows[0] : undefined;
    const saved = await client.query<LogRow>(
      `insert into action_log (goal_id, local_date, status, amount) values ($1, $2::date, $3, $4)
       on conflict (goal_id, local_date) do update set status = excluded.status, amount = excluded.amount
       returning local_date::text as local_date, status, amount`,
      [goalId, localDate, body.status, amount],
    );
    if (body.status === 'DONE') {
      await client.query(
        'update goal set unit_history_locked = true where id = $1 and not unit_history_locked',
        [goalId],
      );
    }
    let change: LogChange | undefined;
    if (includeChange) {
      const previousAmount = previous?.status === 'DONE' ? previous.amount! : 0;
      // triggerの履歴版を同じtransactionで取得。後続の別保存をFEが今回の結果へ混ぜない。
      const revision = (await client.query<{ revision: string }>(
        'select history_revision::text as revision from goal where id = $1 and user_id = $2', [goalId, userId],
      )).rows[0]!.revision;
      change = { goalId, previousAmount, amountDelta: (amount ?? 0) - previousAmount,
        totalRequired: goal.total_required, unit: goal.unit, goalSettingsRevision: goal.goal_settings_revision, historyRevision: revision };
    }
    await client.query('commit');
    return { kind: 'saved', log: toLog(saved.rows[0]!), ...(change ? { change } : {}) };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** 記録の一覧（行動日の昇順）。期間は両端を含み、省略時は全期間。Goalがなければnull。 */
export async function listLogs(
  pool: Pool,
  userId: string,
  goalId: string,
  range: { from?: string; to?: string },
): Promise<Log[] | null> {
  if (!isGoalId(goalId)) return null;
  const owned = await pool.query('select 1 from goal where id = $1 and user_id = $2', [goalId, userId]);
  if (owned.rowCount === 0) return null;
  const rows = await pool.query<LogRow>(
    `select local_date::text as local_date, status, amount from action_log
      where goal_id = $1 and ($2::date is null or local_date >= $2::date) and ($3::date is null or local_date <= $3::date)
      order by local_date`,
    [goalId, range.from ?? null, range.to ?? null],
  );
  return rows.rows.map(toLog);
}

/** Explicit historical correction/cancellation. Same Goal lock and timezone clock as PUT. */
export async function editHistory(pool: Pool, userId: string, goalId: string, localDate: string, body: HistoryEdit, clock: () => Date) {
  if (!isGoalId(goalId)) return { kind: 'not_found' } as const;
  const client = await pool.connect();
  try {
    await client.query('begin isolation level read committed');
    const goal = (await client.query<{ timezone: string; start: string; settings: number; revision: string }>(
      'select timezone, record_start_date::text as start, goal_settings_revision as settings, history_revision::text as revision from goal where id=$1 and user_id=$2 for update', [goalId,userId])).rows[0];
    if (!goal) { await client.query('rollback'); return { kind: 'not_found' } as const; }
    if (goal.settings !== body.expectedGoalSettingsRevision || goal.revision !== body.expectedHistoryRevision) {
      await client.query('rollback'); return { kind: 'conflict' } as const;
    }
    const today = localDateIn(clock(), goal.timezone);
    if (localDate < goal.start || localDate > today) { await client.query('rollback'); return { kind: 'out_of_window' } as const; }
    let log: Log | null = null;
    if (body.status === 'UNRECORDED') {
      await client.query('delete from action_log where goal_id=$1 and local_date=$2::date', [goalId,localDate]);
    } else {
      const result = await client.query<LogRow>(
        'insert into action_log (goal_id,local_date,status,amount) values ($1,$2::date,$3,$4) on conflict (goal_id,local_date) do update set status=excluded.status,amount=excluded.amount returning local_date::text as local_date,status,amount',
        [goalId,localDate,body.status,body.status === 'DONE' ? body.amount : null]);
      log = toLog(result.rows[0]!);
      if (body.status === 'DONE') await client.query('update goal set unit_history_locked=true where id=$1', [goalId]);
    }
    const revision = (await client.query<{ revision: string }>('select history_revision::text as revision from goal where id=$1',[goalId])).rows[0]!.revision;
    await client.query('commit');
    return { kind: 'saved', value: { historyRevision: revision, log } } as const;
  } catch (error) { await client.query('rollback').catch(()=>{}); throw error; }
  finally { client.release(); }
}
