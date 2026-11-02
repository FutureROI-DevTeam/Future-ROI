import assert from 'node:assert/strict';
import test from 'node:test';
import type { Goal } from '../src/contracts/goal.ts';
import { isValidTimeZone, localDateIn } from '../src/goals/local-date.ts';
import { setup, signedInClient } from './helpers/stack.ts';

// Goal API（R-02、#76）。所有者条件・入力検証・記録開始日・記録があるGoalの変更禁止・timezoneの日付境界を確かめる。

const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';
// 2026-10-05T15:30:00Z は Asia/Tokyo では 10/6 00:30、America/Los_Angeles では 10/5 08:30。
const NOW = new Date('2026-10-05T15:30:00Z');

const validGoal = { title: '英語 30分', unit: 'minutes', totalRequired: 6000, sessionAmount: 30, timezone: 'Asia/Tokyo' } as const;

const fieldPaths = (json: Record<string, unknown> | null) =>
  ((json?.error as { fields?: { path: string }[] } | undefined)?.fields ?? []).map((f) => f.path).sort();

test('localDateIn / isValidTimeZone: timezoneの暦日とIANA名の判定', () => {
  assert.equal(localDateIn(NOW, 'Asia/Tokyo'), '2026-10-06');
  assert.equal(localDateIn(NOW, 'America/Los_Angeles'), '2026-10-05');
  assert.equal(localDateIn(new Date('2026-10-05T14:59:59Z'), 'Asia/Tokyo'), '2026-10-05');
  assert.equal(localDateIn(new Date('2026-12-31T23:30:00Z'), 'Pacific/Kiritimati'), '2027-01-01');
  for (const tz of ['Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'Europe/London', 'Etc/GMT+9', 'America/Argentina/Buenos_Aires']) assert.ok(isValidTimeZone(tz), tz);
  for (const tz of ['', 'Tokyo', 'JST', 'Japan', 'Asia/Tokio', '+09:00', 'GMT+9', 'Asia/Tokyo/', 'Asia/Tokyo; drop table goal']) assert.ok(!isValidTimeZone(tz), tz);
});

test('percent-encodeしたURLも共通hookで認証401・Origin403を返し、Goalは変更しない', async (t) => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'enc');
  await a.call('POST', '/api/goals', validGoal);
  for (const [method, url, payload, status, code] of [
    ['GET', '/%61pi/goals', undefined, 401, 'UNAUTHENTICATED'],
    ['POST', '/%61pi/goals', JSON.stringify(validGoal), 403, 'ORIGIN_REJECTED'],
    ['GET', `/api/go%61ls`, undefined, 401, 'UNAUTHENTICATED'],
  ] as const) {
    const res = await stack.app.inject({ method, url, headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, ...(payload ? { payload } : {}) });
    assert.equal(res.statusCode, status, `${method} ${url}`);
    assert.equal(res.json().error.code, code);
  }
  assert.equal((await db.pool.query('select count(*)::int as n from goal')).rows[0]?.n, 1, 'no goal created without a session');
});

test('作成→一覧→取得: 201のDTO、記録開始日はGoalのtimezoneの今日、初期量の既定は0', async (t) => {
  let instant = NOW;
  const { stack } = await setup(t, { now: () => instant });
  const a = await signedInClient(stack.app, 'a');

  const created = await a.call('POST', '/api/goals', validGoal);
  assert.equal(created.status, 201, created.body);
  const goal = created.json as unknown as Goal;
  assert.match(goal.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    { ...goal, id: 'x' },
    { id: 'x', ...validGoal, initialProgress: 0, recordStartDate: '2026-10-06', hasLogs: false, unitLocked: false, goalSettingsRevision: 0, today: '2026-10-06', todayStatus: 'UNRECORDED', progressDone: 0, targetDate: null },
  );

  const list = await a.call('GET', '/api/goals');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json, [goal]);

  const one = await a.call('GET', `/api/goals/${goal.id}`);
  assert.equal(one.status, 200);
  assert.deepEqual(one.json, goal);

  // 2件目は作成順で後ろに並ぶ
  instant = new Date(NOW.valueOf() + 1);
  const second = await a.call('POST', '/api/goals', { ...validGoal, title: '腹筋', unit: 'sessions', totalRequired: 300, sessionAmount: 1, initialProgress: 12 });
  assert.equal(second.status, 201);
  assert.equal((second.json as unknown as Goal).initialProgress, 12);
  assert.deepEqual(((await a.call('GET', '/api/goals')).json as unknown as Goal[]).map((g) => g.title), ['英語 30分', '腹筋']);
});

