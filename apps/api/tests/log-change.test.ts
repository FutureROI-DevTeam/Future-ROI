import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, signedInClient } from './helpers/stack.ts';

test('#244: 保存transactionの実増減、互換応答、競合、並行保存、失敗rollback、ownerを実DBで確認', async t => {
  const { db, stack } = await setup(t, { now: () => new Date('2026-11-12T12:00:00Z') });
  const a = await signedInClient(stack.app, 'change-a');
  const b = await signedInClient(stack.app, 'change-b');
  const goal = (await a.call('POST', '/api/goals', {
    title: '合成の時間記録', unit: 'minutes', totalRequired: 12000, sessionAmount: 30, timezone: 'UTC',
  })).json!;
  const url = `/api/goals/${goal.id}/logs/2026-11-12`;
  const body = (amount: number) => ({ status: 'DONE', amount, expectedGoalSettingsRevision: 0 });
  const save = (amount: number) => a.sendExact('PUT', url + '?view=change', body(amount));
  const row = async () => (await db.pool.query('select amount from action_log where goal_id=$1', [goal.id])).rows[0];

  const old = await a.sendExact('PUT', url, body(20));
  assert.deepEqual(old.json, { localDate: '2026-11-12', status: 'DONE', amount: 20 }, '既存callerの応答は変えない');
  await a.sendExact('PUT', url, body(40)); // 画面が20分のまま別端末から保存した状況。
  const changed = await save(30);
  assert.equal(changed.status, 200, changed.body);
  assert.deepEqual(changed.json, { localDate: '2026-11-12', status: 'DONE', amount: 30,
    change: { goalId: goal.id, previousAmount: 40, amountDelta: -10, totalRequired: 12000,
      unit: 'minutes', goalSettingsRevision: 0, historyRevision: '3' } });
  assert.equal((await row()).amount, 30);
  const repeated = await save(30);
  assert.equal((repeated.json!.change as { amountDelta: number }).amountDelta, 0);

  const conflict = await a.sendExact('PUT', url + '?view=change', { ...body(50), expectedHistoryRevision: '1' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json!.change, undefined);
  assert.equal((await row()).amount, 30);
  assert.equal((await b.sendExact('PUT', url + '?view=change', body(1))).status, 404);
  assert.equal((await a.sendExact('PUT', url + '?view=change', { ...body(2), expectedGoalSettingsRevision: 9 })).status, 409);

  // Goal lockの後で旧量を読むので、両PUTの差分は実際の保存順に連なる。
  const lock = await db.pool.connect();
  await lock.query('begin');
  await lock.query('select id from goal where id=$1 for update', [goal.id]);
  const first = save(20), second = save(35);
  await lock.query('commit');
  lock.release();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every(r => r.status === 200));
  const ordered = responses.map(r => r.json!.change as { previousAmount: number; amountDelta: number; historyRevision: string })
    .sort((x, y) => Number(BigInt(x.historyRevision) - BigInt(y.historyRevision)));
  assert.equal(ordered[0]!.previousAmount, 30);
  assert.equal(ordered[1]!.previousAmount, ordered[0]!.previousAmount + ordered[0]!.amountDelta);
  assert.equal(ordered.reduce((sum, c) => sum + c.amountDelta, 0), (await row()).amount - 30);

  const skipped = await a.sendExact('PUT', url + '?view=change', { status: 'SKIPPED', expectedGoalSettingsRevision: 0 });
  assert.equal((skipped.json!.change as { amountDelta: number }).amountDelta, -(ordered[1]!.previousAmount + ordered[1]!.amountDelta));
  assert.equal(((await a.sendExact('PUT', url + '?view=change', { status: 'SKIPPED', expectedGoalSettingsRevision: 0 })).json!.change as { amountDelta: number }).amountDelta, 0);
  const fresh = await save(30);
  assert.equal((fresh.json!.change as { amountDelta: number }).amountDelta, 30);
  const before = (fresh.json!.change as { historyRevision: string }).historyRevision;
  await db.pool.query('alter table action_log add constraint synthetic_reject check (amount <> 999)');
  const failed = await save(999);
  assert.equal(failed.status, 422, 'DB制約エラーは既存の公開422へ変換される');
  assert.equal(failed.json!.change, undefined);
  assert.equal((await row()).amount, 30);
  assert.equal((await db.pool.query('select history_revision::text as revision from goal where id=$1', [goal.id])).rows[0].revision, before);
});
