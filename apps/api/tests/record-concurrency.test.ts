import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import type { Goal } from '../src/contracts/goal.ts';
import type { Today } from '../src/contracts/log.ts';
import { putLog } from '../src/logs/store.ts';
import { setup, signedInClient } from './helpers/stack.ts';

const OLD = new Date('2026-10-05T14:59:59Z'); // Tokyo 10/5 23:59:59
const NEW = new Date('2026-10-05T15:00:00Z'); // Tokyo 10/6 00:00
const START = new Date('2026-10-02T15:00:00Z');
const input = { title: 'practice', unit: 'minutes', totalRequired: 600, sessionAmount: 30, timezone: 'Asia/Tokyo' } as const;
const code = (json: Record<string, unknown> | null) => (json?.error as { code?: string } | undefined)?.code;
async function waitFor(condition: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Expected normal operation did not reach its barrier');
}
function gate() {
  let open!: () => void;
  const pending = new Promise<void>(resolve => { open = resolve; });
  return { pending, open };
}
// Decorate one public checkout, leaving the callback overload used by Pool.query
// untouched. Every SQL statement still executes against PostgreSQL.
function pauseQuery(pool: pg.Pool, matches: (sql: string) => boolean, before = false) {
  const nativeConnect = pool.connect;
  const barrier = gate();
  let reached = false;
  pool.connect = ((...args: unknown[]) => {
    if (args.some(arg => typeof arg === 'function')) return Reflect.apply(nativeConnect, pool, args);
    pool.connect = nativeConnect;
    return Promise.resolve(Reflect.apply(nativeConnect, pool, args)).then((client: pg.PoolClient) => {
      const nativeQuery = client.query;
      const nativeRelease = client.release;
      let used = false;
      client.query = ((...queryArgs: unknown[]) => {
        if (!used && typeof queryArgs[0] === 'string' && matches(queryArgs[0])) {
          used = true;
          if (before) {
            reached = true;
            return barrier.pending.then(() => Reflect.apply(nativeQuery, client, queryArgs));
          }
          return Promise.resolve(Reflect.apply(nativeQuery, client, queryArgs)).then(async result => {
            reached = true;
            await barrier.pending;
            return result;
          });
        }
        return Reflect.apply(nativeQuery, client, queryArgs);
      }) as typeof client.query;
      client.release = (...releaseArgs) => {
        client.query = nativeQuery;
        client.release = nativeRelease;
        Reflect.apply(nativeRelease, client, releaseArgs);
      };
      return client;
    });
  }) as typeof pool.connect;
  return {
    reached: () => reached,
    open: barrier.open,
    restore: () => {
      pool.connect = nativeConnect;
      barrier.open();
    },
  };
}

async function blocked(pool: pg.Pool) {
  await waitFor(async () => (await pool.query<{ n: number }>(
    `select count(*)::int as n from pg_stat_activity where datname = current_database()
     and wait_event_type = 'Lock' and (query like '%from goal%' or query like '%insert into action_log%')`,
  )).rows[0]!.n === 1);
}

test('Today samples its clock after pool wait and includes a new-day normal log without a future-log 500', async t => {
  let now = OLD;
  let calls = 0;
  const { db, stack } = await setup(t, { now: () => {
    calls++;
    return now;
  } });
  const client = await signedInClient(stack.app, 'today-pool');
  const goal = (await client.call('POST', '/api/goals', input)).json as unknown as Goal;
  const owner = (await db.pool.query<{ user_id: string }>('select user_id from goal where id = $1', [goal.id])).rows[0]!.user_id;
  const held = await Promise.all(Array.from({ length: 3 }, () => db.pool.connect()));
  const writer = new pg.Pool({ connectionString: db.connectionString, max: 1 });
  calls = 0;
  const read = client.call('GET', `/api/goals/${goal.id}/today`);
  let released = false;
  try {
    await waitFor(() => db.pool.waitingCount === 1);
    assert.equal(calls, 0);
    now = NEW;
    assert.equal((await putLog(writer, owner, goal.id, '2026-10-06', { expectedGoalSettingsRevision: 0, amount: 30, status: 'DONE' }, () => now)).kind, 'saved');
    held.forEach(c => c.release());
    released = true;
    const res = await read;
    assert.equal(res.status, 200, res.body);
    const today = res.json as unknown as Today;
    assert.equal(calls, 1);
    assert.equal(today.today, '2026-10-06');
    assert.deepEqual(today.todayLog, { localDate: '2026-10-06', status: 'DONE', amount: 30 });
    assert.equal(today.prediction.progress.done, 30);
  } finally {
    if (!released) held.forEach(c => c.release());
    await read.catch(() => {});
    await writer.end();
  }
});

test('Today establishes its first SELECT snapshot before sampling its clock, rather than sampling at BEGIN', async t => {
  let now = OLD;
  let calls = 0;
  const { db, stack } = await setup(t, { now: () => {
    calls++;
    return now;
  } });
  const client = await signedInClient(stack.app, 'today-select');
  const goal = (await client.call('POST', '/api/goals', input)).json as unknown as Goal;
  const owner = (await db.pool.query<{ user_id: string }>('select user_id from goal where id = $1', [goal.id])).rows[0]!.user_id;
  calls = 0;
  const pause = pauseQuery(db.pool, sql => sql.startsWith('select total_required'), true);
  const read = client.call('GET', `/api/goals/${goal.id}/today`);
  try {
    await waitFor(pause.reached);
    assert.equal(calls, 0, 'BEGIN has not established the read snapshot');
    now = NEW;
    assert.equal((await putLog(db.pool, owner, goal.id, '2026-10-06', { expectedGoalSettingsRevision: 0, amount: 30, status: 'DONE' }, () => now)).kind, 'saved');
    pause.open();
    const res = await read;
    assert.equal(res.status, 200, res.body);
    const today = res.json as unknown as Today;
    assert.equal(calls, 1);
    assert.equal(today.today, '2026-10-06');
    assert.equal(today.todayLog?.localDate, '2026-10-06');
  } finally {
    pause.restore();
    await read.catch(() => {});
  }
});

