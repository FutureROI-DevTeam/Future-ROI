import assert from 'node:assert/strict';
import test from 'node:test';
import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import pg from 'pg';
import { Goal, GoalR11, Today, TodayR11 } from '../src/contracts/index.ts';
import { isValidTimeZone } from '../src/goals/local-date.ts';
import { putLog } from '../src/logs/store.ts';
import { Client, setup, signedInClient } from './helpers/stack.ts';

FormatRegistry.Set('iana-timezone', isValidTimeZone);
const NOW = new Date('2026-10-06T15:30:00Z'); // Tokyo 10/7
const input = { title: 'practice', unit: 'minutes', totalRequired: 100, sessionAmount: 10, timezone: 'Asia/Tokyo' } as const;
const answers = { a: 'HIGH', b: 'LOW' } as const;
type Response = Awaited<ReturnType<Client['call']>>;
function goalR11(res: Response): GoalR11 {
  assert.equal(res.status, 200, res.body);
  assert.ok(Value.Check(GoalR11, res.json), 'HTTP応答が厳密な専用Goal schemaに合う');
  return res.json as GoalR11;
}
function todayR11(res: Response): TodayR11 {
  assert.equal(res.status, 200, res.body);
  assert.ok(Value.Check(TodayR11, res.json), 'HTTP応答が厳密な専用Today schemaに合う');
  return res.json as TodayR11;
}
async function waitFor(condition: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Expected normal operation did not reach its barrier');
}

test('R11 HTTP読取: 明示queryだけ専用DTO、既定Goal/Todayと書込応答は旧schemaを保持する', async t => {
  const { stack } = await setup(t, { now: () => NOW });
  const owner = await signedInClient(stack.app, 'r11-read-contract');
  const created = await owner.call('POST', '/api/goals?view=r11', { ...input, questionPrior: answers });
  assert.equal(created.status, 201, created.body);
  assert.ok(Value.Check(Goal, created.json), '書込成功DTOはqueryでも変わらない');
  const id = String(created.json!.id);
  const legacyGoal = await owner.call('GET', `/api/goals/${id}`);
  assert.equal(legacyGoal.status, 200, legacyGoal.body);
  assert.deepEqual(legacyGoal.json, created.json);
  assert.ok(Value.Check(Goal, legacyGoal.json));
  const legacyToday = await owner.call('GET', `/api/goals/${id}/today`);
  assert.equal(legacyToday.status, 200, legacyToday.body);
  assert.ok(Value.Check(Today, legacyToday.json));
  assert.equal((legacyToday.json!.prediction as Today['prediction']).config.prior, 2);
  assert.equal((legacyToday.json!.prediction as Today['prediction']).completion.status, 'insufficient');
  const read = goalR11(await owner.call('GET', `/api/goals/${id}?view=r11`));
  assert.deepEqual(read.questionPrior, answers);
  assert.equal(read.answerRevision, 0);
  assert.equal(read.historyRevision, '0');
  const today = todayR11(await owner.call('GET', `/api/goals/${id}/today?view=r11`));
  assert.deepEqual(today.context, { historyRevision: '0', historyFingerprint: '[]', recordStartDate: '2026-10-07', unit: 'minutes', sessionAmount: 10, unitLocked: false, goalSettingsRevision: 0, answerRevision: 0 });
  const { answerRevision: _removed, ...oldContext } = today.context;
  assert.ok(!Value.Check(TodayR11, { ...today, context: oldContext }), '回答版は必須で、旧contextへフォールバックしない');
  for (const answerRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0']) {
    assert.ok(!Value.Check(TodayR11, { ...today, context: { ...today.context, answerRevision } }));
  }
  assert.deepEqual(today.provenance, { a: 'QUESTION', b: 'QUESTION' });
  assert.deepEqual(today.prediction.posterior, { a: { alpha: 3, beta: 1 }, b: { alpha: 1, beta: 3 } });
  assert.equal(today.prediction.modelVersion, 'm1-question-prior-v1');
  assert.equal(today.prediction.completion.status, 'available');
  assert.equal(today.prediction.observations.effectiveTransitions, 0);
  assert.equal(today.plan, null);
  assert.ok(!Object.hasOwn(today.prediction.config, 'prior'));
  for (const key of ['questionPrior', 'answerRevision', 'rawAnswers', 'mapping', 'priorSnapshot']) {
    assert.ok(!Object.hasOwn(today, key));
    assert.ok(!Object.hasOwn(today.prediction, key));
  }
  const list = await owner.call('GET', '/api/goals');
  assert.equal(list.status, 200, list.body);
  assert.deepEqual(list.json, [created.json]);
});

