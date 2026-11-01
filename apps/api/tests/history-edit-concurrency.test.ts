import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { createTestDatabase } from './helpers/database.ts';
import { migrate } from '../src/db/migrate.ts';
import { createGoal, getGoal } from '../src/goals/store.ts';
import { editHistory, putLog } from '../src/logs/store.ts';

test('historical edit returns a version conflict after a Goal lock wait even with a REPEATABLE READ pool default', async t => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await migrate(db.pool);
  await db.pool.query(`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values('history-race','review','history-race@example.test',false,now(),now())`);
  const clock = () => new Date('2026-11-01T12:00:00Z');
  const goal = await createGoal(db.pool, 'history-race', { title: 'History race', unit: 'minutes', totalRequired: 100, sessionAmount: 10, timezone: 'UTC' }, clock);
  const pool = new pg.Pool({ connectionString: db.connectionString, max: 2,
    onConnect: async client => { await client.query("set default_transaction_isolation='repeatable read'"); } });
  const writer = await db.pool.connect();
  let pending: ReturnType<typeof editHistory> | undefined;
  try {
    assert.equal((await pool.query('show default_transaction_isolation')).rows[0].default_transaction_isolation, 'repeatable read');
    await writer.query('begin');
    await writer.query('select id from goal where id=$1 for update', [goal.id]);
    pending = editHistory(pool, 'history-race', goal.id, '2026-11-01', { status: 'DONE', amount: 20, expectedGoalSettingsRevision: 0, expectedHistoryRevision: '0' }, clock);
    // Verify a real DB lock wait, rather than relying on scheduler timing.
    const deadline = Date.now() + 5_000;
    while (true) {
      const waiting = await db.pool.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%as revision from goal%'");
      if (waiting.rows[0].n > 0) break;
      assert.ok(Date.now() < deadline, 'historical edit did not reach the row lock');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await writer.query("insert into action_log(goal_id,local_date,status,amount) values($1,'2026-11-01','DONE',10)", [goal.id]);
    await writer.query('commit');
    assert.deepEqual(await pending, { kind: 'conflict' });
    assert.equal((await getGoal(db.pool, 'history-race', goal.id, clock))!.progressDone, 10);
    assert.equal((await putLog(pool, 'history-race', goal.id, '2026-11-01', { status: 'DONE', amount: 30, expectedGoalSettingsRevision: 0, expectedHistoryRevision: '0' }, clock)).kind, 'history_conflict');
  } finally {
    await writer.query('rollback').catch(() => {});
    writer.release();
    await pending?.catch(() => {});
    await pool.end();
  }
});