test('PUT rejects a date that becomes two days old while waiting for normal Goal PATCH', async t => {
  let now = START;
  const { db, stack } = await setup(t, { now: () => now });
  const client = await signedInClient(stack.app, 'put-patch');
  const goal = (await client.call('POST', '/api/goals', input)).json as unknown as Goal;
  now = OLD;
  const pause = pauseQuery(db.pool, sql => sql.includes('for update of g'));
  const patch = client.call('PATCH', `/api/goals/${goal.id}`, { title: input.title });
  let put: ReturnType<typeof client.call> | undefined;
  try {
    await waitFor(pause.reached);
    put = client.call('PUT', `/api/goals/${goal.id}/logs/2026-10-04`, { status: 'DONE' });
    await blocked(db.pool);
    now = NEW;
    pause.open();
    assert.equal((await patch).status, 200);
    const result = await put;
    assert.equal(result.status, 422, result.body);
    assert.equal(code(result.json), 'LOG_DATE_OUT_OF_WINDOW');
    assert.equal((await db.pool.query('select count(*)::int as n from action_log')).rows[0].n, 0);
  } finally {
    pause.restore();
    await patch.catch(() => {});
    await put?.catch(() => {});
  }
});

test('First PUT and Goal PATCH obey both normal lock orders without changing logged timezone or initialProgress', async t => {
  let now = NEW;
  const { db, stack } = await setup(t, { now: () => now });
  const client = await signedInClient(stack.app, 'first-log');
  for (const putFirst of [true, false]) {
    const goal = (await client.call('POST', '/api/goals', input)).json as unknown as Goal;
    const pause = pauseQuery(db.pool, sql => putFirst ? sql.startsWith('select timezone') : sql.includes('for update of g'));
    const path = `/api/goals/${goal.id}`;
    const changes = { title: 'changed', timezone: 'America/Los_Angeles', initialProgress: 10 };
    const first = putFirst ? client.call('PUT', `${path}/logs/2026-10-06`, { status: 'DONE' }) : client.call('PATCH', path, changes);
    let second: ReturnType<typeof client.call> | undefined;
    try {
      await waitFor(pause.reached);
      second = putFirst ? client.call('PATCH', path, changes) : client.call('PUT', `${path}/logs/2026-10-06`, { status: 'DONE', expectedGoalSettingsRevision: 1 });
      await blocked(db.pool);
      pause.open();
      assert.equal((await first).status, 200);
      const result = await second;
      assert.equal(result.status, 422, result.body);
      assert.equal(code(result.json), putFirst ? 'GOAL_HAS_LOGS' : 'LOG_DATE_OUT_OF_WINDOW');
      const stored = (await client.call('GET', path)).json as unknown as Goal;
      assert.equal(stored.timezone, putFirst ? input.timezone : changes.timezone);
      assert.equal(stored.initialProgress, putFirst ? 0 : 10);
      assert.equal(stored.title, putFirst ? input.title : 'changed');
      assert.equal(stored.hasLogs, putFirst);
      if (putFirst) assert.deepEqual((result.json?.error as { fields: { path: string }[] }).fields.map(f => f.path), ['body/timezone']);
    } finally {
      pause.restore();
      await first.catch(() => {});
      await second?.catch(() => {});
    }
    now = new Date(now.valueOf() + 1);
  }
});

test('Same-day PUT waits before its clock, so midnight does not allow a stale UPSERT overwrite', async t => {
  let now = START;
  let calls = 0;
  const { db, stack } = await setup(t, { now: () => {
    calls++;
    return now;
  } });
  const client = await signedInClient(stack.app, 'upsert-window');
  const goal = (await client.call('POST', '/api/goals', input)).json as unknown as Goal;
  now = OLD;
  calls = 0;
  const pause = pauseQuery(db.pool, sql => sql.includes('insert into action_log'));
  const path = `/api/goals/${goal.id}/logs/2026-10-04`;
  const first = client.call('PUT', path, { status: 'DONE', amount: 30 });
  let second: ReturnType<typeof client.call> | undefined;
  try {
    await waitFor(pause.reached);
    assert.equal(calls, 1);
    second = client.call('PUT', path, { status: 'DONE', amount: 99 });
    await blocked(db.pool);
    assert.equal(calls, 1, 'second PUT must wait for the Goal lock before reading the clock');
    now = NEW;
    pause.open();
    assert.equal((await first).status, 200);
    const result = await second;
    assert.equal(result.status, 422, result.body);
    assert.equal(code(result.json), 'LOG_DATE_OUT_OF_WINDOW');
    assert.equal(calls, 2);
    const logs = (await client.call('GET', `/api/goals/${goal.id}/logs`)).json;
    assert.deepEqual(logs, [{ localDate: '2026-10-04', status: 'DONE', amount: 30 }]);
  } finally {
    pause.restore();
    await first.catch(() => {});
    await second?.catch(() => {});
  }
});