test('R11 HTTP読取: 通常の認証・owner境界を保ち、未対応/未知/重複queryは422にする', async t => {
  const { stack } = await setup(t, { now: () => NOW });
  const owner = await signedInClient(stack.app, 'r11-owner');
  const other = await signedInClient(stack.app, 'r11-other');
  const anonymous = new Client(stack.app, null);
  const created = await owner.call('POST', '/api/goals', { ...input, questionPrior: answers });
  assert.equal(created.status, 201, created.body);
  const id = String(created.json!.id);
  for (const suffix of ['', '/today']) {
    const url = `/api/goals/${id}${suffix}`;
    assert.equal((await anonymous.call('GET', `${url}?view=r11`)).status, 401);
    const hidden = await other.call('GET', `${url}?view=r11`);
    assert.equal(hidden.status, 404, hidden.body);
    assert.equal((hidden.json!.error as { code: string }).code, 'NOT_FOUND');
    assert.equal((await owner.call('GET', `/api/goals/not-a-goal${suffix}?view=r11`)).status, 404);
    for (const query of ['view=legacy', 'view=', 'view=R11', 'view=r11&extra=true', 'view=r11&view=r11']) {
      const invalid = await owner.call('GET', `${url}?${query}`);
      assert.equal(invalid.status, 422, `${query}: ${invalid.body}`);
      const error = invalid.json!.error as { code: string; fields: { path: string }[] };
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.ok(error.fields.some(field => field.path === `querystring/${query.includes('extra') ? 'extra' : 'view'}`));
    }
  }
});

test('R11 HTTP読取: 部分回答・UNKNOWN・撤回を版付きGETで区別し、古い版の全PATCHを409で戻す', async t => {
  const { stack } = await setup(t, { now: () => NOW });
  const owner = await signedInClient(stack.app, 'r11-answer-lifecycle');
  const created = await owner.call('POST', '/api/goals', input);
  assert.equal(created.status, 201, created.body);
  const id = String(created.json!.id), url = `/api/goals/${id}`;
  let saved = goalR11(await owner.call('GET', `${url}?view=r11`));
  assert.deepEqual(saved.questionPrior, { a: null, b: null });
  assert.equal(saved.answerRevision, 0);
  const variants = [
    { raw: { a: 'HIGH', b: null }, source: { a: 'QUESTION', b: 'NONE' }, center: 'insufficient' },
    { raw: { a: 'UNKNOWN', b: null }, source: { a: 'NONE', b: 'NONE' }, center: 'insufficient' },
    { raw: { a: null, b: 'LOW' }, source: { a: 'NONE', b: 'QUESTION' }, center: 'available' },
    { raw: { a: null, b: 'UNKNOWN' }, source: { a: 'NONE', b: 'NONE' }, center: 'insufficient' },
    { raw: { a: null, b: null }, source: { a: 'NONE', b: 'NONE' }, center: 'insufficient' },
  ] as const;
  for (const variant of variants) {
    const previous = saved;
    const write = await owner.call('PATCH', `${url}?view=r11`, { questionPrior: variant.raw, expectedAnswerRevision: previous.answerRevision });
    assert.equal(write.status, 200, write.body);
    assert.ok(Value.Check(Goal, write.json));
    saved = goalR11(await owner.call('GET', `${url}?view=r11`));
    assert.deepEqual(saved.questionPrior, variant.raw);
    assert.equal(saved.answerRevision, previous.answerRevision + 1);
    const noOp = await owner.call('PATCH', url, { questionPrior: variant.raw, expectedAnswerRevision: saved.answerRevision });
    assert.equal(noOp.status, 200, noOp.body);
    assert.deepEqual(goalR11(await owner.call('GET', `${url}?view=r11`)), saved);
    const stale = await owner.call('PATCH', url, { title: 'must rollback', questionPrior: variant.raw, expectedAnswerRevision: previous.answerRevision });
    assert.equal(stale.status, 409, stale.body);
    assert.deepEqual(goalR11(await owner.call('GET', `${url}?view=r11`)), saved);
    const today = todayR11(await owner.call('GET', `${url}/today?view=r11`));
    assert.equal(today.context.answerRevision, saved.answerRevision);
    assert.equal(today.context.goalSettingsRevision, 0, '回答のみの変更は設定版を増やさない');
    assert.deepEqual(today.provenance, variant.source);
    assert.equal(today.prediction.coreMetric.status, variant.center);
    assert.equal(today.prediction.completion.status, 'insufficient');
    assert.deepEqual(today.plan, { remainingAmount: 100, remainingSessions: 10, lastSessionAmount: 10 });
    assert.equal(today.prediction.observations.recordedDays, 0);
  }
});