test('入力検証: 契約違反はすべて422のfieldsに入り、Goalは作られない', async (t) => {
  const { stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'v');

  const res = await a.call('POST', '/api/goals', {
    title: '',
    unit: 'count',
    totalRequired: 0,
    sessionAmount: -1,
    initialProgress: -1,
    timezone: 'Asia/Tokyo',
    dueDate: '2026-12-31',
  });
  assert.equal(res.status, 422);
  assert.equal((res.json?.error as { code: string }).code, 'VALIDATION_ERROR');
  // 未知の項目（到達予定日は targetDate。#157で追加）も他の違反と一緒に返す
  assert.deepEqual(fieldPaths(res.json), ['body/dueDate', 'body/initialProgress', 'body/sessionAmount', 'body/title', 'body/totalRequired', 'body/unit']);

  // 型の変換はしない（"30"は数値にしない）、整数以外、空白だけのtitle、101文字のtitle、項目の欠落
  for (const [body, path] of [
    [{ ...validGoal, sessionAmount: '30' }, 'body/sessionAmount'],
    [{ ...validGoal, totalRequired: 1.5 }, 'body/totalRequired'],
    [{ ...validGoal, title: '   ' }, 'body/title'],
    [{ ...validGoal, title: 'a'.repeat(101) }, 'body/title'],
    [{ ...validGoal, initialProgress: null }, 'body/initialProgress'],
    [{ title: 'x', unit: 'minutes', totalRequired: 1, sessionAmount: 1 }, 'body/timezone'],
  ] as const) {
    const r = await a.call('POST', '/api/goals', body);
    assert.equal(r.status, 422, JSON.stringify(body));
    assert.ok(fieldPaths(r.json).includes(path), `${JSON.stringify(body)} -> ${fieldPaths(r.json)}`);
  }
  assert.equal(await a.call('POST', '/api/goals', undefined).then((r) => r.status), 422, 'bodyなし');
  assert.deepEqual((await a.call('GET', '/api/goals')).json, []);
});

test('timezone: 有効なIANA名だけを受け付け、固定オフセットや略称は422', async (t) => {
  const { stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'tz');
  for (const timezone of ['Tokyo', 'JST', '+09:00', 'Asia/Tokio']) {
    const r = await a.call('POST', '/api/goals', { ...validGoal, timezone });
    assert.equal(r.status, 422, timezone);
    assert.deepEqual(fieldPaths(r.json), ['body/timezone'], timezone);
  }
  const la = await a.call('POST', '/api/goals', { ...validGoal, timezone: 'America/Los_Angeles' });
  assert.equal(la.status, 201);
  // 同じ瞬間でもGoalのtimezoneで今日・記録開始日が変わる
  assert.equal((la.json as unknown as Goal).recordStartDate, '2026-10-05');
  assert.equal((la.json as unknown as Goal).today, '2026-10-05');
  assert.deepEqual((await a.call('GET', '/api/goals')).json!.length, 1);
});

test('POST/PATCHはtimezoneと通常schema違反が混在しても全fieldsを返し、変更しない', async (t) => {
  const { stack } = await setup(t, { now: () => NOW });
  const client = await signedInClient(stack.app, 'mixed-validation');
  const invalid = { title: '', sessionAmount: 0, timezone: 'Mars/Olympus' };
  const created = (await client.call('POST', '/api/goals', validGoal)).json as unknown as Goal;
  for (const [method, url, body] of [
    ['POST', '/api/goals', { ...validGoal, ...invalid }],
    ['PATCH', `/api/goals/${created.id}`, invalid],
  ] as const) {
    const response = await client.call(method, url, body);
    assert.equal(response.status, 422);
    assert.equal((response.json?.error as { code: string }).code, 'VALIDATION_ERROR');
    assert.deepEqual(fieldPaths(response.json), ['body/sessionAmount', 'body/timezone', 'body/title']);
  }
  assert.deepEqual((await client.call('GET', '/api/goals')).json, [created]);
});

