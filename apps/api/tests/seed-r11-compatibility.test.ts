// 統合済み0003の回答snapshotと0004のDemo所有権を、標準回帰で一緒に検証する。
// resetの失敗・新IDへの置換と、0004適用済みDBへの0003後着でデータ保全を確認する。
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { seedDemo } from '../src/db/seed-demo.ts';
import { migrate } from '../src/db/migrate.ts';
import { createTestDatabase } from './helpers/database.ts';
import { setup, signedInClient, startStack } from './helpers/stack.ts';

test('回答snapshotとDemo reset: 旧回答全rowのrollback・通常Goal保全・新Goal未回答/版0・旧版404', async t => {
  const now = () => new Date('2026-12-31T15:00:00Z');
  const { db, stack } = await setup(t, { now });
  const owner = await signedInClient(stack.app, 'r11-seed-only');
  const session = await owner.call('GET', '/api/auth/get-session');
  const userId = (session.json!.user as { id: string }).id;
  const opts = { userId, timezone: 'Asia/Tokyo', now };
  const normal = await owner.call('POST', '/api/goals', { title: '通常Goalの回答を保全', unit: 'sessions', totalRequired: 60,
    sessionAmount: 1, timezone: 'Asia/Tokyo', questionPrior: { a: 'MID', b: 'LOW' } });
  assert.equal(normal.status, 201);
  const first = await seedDemo(db.pool, opts);
  const answered = await owner.call('PATCH', `/api/goals/${first.goals[0]!.id}`, {
    questionPrior: { a: 'HIGH', b: 'LOW' }, expectedAnswerRevision: 0,
  });
  assert.equal(answered.status, 200, answered.body);
  const allRows = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ['goal', 'action_log', 'demo_seed_goal', 'user', 'account', 'session', 'rateLimit']) {
      result[table] = (await db.pool.query(`select to_jsonb(t) row from "${table}" t order by to_jsonb(t)::text`)).rows;
    }
    return result;
  };
  const before = await allRows();
  const answeredRow = (await db.pool.query('select question_prior,answer_revision,question_prior_snapshot from goal where id=$1', [first.goals[0]!.id])).rows[0]!;
  assert.deepEqual(answeredRow.question_prior, { a: 'HIGH', b: 'LOW' });
  assert.equal(answeredRow.answer_revision, '1');
  assert.ok(answeredRow.question_prior_snapshot);
  await db.pool.query(`create function interrupt_seed_r11() returns trigger language plpgsql as $$ begin raise exception 'synthetic seed failure'; end $$;
    create trigger interrupt_seed_r11 before insert on action_log for each row execute function interrupt_seed_r11()`);
  await assert.rejects(seedDemo(db.pool, opts), /synthetic seed failure/);
  assert.deepEqual(await allRows(), before);
  await db.pool.query('drop trigger interrupt_seed_r11 on action_log; drop function interrupt_seed_r11()');
  const second = await seedDemo(db.pool, opts);
  const after = await allRows();
  for (const table of ['user', 'account', 'session', 'rateLimit']) assert.deepEqual(after[table], before[table]);
  for (const table of ['goal']) {
    assert.deepEqual((after[table] as { row: { id: string } }[]).filter(row => row.row.id === normal.json!.id),
      (before[table] as { row: { id: string } }[]).filter(row => row.row.id === normal.json!.id));
  }
  for (const goal of second.goals) {
    const read = await owner.call('GET', `/api/goals/${goal.id}?view=r11`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.json!.questionPrior, { a: null, b: null });
    assert.equal(read.json!.answerRevision, 0);
    assert.equal((await owner.call('GET', `/api/goals/${goal.id}/today?view=r11`)).status, 200);
    const row = (await db.pool.query('select question_prior_snapshot from goal where id=$1', [goal.id])).rows[0]!;
    assert.equal(row.question_prior_snapshot, null);
  }
  assert.equal((await owner.call('PATCH', `/api/goals/${first.goals[0]!.id}`, {
    questionPrior: { a: 'MID', b: 'MID' }, expectedAnswerRevision: 1,
  })).status, 404);
});

test('0004適用済みDBへ0003を後から適用しても、既存Goal/log/marker/auth行を保全する', async t => {
  const db = await createTestDatabase();
  const dir = mkdtempSync(join(tmpdir(), 'seed82-migration-order-'));
  let closeStack = async () => {};
  t.after(async () => { await closeStack(); await db.close(); rmSync(dir, { recursive: true }); });
  for (const name of ['0001_goal_action_log.sql', '0002_goal_record_start_date.sql', '0004_demo_seed_goal.sql', '0005_goal_data_integrity.sql']) {
    writeFileSync(join(dir, name), readFileSync(new URL(`../migrations/${name}`, import.meta.url)));
  }
  await migrate(db.pool, 'all', pathToFileURL(`${dir}/`));
  const stack = await startStack(db);
  closeStack = stack.close;
  const owner = await signedInClient(stack.app, 'later-r11-schema');
  const session = await owner.call('GET', '/api/auth/get-session');
  const userId = (session.json!.user as { id: string }).id;
  await seedDemo(db.pool, { userId, timezone: 'UTC' });
  const allRows = async () => {
    const result: Record<string, { row: Record<string, unknown> }[]> = {};
    for (const table of ['goal', 'action_log', 'demo_seed_goal', 'user', 'account', 'session', 'rateLimit', 'schema_migrations']) {
      result[table] = (await db.pool.query(`select to_jsonb(t) row from "${table}" t order by to_jsonb(t)::text`)).rows;
    }
    return result;
  };
  const before = await allRows();
  const migration = await migrate(db.pool, 'app');
  assert.ok(migration.app);
  // 後着0003、#157の0005、#225の0006、#248の0008でも既存業務/認証行は保全する。
  assert.deepEqual(migration.app.applied, ['0003_goal_question_prior.sql', '0005_goal_target_date.sql', '0006_prediction_evaluation.sql', '0008_session_milestone.sql', '0009_record_history_revision.sql']);
  const after = await allRows();
  for (const row of after.goal!) {
    assert.deepEqual(row.row.question_prior, { a: null, b: null });
    assert.equal(row.row.answer_revision, 0);
    assert.equal(row.row.question_prior_snapshot, null);
    delete row.row.question_prior;
    delete row.row.answer_revision;
    delete row.row.question_prior_snapshot;
    // 0005：既存Goalは到達予定日なし
    assert.equal(row.row.target_date, null);
    delete row.row.target_date;
    // 0008：既存Goalは未同意の初期CAS版。追加列の値を検査してから旧行全体を照合する。
    assert.equal(row.row.milestone_consent_revision, 0);
    delete row.row.milestone_consent_revision;
    // 0009 adds a baseline history epoch without rewriting any existing record.
    assert.equal(row.row.history_revision, 0);
    delete row.row.history_revision;
  }
  assert.deepEqual(after.goal, before.goal);
  for (const table of ['milestone_participation', 'milestone_forecast', 'milestone_artifact']) {
    assert.equal((await db.pool.query(`select count(*)::int as count from ${table}`)).rows[0]!.count, 0);
  }
  for (const table of ['action_log', 'demo_seed_goal', 'user', 'account', 'session', 'rateLimit']) assert.deepEqual(after[table], before[table]);
  const markerMigration = (rows: { row: Record<string, unknown> }[]) => rows.filter(row => row.row.name === '0004_demo_seed_goal.sql');
  assert.deepEqual(markerMigration(after.schema_migrations!), markerMigration(before.schema_migrations!));
  assert.deepEqual((await migrate(db.pool, 'all')).app?.applied, []);
});