test('R11 HTTP予測: 実遷移と回答の出所を分け、撤回/文脈変更後も実量を保ち再計算する', async t => {
  let now = new Date('2026-10-05T03:00:00Z');
  const { db, stack } = await setup(t, { now: () => now });
  const owner = await signedInClient(stack.app, 'r11-evidence');
  const created = await owner.call('POST', '/api/goals', { ...input, questionPrior: { a: 'HIGH', b: 'UNKNOWN' } });
  assert.equal(created.status, 201, created.body);
  const id = String(created.json!.id), url = `/api/goals/${id}`;
  assert.equal((await owner.call('PUT', `${url}/logs/2026-10-05`, { status: 'SKIPPED' })).status, 200);
  now = new Date('2026-10-06T03:00:00Z');
  assert.equal((await owner.call('PUT', `${url}/logs/2026-10-06`, { status: 'DONE', amount: 7 })).status, 200);
  now = NOW;
  const legacy = await owner.call('GET', `${url}/today`);
  const records = todayR11(await owner.call('GET', `${url}/today?view=r11`));
  assert.deepEqual(records.provenance, { a: 'QUESTION', b: 'RECORDS' });
  assert.equal(records.prediction.observations.nSD, 1);
  assert.equal(records.prediction.observations.effectiveTransitions, 1);
  assert.deepEqual(records.prediction.posterior.b, { alpha: 3, beta: 2 });
  assert.equal(records.prediction.progress.done, 7);
  assert.equal((await owner.call('PATCH', url, { questionPrior: answers, expectedAnswerRevision: 0 })).status, 200);
  const combined = todayR11(await owner.call('GET', `${url}/today?view=r11`));
  assert.deepEqual(combined.provenance, { a: 'QUESTION', b: 'QUESTION_AND_RECORDS' });
  assert.deepEqual(combined.prediction.posterior.b, { alpha: 2, beta: 3 });
  assert.deepEqual(combined.prediction.observations, records.prediction.observations);
  assert.equal(combined.prediction.progress.done, 7);
  assert.deepEqual((await owner.call('GET', `${url}/today`)).json, legacy.json, '回答だけの編集は旧予測を変えない');
  assert.equal((await owner.call('PATCH', url, { totalRequired: 125 })).status, 200);
  let saved = goalR11(await owner.call('GET', `${url}?view=r11`));
  assert.deepEqual(saved.questionPrior, answers); assert.equal(saved.answerRevision, 1);
  // #148: 既存DONEの単位は固定。旧文脈撤回の目的はsessionAmount変更で検証する。
  const unitChange = await owner.call('PATCH', url, { unit: 'sessions', sessionAmount: 4, expectedAnswerRevision: 1 });
  assert.equal(unitChange.status, 422);
  assert.equal((unitChange.json!.error as { code: string }).code, 'GOAL_UNIT_LOCKED');
  assert.deepEqual(goalR11(await owner.call('GET', `${url}?view=r11`)), saved);
  assert.equal((await owner.call('PATCH', url, { sessionAmount: 4, expectedAnswerRevision: 1 })).status, 200);
  saved = goalR11(await owner.call('GET', `${url}?view=r11`));
  assert.deepEqual(saved.questionPrior, { a: null, b: null }); assert.equal(saved.answerRevision, 2);
  const cleared = todayR11(await owner.call('GET', `${url}/today?view=r11`));
  assert.deepEqual(cleared.context, { historyRevision: '2', historyFingerprint: JSON.stringify([['2026-10-05', 'SKIPPED', null], ['2026-10-06', 'DONE', 7]]), recordStartDate: '2026-10-05', unit: 'minutes', sessionAmount: 4, goalSettingsRevision: 2, answerRevision: 2, unitLocked: true });
  assert.deepEqual(cleared.provenance, { a: 'NONE', b: 'RECORDS' });
  assert.equal(cleared.prediction.progress.done, 7);
  assert.deepEqual(cleared.plan, { remainingAmount: 118, remainingSessions: 30, lastSessionAmount: 2 });
  assert.deepEqual((await db.pool.query('select amount from action_log where goal_id = $1 and status = $2', [id, 'DONE'])).rows, [{ amount: 7 }]);
});