test('所有者チェック: 他人のGoalは取得・編集・削除とも404で、データは変わらない。uuidでないidも404', async (t) => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'owner');
  const b = await signedInClient(stack.app, 'other');
  const goal = (await a.call('POST', '/api/goals', validGoal)).json as unknown as Goal;

  assert.deepEqual((await b.call('GET', '/api/goals')).json, [], 'other user sees no goals');
  for (const [method, body] of [
    ['GET', undefined],
    ['PATCH', { title: 'hijack' }],
    ['DELETE', undefined],
  ] as const) {
    const r = await b.call(method, `/api/goals/${goal.id}`, body);
    assert.equal(r.status, 404, method);
    assert.deepEqual(r.json, { error: { code: 'NOT_FOUND', message: 'Goal not found.' } });
  }
  for (const id of [NO_SUCH_ID, 'not-a-uuid', '1']) {
    assert.equal((await a.call('GET', `/api/goals/${id}`)).status, 404, id);
    assert.equal((await a.call('PATCH', `/api/goals/${id}`, { title: 'x' })).status, 404, id);
    assert.equal((await a.call('DELETE', `/api/goals/${id}`)).status, 404, id);
  }
  // 別originからのCookie付き状態変更は共通hookが403で止め、副作用もない（#75のOrigin方針をPATCH・DELETEにも適用）
  const evil = { cookie: a.cookieHeader(), origin: 'http://evil.example', 'content-type': 'application/json' };
  for (const [method, payload] of [
    ['PATCH', JSON.stringify({ title: 'hijack' })],
    ['DELETE', undefined],
  ] as const) {
    const r = await stack.app.inject({ method, url: `/api/goals/${goal.id}`, headers: evil, ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 403, method);
    assert.equal(r.json().error.code, 'ORIGIN_REJECTED');
  }
  const stored = await db.pool.query<{ title: string; n: number }>('select title, (select count(*) from goal)::int as n from goal');
  assert.deepEqual(stored.rows, [{ title: validGoal.title, n: 1 }]);
  assert.deepEqual((await a.call('GET', `/api/goals/${goal.id}`)).json, goal);
});

test('編集: 省略は維持、空object・null・未知の項目は422、記録がなければtimezoneも変えられるが開始日は動かない', async (t) => {
  const { stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'edit');
  const goal = (await a.call('POST', '/api/goals', validGoal)).json as unknown as Goal;

  const renamed = await a.call('PATCH', `/api/goals/${goal.id}`, { title: '英語 45分', sessionAmount: 45 });
  assert.equal(renamed.status, 200, renamed.body);
  assert.deepEqual(renamed.json, { ...goal, title: '英語 45分', sessionAmount: 45, goalSettingsRevision: 1 });

  for (const body of [{}, { title: null }, { unit: 'count' }, { dueDate: '2026-12-31' }, { totalRequired: 0 }]) {
    const r = await a.call('PATCH', `/api/goals/${goal.id}`, body);
    assert.equal(r.status, 422, JSON.stringify(body));
  }
  assert.equal((await a.call('PATCH', `/api/goals/${goal.id}`, { timezone: 'Mars/Olympus' })).status, 422);

  // 記録がない間はtimezone・初期量を変えられる。記録開始日は作成時の値のまま、今日は新しいtimezoneで決まる。
  const moved = await a.call('PATCH', `/api/goals/${goal.id}`, { timezone: 'America/Los_Angeles', initialProgress: 100 });
  assert.equal(moved.status, 200, moved.body);
  assert.deepEqual(moved.json, { ...goal, title: '英語 45分', sessionAmount: 45, timezone: 'America/Los_Angeles', initialProgress: 100, unitLocked: true, goalSettingsRevision: 2, recordStartDate: '2026-10-06', today: '2026-10-05', progressDone: 100 });
});

test('記録があるGoalのtimezone変更は初期量訂正を含む要求全体を拒否する。一覧は今日の記録状態を含む', async (t) => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'locked');
  const goal = (await a.call('POST', '/api/goals', validGoal)).json as unknown as Goal;
  // 通常APIで今日のDONEと永続単位markerを同じtransactionに保存する。
  assert.equal((await a.call('PUT', `/api/goals/${goal.id}/logs/2026-10-06`, { status: 'DONE', amount: 30 })).status, 200);

  const after = (await a.call('GET', `/api/goals/${goal.id}`)).json as unknown as Goal;
  assert.equal(after.hasLogs, true);
  assert.equal(after.todayStatus, 'DONE');
  assert.deepEqual(((await a.call('GET', '/api/goals')).json as unknown as Goal[]).map((g) => [g.hasLogs, g.todayStatus]), [[true, 'DONE']]);

  const locked = await a.call('PATCH', `/api/goals/${goal.id}`, { title: '英語', timezone: 'America/Los_Angeles', initialProgress: 10 });
  assert.equal(locked.status, 422);
  assert.equal((locked.json?.error as { code: string }).code, 'GOAL_HAS_LOGS');
  assert.deepEqual(fieldPaths(locked.json), ['body/timezone']);
  // 全体が拒否され、titleも変わらない
  assert.deepEqual((await a.call('GET', `/api/goals/${goal.id}`)).json, after);

  // 同じ値の再送（フォーム全体の送信）と、他の項目の変更は通る
  const same = await a.call('PATCH', `/api/goals/${goal.id}`, { ...validGoal, initialProgress: 0, title: '英語' });
  assert.equal(same.status, 200, same.body);
  assert.deepEqual(same.json, { ...after, title: '英語', goalSettingsRevision: 1 });

  // 昨日の記録だけなら today は UNRECORDED のまま
  await db.pool.query(`delete from action_log where goal_id = $1`, [goal.id]);
  await db.pool.query(`insert into action_log (goal_id, local_date, status, amount) values ($1, '2026-10-05', 'SKIPPED', null)`, [goal.id]);
  const yesterdayOnly = (await a.call('GET', `/api/goals/${goal.id}`)).json as unknown as Goal;
  assert.equal(yesterdayOnly.hasLogs, true);
  assert.equal(yesterdayOnly.todayStatus, 'UNRECORDED');
});

