import assert from 'node:assert/strict';
import test from 'node:test';
import type { GoalR11, TodayR11 } from '../src/contracts/r11.ts';
import { setup, signedInClient, Client } from './helpers/stack.ts';

const NOW = new Date('2026-11-01T12:00:00Z');

test('start-before cumulative correction preserves records, prediction evidence and settings CAS', async t => {
  const { db, stack } = await setup(t, { now: () => NOW });
  const owner = await signedInClient(stack.app, 'initial-owner');
  const other = await signedInClient(stack.app, 'initial-other');
  const created = await owner.call('POST', '/api/goals', { title: 'Initial correction', unit: 'minutes', totalRequired: 1200, sessionAmount: 30, initialProgress: 300, timezone: 'Asia/Tokyo', questionPrior: { a: 'MID', b: 'HIGH' } });
  const id = created.json!.id as string;
  const base = '/api/goals/' + id;
  const read = async () => (await owner.call('GET', base + '?view=r11')).json as unknown as GoalR11;
  const today = async () => (await owner.call('GET', base + '/today?view=r11')).json as unknown as TodayR11;
  const logs = async () => (await owner.call('GET', base + '/logs')).json;
  const patch = async (amount: number, revision?: number) => owner.sendExact('PATCH', base, { initialProgress: amount, expectedGoalSettingsRevision: revision ?? (await read()).goalSettingsRevision });
  // Only this test's newly created Goal: establish actual adjacent daily observations.
  await db.pool.query('update goal set record_start_date=$2::date, question_prior_snapshot=jsonb_set(question_prior_snapshot,\'{context,recordStartDate}\',to_jsonb($2::text)) where id=$1', [id, '2026-10-26']);
  for (const [date, status, amount] of [['2026-10-26','DONE',30],['2026-10-27','DONE',30],['2026-10-28','SKIPPED',null],['2026-10-29','SKIPPED',null],['2026-10-30','DONE',30],['2026-10-31','SKIPPED',null]] as const) {
    const goal = await read();
    assert.equal((await owner.sendExact('PATCH', base+'/logs/'+date, { status, ...(amount===null ? {} : {amount}), expectedGoalSettingsRevision:goal.goalSettingsRevision, expectedHistoryRevision:goal.historyRevision })).status,200);
  }
  const original = await read(), originalToday = await today(), originalLogs = await logs();

  await t.test('increase/decrease/zero change only baseline and completion, not evidence or daily rows', async () => {
    for (const amount of [600, 60, 0]) {
      const before = await read();
      const response = await patch(amount);
      assert.equal(response.status,200,response.body);
      const goal = await read(), result = await today();
      assert.equal(goal.initialProgress,amount);
      assert.equal(goal.progressDone,amount+90);
      assert.equal(goal.goalSettingsRevision,before.goalSettingsRevision+1);
      assert.equal(goal.historyRevision,original.historyRevision);
      assert.equal(goal.historyFingerprint,original.historyFingerprint);
      assert.equal(goal.recordStartDate,original.recordStartDate);
      assert.equal(goal.timezone,original.timezone);
      assert.equal(goal.unitLocked,true);
      assert.equal(goal.answerRevision,original.answerRevision);
      assert.deepEqual(goal.questionPrior,original.questionPrior);
      assert.deepEqual(await logs(),originalLogs);
      assert.deepEqual(result.prediction.observations,originalToday.prediction.observations);
      assert.deepEqual(result.prediction.posterior,originalToday.prediction.posterior);
      assert.deepEqual(result.prediction.coreMetric,originalToday.prediction.coreMetric);
      assert.equal(result.prediction.progress.done,goal.progressDone);
      assert.equal(result.context.goalSettingsRevision,goal.goalSettingsRevision);
      if(amount===600)assert.notDeepEqual(result.prediction.completion,originalToday.prediction.completion);
    }
  });
  await t.test('completion and over-target facts are reversible; no-op replay does not increment',async()=>{
    assert.equal((await patch(1110)).status,200);
    assert.equal((await today()).prediction.completion.status,'completed');
    assert.equal((await patch(1500)).status,200);
    assert.equal((await read()).progressDone,1590);
    const before=await read();assert.equal((await patch(1500)).status,200);
    assert.equal((await read()).goalSettingsRevision,before.goalSettingsRevision);
    assert.equal((await patch(0)).status,200);
    assert.equal((await today()).prediction.progress.completed,false);
    assert.deepEqual(await logs(),originalLogs);
  });
  await t.test('parallel absolute corrections have one winner and stale repeat never adds twice',async()=>{
    const before=await read();
    const responses=await Promise.all([patch(111,before.goalSettingsRevision),patch(222,before.goalSettingsRevision)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const winner=await read();assert.ok([111,222].includes(winner.initialProgress));
    assert.equal((await patch(333,before.goalSettingsRevision)).status,409);
    assert.equal((await read()).progressDone,winner.initialProgress+90);
  });
  await t.test('normal daily save and baseline correction retain both amounts; old daily drafts conflict',async()=>{
    const before=await read();
    assert.equal((await patch(300)).status,200);
    const body={status:'DONE',amount:17,expectedGoalSettingsRevision:before.goalSettingsRevision,expectedHistoryRevision:before.historyRevision};
    assert.equal((await owner.sendExact('PUT',base+'/logs/2026-11-01',body)).status,409);
    const current=await read();
    assert.equal((await owner.sendExact('PUT',base+'/logs/2026-11-01',{...body,expectedGoalSettingsRevision:current.goalSettingsRevision})).status,200);
    // A new daily record does not overwrite the independently versioned baseline.
    assert.equal((await patch(600,current.goalSettingsRevision)).status,200);
    assert.equal((await read()).progressDone,707);
  });
  await t.test('validation, owner, origin, timezone and unit guards preserve the whole request',async()=>{
    const before=await read();
    for(const amount of [-1,0.5,2147483648,null,'10'])assert.equal((await owner.sendExact('PATCH',base,{initialProgress:amount,expectedGoalSettingsRevision:before.goalSettingsRevision})).status,422);
    for(const forbidden of [{timezone:'UTC'},{unit:'sessions'}])assert.equal((await owner.sendExact('PATCH',base,{initialProgress:1,title:'must rollback',...forbidden,expectedGoalSettingsRevision:before.goalSettingsRevision})).status,422);
    const body={initialProgress:1,expectedGoalSettingsRevision:before.goalSettingsRevision};
    assert.equal((await other.sendExact('PATCH',base,body)).status,404);
    assert.equal((await new Client(stack.app,'http://127.0.0.1:3000').sendExact('PATCH',base,body)).status,401);
    assert.equal((await owner.sendExact('PATCH',base,body,{origin:'https://invalid.example'})).status,403);
    assert.equal((await owner.sendExact('PATCH',base,{initialProgress:1})).status,422);
    assert.deepEqual(await read(),before);
  });
  await t.test('database failure rolls back initial value, settings revision and all other fields',async()=>{
    const before=await read();
    await db.pool.query("create function initial_test_failure() returns trigger language plpgsql as $$ begin if new.initial_progress=42 then raise exception 'synthetic failure'; end if; return new; end; $$; create trigger initial_test_failure before update on goal for each row execute function initial_test_failure();");
    assert.equal((await patch(42)).status,500);
    assert.deepEqual(await read(),before);
    await db.pool.query('drop trigger initial_test_failure on goal; drop function initial_test_failure()');
  });
});
