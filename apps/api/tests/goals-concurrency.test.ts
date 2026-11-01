import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { migrate } from '../src/db/migrate.ts';
import { createGoal, getGoal, listGoals, updateGoal } from '../src/goals/store.ts';
import { createTestDatabase } from './helpers/database.ts';

const NOW = new Date('2026-10-05T14:59:59Z');
const input = { title: 'practice', unit: 'minutes', totalRequired: 600, sessionAmount: 30, timezone: 'Asia/Tokyo' } as const;

async function setupStore(t: test.TestContext) {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await migrate(db.pool);
  await db.pool.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('owner', 'owner', 'owner@example.test', false, now(), now())`);
  const goal = await createGoal(db.pool, 'owner', input, () => NOW);
  return { db, goal };
}

async function waitFor(condition: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error('Expected operation did not reach its barrier');
}

test('Goal PATCH sees a first log committed while waiting for its exclusive row lock', async (t) => {
  const { db, goal } = await setupStore(t);
  const writer = await db.pool.connect();
  const patchPool = new pg.Pool({ connectionString: db.connectionString, max: 1,
    onConnect: async (client) => { await client.query("set default_transaction_isolation = 'repeatable read'"); },
  });
  let patch: ReturnType<typeof updateGoal> | undefined;
  try {
    await writer.query('begin');
    await writer.query('select id from goal where id = $1 for share', [goal.id]);
    assert.equal((await patchPool.query('show default_transaction_isolation')).rows[0].default_transaction_isolation, 'repeatable read');
    patch = updateGoal(patchPool, 'owner', goal.id, { expectedGoalSettingsRevision: 0, timezone: 'America/Los_Angeles', initialProgress: 10, title: 'changed' }, () => NOW);
    await waitFor(async () => (await db.pool.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%for update of g%'`,
    )).rows[0]!.n === 1);
    await writer.query(`insert into action_log (goal_id, local_date, status, amount) values ($1, '2026-10-05', 'DONE', 30)`, [goal.id]);
    await writer.query('commit');
    assert.deepEqual(await patch, { kind: 'locked', fields: ['timezone'] });
    const stored = await getGoal(db.pool, 'owner', goal.id, () => NOW);
    assert.equal(stored?.title, input.title);
    assert.equal(stored?.timezone, input.timezone);
    assert.equal(stored?.initialProgress, 0);
  } finally {
    await writer.query('rollback').catch(() => {});
    writer.release();
    await patch?.catch(() => {});
    await patchPool.end();
  }
});

// Interleave an ordinary write after the first real SELECT returns. All SQL runs
// against PostgreSQL; this only controls the operation order at the client boundary.
function interleavedReadPool(pool: pg.Pool, write: () => Promise<void>): pg.Pool {
  return { connect: async () => {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;
    let interleaved = false;
    client.query = ((...args: unknown[]) => {
      const result = Reflect.apply(query, client, args);
      if (!interleaved && typeof args[0] === 'string' && args[0].includes('as has_logs') && args[0].includes('from goal g')) {
        interleaved = true;
        return Promise.resolve(result).then(async (rows) => { await write(); return rows; });
      }
      return result;
    }) as typeof client.query;
    client.release = (...args) => {
      client.query = query;
      client.release = release;
      Reflect.apply(release, client, args);
    };
    return client;
  } } as pg.Pool;
}

test('Goal GET and list return hasLogs/todayStatus from one snapshot during a normal first-log commit', async (t) => {
  const { db, goal } = await setupStore(t);
  for (const list of [false, true]) {
    await db.pool.query('delete from action_log where goal_id = $1', [goal.id]);
    let writes = 0;
    const pool = interleavedReadPool(db.pool, async () => {
      await db.pool.query(`insert into action_log (goal_id, local_date, status, amount) values ($1, '2026-10-05', 'DONE', 30)`, [goal.id]);
      writes++;
    });
    const result = list ? (await listGoals(pool, 'owner', () => NOW))[0] : await getGoal(pool, 'owner', goal.id, () => NOW);
    assert.equal(writes, 1, 'first SELECT barrier executed');
    assert.equal(result?.hasLogs, false);
    assert.equal(result?.todayStatus, 'UNRECORDED');
    const next = await getGoal(db.pool, 'owner', goal.id, () => NOW);
    assert.equal(next?.hasLogs, true);
    assert.equal(next?.todayStatus, 'DONE');
  }
});

test('Goal creation samples its clock after pool wait and shares it with created_at/recordStartDate', async (t) => {
  const { db } = await setupStore(t);
  const pool = new pg.Pool({ connectionString: db.connectionString, max: 1 });
  const held = await pool.connect();
  let released = false;
  let now = NOW;
  let calls = 0;
  const creation = createGoal(pool, 'owner', input, () => { calls++; return now; });
  try {
    await waitFor(() => pool.waitingCount === 1);
    assert.equal(calls, 0);
    now = new Date('2026-10-05T15:00:00Z');
    held.release();
    released = true;
    const goal = await creation;
    assert.equal(calls, 1);
    assert.equal(goal.recordStartDate, '2026-10-06');
    assert.equal(goal.today, '2026-10-06');
    const row = (await db.pool.query<{ created_at: Date; record_start_date: string }>(
      'select created_at, record_start_date::text as record_start_date from goal where id = $1', [goal.id],
    )).rows[0]!;
    assert.equal(row.created_at.valueOf(), now.valueOf());
    assert.equal(row.record_start_date, goal.recordStartDate);
  } finally {
    if (!released) held.release();
    await creation.catch(() => {});
    await pool.end();
  }
});