test('R11 HTTP Todayはfirst SELECT後の文脈撤回/新日ログcommitを混ぜず、その後の時計で日付を作る', async t => {
  let now = new Date('2026-10-06T14:59:59Z'); // Tokyo 10/6 23:59:59
  const { db, stack } = await setup(t, { now: () => now });
  const owner = await signedInClient(stack.app, 'r11-http-snapshot');
  const created = await owner.call('POST', '/api/goals', { ...input, questionPrior: answers });
  assert.equal(created.status, 201, created.body);
  const id = String(created.json!.id), url = `/api/goals/${id}`;
  const nativeConnect = db.pool.connect;
  let writes = 0;
  db.pool.connect = ((...args: unknown[]) => {
    if (args.some(arg => typeof arg === 'function')) return Reflect.apply(nativeConnect, db.pool, args);
    db.pool.connect = nativeConnect;
    return Promise.resolve(Reflect.apply(nativeConnect, db.pool, args)).then((client: pg.PoolClient) => {
      const query = client.query, release = client.release;
      let used = false;
      client.query = ((...queryArgs: unknown[]) => {
        const result = Reflect.apply(query, client, queryArgs);
        if (!used && typeof queryArgs[0] === 'string' && queryArgs[0].startsWith('select total_required')) {
          used = true;
          return Promise.resolve(result).then(async rows => {
            now = new Date('2026-10-06T15:00:00Z'); // Tokyo 10/7
            assert.equal((await owner.call('PATCH', url, { sessionAmount: 4, expectedAnswerRevision: 0 })).status, 200);
            assert.equal((await owner.call('PUT', `${url}/logs/2026-10-07`, { status: 'DONE', amount: 7 })).status, 200);
            writes++; return rows;
          });
        }
        return result;
      }) as typeof client.query;
      client.release = (...releaseArgs) => { client.query = query; client.release = release; Reflect.apply(release, client, releaseArgs); };
      return client;
    });
  }) as typeof db.pool.connect;
  try {
    const old = todayR11(await owner.call('GET', `${url}/today?view=r11`));
    assert.equal(writes, 1);
    assert.equal(old.today, '2026-10-07', 'first SELECT後にclockを読む');
    assert.equal(old.context.sessionAmount, 10);
    assert.equal(old.context.answerRevision, 0);
    assert.equal(old.todayLog, null);
    assert.equal(old.prediction.progress.done, 0);
    assert.deepEqual(old.provenance, { a: 'QUESTION', b: 'QUESTION' });
    assert.deepEqual(old.prediction.posterior, { a: { alpha: 3, beta: 1 }, b: { alpha: 1, beta: 3 } });
    const fresh = todayR11(await owner.call('GET', `${url}/today?view=r11`));
    assert.equal(fresh.context.sessionAmount, 4);
    assert.equal(fresh.context.answerRevision, 1);
    assert.deepEqual(fresh.todayLog, { localDate: '2026-10-07', status: 'DONE', amount: 7 });
    assert.equal(fresh.prediction.progress.done, 7);
    assert.deepEqual(fresh.provenance, { a: 'NONE', b: 'NONE' });
    assert.deepEqual(fresh.prediction.posterior, { a: { alpha: 2, beta: 2 }, b: { alpha: 2, beta: 2 } });
    assert.equal(db.pool.totalCount - db.pool.idleCount, 0);
  } finally { db.pool.connect = nativeConnect; }
});