test('一覧と取得の累計（progressDone）は、初期量＋今日までのDONEの量で、Todayの累計と一致する（#146）', async (t) => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'progress');
  const goal = (await a.call('POST', '/api/goals', { ...validGoal, initialProgress: 100 })).json as unknown as Goal;
  assert.equal(goal.progressDone, 100);
  // DONEの量を足し、SKIPPEDは数えない
  await db.pool.query(`insert into action_log (goal_id, local_date, status, amount) values ($1, '2026-10-06', 'DONE', 30)`, [goal.id]);
  const other = (await a.call('POST', '/api/goals', validGoal)).json as unknown as Goal;
  await db.pool.query(`insert into action_log (goal_id, local_date, status, amount) values ($1, '2026-10-06', 'SKIPPED', null)`, [other.id]);

  const list = (await a.call('GET', '/api/goals')).json as unknown as Goal[];
  // 同じ時刻に作ったGoalの並びは決まらないので、idで引いて比べる
  const byId = new Map(list.map((g) => [g.id, g.progressDone]));
  assert.deepEqual([byId.get(goal.id), byId.get(other.id)], [130, 0]);
  assert.equal(((await a.call('GET', `/api/goals/${goal.id}`)).json as unknown as Goal).progressDone, 130);
  const today = (await a.call('GET', `/api/goals/${goal.id}/today`)).json as { prediction: { progress: { done: number } } };
  assert.equal(today.prediction.progress.done, 130);
});

test('削除: 204でbodyなし、紐づく記録も消え、再送は404', async (t) => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const a = await signedInClient(stack.app, 'del');
  const goal = (await a.call('POST', '/api/goals', validGoal)).json as unknown as Goal;
  const keep = (await a.call('POST', '/api/goals', { ...validGoal, title: '残す' })).json as unknown as Goal;
  await db.pool.query(`insert into action_log (goal_id, local_date, status, amount) values ($1, '2026-10-06', 'DONE', 30), ($2, '2026-10-06', 'SKIPPED', null)`, [goal.id, keep.id]);

  const res = await a.call('DELETE', `/api/goals/${goal.id}`);
  assert.equal(res.status, 204);
  assert.equal(res.body, '');
  assert.equal((await a.call('GET', `/api/goals/${goal.id}`)).status, 404);
  assert.equal((await a.call('DELETE', `/api/goals/${goal.id}`)).status, 404);
  const counts = (await db.pool.query<{ goals: number; logs: number }>('select (select count(*) from goal)::int as goals, (select count(*) from action_log)::int as logs')).rows[0];
  assert.deepEqual(counts, { goals: 1, logs: 1 }, 'only the deleted goal and its log are gone');
  assert.deepEqual(((await a.call('GET', '/api/goals')).json as unknown as Goal[]).map((g) => g.id), [keep.id]);
});

test('日付境界: 同じGoalでも時刻が進むと今日が変わり、記録開始日は変わらない', async (t) => {
  let now = new Date('2026-10-05T14:59:00Z'); // Asia/Tokyo 10/5 23:59
  const { stack } = await setup(t, { now: () => now });
  const a = await signedInClient(stack.app, 'boundary');
  const goal = (await a.call('POST', '/api/goals', validGoal)).json as unknown as Goal;
  assert.equal(goal.recordStartDate, '2026-10-05');
  assert.equal(goal.today, '2026-10-05');

  now = new Date('2026-10-05T15:00:00Z'); // Asia/Tokyo 10/6 00:00
  const next = (await a.call('GET', `/api/goals/${goal.id}`)).json as unknown as Goal;
  assert.equal(next.today, '2026-10-06');
  assert.equal(next.recordStartDate, '2026-10-05');
});