test('R11 HTTP Todayはpool待ち後に時計を1回読み、新日の通常ログをfuture扱いしない', async t => {
  let now = new Date('2026-10-06T14:59:59Z'), calls = 0;
  const { db, stack } = await setup(t, { now: () => { calls++; return now; } });
  const owner = await signedInClient(stack.app, 'r11-http-pool');
  const created = await owner.call('POST', '/api/goals', { ...input, questionPrior: answers });
  assert.equal(created.status, 201, created.body);
  const id = String(created.json!.id);
  const userId = (await db.pool.query<{ user_id: string }>('select user_id from goal where id = $1', [id])).rows[0]!.user_id;
  const held = await Promise.all(Array.from({ length: 3 }, () => db.pool.connect()));
  const writer = new pg.Pool({ connectionString: db.connectionString, max: 1 });
  calls = 0;
  const read = owner.call('GET', `/api/goals/${id}/today?view=r11`);
  let released = false;
  try {
    await waitFor(() => db.pool.waitingCount === 1);
    assert.equal(calls, 0);
    now = new Date('2026-10-06T15:00:00Z');
    assert.equal((await putLog(writer, userId, id, '2026-10-07', { expectedGoalSettingsRevision: 0, amount: 10, status: 'DONE' }, () => now)).kind, 'saved');
    held.forEach(client => client.release()); released = true;
    const today = todayR11(await read);
    assert.equal(calls, 1);
    assert.equal(today.today, '2026-10-07');
    assert.deepEqual(today.todayLog, { localDate: '2026-10-07', status: 'DONE', amount: 10 });
    assert.equal(today.prediction.progress.done, 10);
    assert.deepEqual(today.provenance, { a: 'QUESTION', b: 'QUESTION' });
  } finally { if (!released) held.forEach(client => client.release()); await read.catch(() => {}); await writer.end(); }
});

for (const [name, nextAnswers] of [
  ['回答変更', { a: 'LOW', b: 'HIGH' }],
  ['回答撤回', { a: null, b: null }],
] as const) {
  test(`R11 HTTP Todayの回答版はfirst SELECT後の${name}で新しい版へすり替わらない`, async t => {
    const { db, stack } = await setup(t, { now: () => NOW });
    const owner = await signedInClient(stack.app, 'r11-answer-snapshot');
    const otherTab = new Client(stack.app, 'http://127.0.0.1:3000');
    for (const [key, value] of owner.cookies) otherTab.cookies.set(key, value);
    const created = await owner.sendExact('POST', '/api/goals', { ...input, questionPrior: answers }, { 'idempotency-key': crypto.randomUUID() });
    assert.equal(created.status, 201, created.body);
    const id = String(created.json!.id), url = `/api/goals/${id}`;
    const before = goalR11(await owner.sendExact('GET', `${url}?view=r11`));
    const legacy = await owner.sendExact('GET', `${url}/today`);
    const stored = (await db.pool.query('select question_prior_snapshot from goal where id = $1', [id])).rows[0].question_prior_snapshot;
    const nativeConnect = db.pool.connect;
    let writes = 0;
    // 本物の最初のSELECTで読取snapshotを確立してから、別clientの回答のみの変更をcommitする。
    db.pool.connect = ((...args: unknown[]) => {
      if (args.some(arg => typeof arg === 'function')) return Reflect.apply(nativeConnect, db.pool, args);
      db.pool.connect = nativeConnect;
      return Promise.resolve(Reflect.apply(nativeConnect, db.pool, args)).then((client: pg.PoolClient) => {
        const query = client.query, release = client.release;
        let used = false;
        client.query = ((...queryArgs: unknown[]) => {
          const result = Reflect.apply(query, client, queryArgs);
          if (!used && typeof queryArgs[0] === 'string' && queryArgs[0].startsWith('select total_required')) {
            used = true;
            return Promise.resolve(result).then(async rows => {
              const changed = await otherTab.sendExact('PATCH', url, {
                expectedGoalSettingsRevision: before.goalSettingsRevision,
                expectedAnswerRevision: before.answerRevision,
                questionPrior: nextAnswers,
              });
              assert.equal(changed.status, 200, changed.body);
              writes++;
              return rows;
            });
          }
          return result;
        }) as typeof client.query;
        client.release = (...releaseArgs) => { client.query = query; client.release = release; Reflect.apply(release, client, releaseArgs); };
        return client;
      });
    }) as typeof db.pool.connect;
    try {
      const delayed = todayR11(await owner.sendExact('GET', `${url}/today?view=r11`));
      assert.equal(writes, 1);
      const after = goalR11(await otherTab.sendExact('GET', `${url}?view=r11`));
      const fresh = todayR11(await owner.sendExact('GET', `${url}/today?view=r11`));
      assert.equal(after.answerRevision, before.answerRevision + 1);
      assert.equal(after.goalSettingsRevision, before.goalSettingsRevision);
      assert.deepEqual(after.questionPrior, nextAnswers);
      assert.equal(delayed.context.answerRevision, before.answerRevision, '古い予測には古い回答版');
      assert.equal(fresh.context.answerRevision, after.answerRevision, '新しい予測には新しい回答版');
      assert.equal(delayed.context.goalSettingsRevision, fresh.context.goalSettingsRevision);
      assert.deepEqual(delayed.prediction.posterior, { a: { alpha: 3, beta: 1 }, b: { alpha: 1, beta: 3 } });
      assert.notDeepEqual(fresh.prediction.posterior, delayed.prediction.posterior);
      if (nextAnswers.a === null) {
        assert.equal(delayed.prediction.completion.status, 'available');
        assert.equal(fresh.prediction.completion.status, 'insufficient');
      }
      assert.deepEqual((await owner.sendExact('GET', `${url}/logs`)).json, []);
      assert.deepEqual((await owner.sendExact('GET', `${url}/today`)).json, legacy.json, '旧Todayの形と予測は変えない');
      assert.deepEqual(Object.keys(stored.context).sort(), ['recordStartDate', 'sessionAmount', 'unit'], '保存回答snapshotへ公開版を追加しない');
      assert.equal(db.pool.totalCount - db.pool.idleCount, 0);
    } finally { db.pool.connect = nativeConnect; }
  });
}

test('R11 HTTP失敗復旧: 未知の保存mappingは両GETを共通500にし、復元後に接続と正常応答を回復する', async t => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const owner = await signedInClient(stack.app, 'r11-http-recovery');
  const created = await owner.call('POST', '/api/goals', { ...input, questionPrior: answers });
  assert.equal(created.status, 201, created.body);
  const id = String(created.json!.id), url = `/api/goals/${id}`;
  const before = goalR11(await owner.call('GET', `${url}?view=r11`));
  const beforeToday = todayR11(await owner.call('GET', `${url}/today?view=r11`));
  const saved = (await db.pool.query('select question_prior_snapshot from goal where id = $1', [id])).rows[0].question_prior_snapshot;
  try {
    // 新規専用DBの保存データ障害を再現する。HTTPから内部mappingを書き込む入口は作らない。
    await db.pool.query(`update goal set question_prior_snapshot = jsonb_set(question_prior_snapshot, '{mapping,version}', '"unknown-version"'::jsonb) where id = $1`, [id]);
    for (const suffix of ['', '/today']) {
      const failed = await owner.call('GET', `${url}${suffix}?view=r11`);
      assert.equal(failed.status, 500, failed.body);
      assert.deepEqual(failed.json, { error: { code: 'PREDICTION_FAILED', message: 'Prediction could not be computed.' } });
      assert.equal(db.pool.totalCount - db.pool.idleCount, 0);
    }
    const failedWrite = await owner.call('PATCH', url, { title: 'must rollback' });
    assert.equal(failedWrite.status, 500, failedWrite.body);
    assert.equal((await db.pool.query('select title from goal where id = $1', [id])).rows[0].title, input.title);
  } finally {
    await db.pool.query('update goal set question_prior_snapshot = $2::jsonb where id = $1', [id, JSON.stringify(saved)]);
  }
  assert.deepEqual(goalR11(await owner.call('GET', `${url}?view=r11`)), before);
  assert.deepEqual(todayR11(await owner.call('GET', `${url}/today?view=r11`)), beforeToday);
  assert.equal(db.pool.totalCount - db.pool.idleCount, 0);
});
