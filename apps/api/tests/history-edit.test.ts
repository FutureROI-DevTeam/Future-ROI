import assert from 'node:assert/strict';
import test from 'node:test';
import type { GoalR11 } from '../src/contracts/r11.ts';
import { setup, signedInClient, Client } from './helpers/stack.ts';

test('historical edits preserve ownership, epochs, exact amounts and snapshot consistency', async t => {
  let now = new Date('2026-01-01T12:00:00Z');
  const { db, stack } = await setup(t, { now: () => now });
  const owner = await signedInClient(stack.app, 'history-owner');
  const other = await signedInClient(stack.app, 'history-other');
  const created = await owner.call('POST', '/api/goals', { title:'History', unit:'minutes', totalRequired:10000, sessionAmount:30, timezone:'Asia/Tokyo' });
  const id = created.json!.id as string;
  const base = '/api/goals/' + id;
  now = new Date('2026-01-15T12:00:00Z');
  const read = async () => (await owner.call('GET', base+'?view=r11')).json as unknown as GoalR11;
  const put = async (date: string, status: string, amount?: number, revision?: string) => {
    const goal=await read();
    return owner.sendExact('PATCH',base+'/logs/'+date,{status,expectedGoalSettingsRevision:goal.goalSettingsRevision,expectedHistoryRevision:revision ?? goal.historyRevision,...(amount===undefined?{}:{amount})});
  };
  await t.test('old DONE uses explicit saved amount and can change to SKIPPED or missing', async()=>{
    assert.equal((await put('2026-01-03','DONE',47)).status,200);
    let goal=await read(); assert.equal(goal.progressDone,47);
    const before=(await owner.call('GET',base+'/today?view=r11')).json!;
    assert.equal((await put('2026-01-04','SKIPPED')).status,200);
    const after=(await owner.call('GET',base+'/today?view=r11')).json!;
    goal=await read(); assert.equal(goal.progressDone,47,'same total');
    assert.notDeepEqual(before.context,after.context,'same-total changes advance history epoch and fingerprint');
    assert.notDeepEqual((before.prediction as any).observations,(after.prediction as any).observations,'transition evidence changes');
    assert.equal((await put('2026-01-03','DONE',83)).status,200);
    assert.equal((await read()).progressDone,83);
    assert.equal((await put('2026-01-03','SKIPPED')).status,200);
    assert.equal((await read()).progressDone,0);
    assert.equal((await put('2026-01-03','UNRECORDED')).status,200);
    const logs=(await owner.call('GET',base+'/logs')).json as any;
    assert.ok(!logs.some((l:any)=>l.localDate==='2026-01-03'));
    assert.equal((await read()).unitLocked,true,'deleting DONE never unlocks unit history');
  });
  await t.test('parallel writers: one winner; delete/recreate rejects stale missing-day epoch',async()=>{
    const goal=await read();
    const results=await Promise.all([put('2026-01-05','DONE',21,goal.historyRevision),put('2026-01-06','DONE',22,goal.historyRevision)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const before=await read();
    assert.equal((await put('2026-01-04','UNRECORDED')).status,200);
    const after=await read();assert.notEqual(after.historyRevision,before.historyRevision);
    assert.equal((await put('2026-01-04','DONE',11,before.historyRevision)).status,409);
    assert.equal((await put('2026-01-04','DONE',11)).status,200);
    const current=await read();
    const r=await owner.sendExact('PUT',base+'/logs/2026-01-15',{status:'DONE',amount:30,expectedGoalSettingsRevision:current.goalSettingsRevision,expectedHistoryRevision:before.historyRevision});
    assert.equal(r.status,409,'legacy today route also respects supplied history epoch');
  });
  await t.test('validation, date window, owner and origin boundaries never mutate',async()=>{
    const goal=await read();
    const body={status:'DONE',amount:10,expectedGoalSettingsRevision:goal.goalSettingsRevision,expectedHistoryRevision:goal.historyRevision};
    for(const date of ['2025-12-31','2026-01-16','2026-02-30']) assert.equal((await owner.sendExact('PATCH',base+'/logs/'+date,body)).status,422,date);
    for(const status of ['DONE','SKIPPED','UNRECORDED']) assert.equal((await owner.sendExact('PATCH',base+'/logs/2026-01-08',{...body,status,amount:0})).status,422);
    assert.equal((await owner.sendExact('PATCH',base+'/logs/2026-01-08',{...body,expectedGoalSettingsRevision:999})).status,409);
    assert.equal((await owner.sendExact('PATCH',base+'/logs/2026-01-08',{...body,expectedHistoryRevision:undefined})).status,422);
    assert.equal((await other.sendExact('PATCH',base+'/logs/2026-01-08',body)).status,404);
    assert.equal((await new Client(stack.app,'http://127.0.0.1:3000').sendExact('PATCH',base+'/logs/2026-01-08',body)).status,401);
    assert.equal((await owner.sendExact('PATCH',base+'/logs/2026-01-08',body,{origin:'https://invalid.example'})).status,403);
    assert.equal((await read()).historyRevision,goal.historyRevision);
  });
  await t.test('failure rolls back both record and epoch',async()=>{
    const before=await read();
    await db.pool.query("create function history_test_failure() returns trigger language plpgsql as $$ begin if new.amount=42 then raise exception 'synthetic failure'; end if; return new; end; $$; create trigger history_test_failure before insert or update on action_log for each row execute function history_test_failure();");
    assert.equal((await put('2026-01-08','DONE',42)).status,500);
    assert.equal((await read()).historyRevision,before.historyRevision);
    assert.equal((await read()).progressDone,before.progressDone);
    await db.pool.query('drop trigger history_test_failure on action_log; drop function history_test_failure()');
  });
  await t.test('cancellation keeps timezone/unit locks while initial progress remains correctable',async()=>{
    const g=(await owner.call('POST','/api/goals',{title:'Locks',unit:'minutes',totalRequired:100,sessionAmount:1,timezone:'Asia/Tokyo'})).json!;
    const path='/api/goals/'+g.id;
    const edit=async(status:string)=>{
      const goal=(await owner.call('GET',path+'?view=r11')).json!;
      return owner.sendExact('PATCH',path+'/logs/2026-01-15',{status,...(status==='DONE'?{amount:1}:{}),expectedGoalSettingsRevision:goal.goalSettingsRevision,expectedHistoryRevision:goal.historyRevision});
    };
    assert.equal((await edit('DONE')).status,200);
    assert.equal((await edit('UNRECORDED')).status,200);
    const goal=(await owner.call('GET',path+'?view=r11')).json!;
    assert.equal(goal.hasLogs,false);
    for(const patch of [{timezone:'UTC'},{unit:'sessions'}]) assert.equal((await owner.sendExact('PATCH',path,{...patch,expectedGoalSettingsRevision:goal.goalSettingsRevision})).status,422);
    const corrected=await owner.sendExact('PATCH',path,{initialProgress:1,expectedGoalSettingsRevision:goal.goalSettingsRevision});
    assert.equal(corrected.status,200);assert.equal(corrected.json!.progressDone,1);assert.equal(corrected.json!.unitLocked,true);
  });
  await t.test('timezone midnight and DST use the Goal calendar date',async()=>{
    now=new Date('2026-03-07T12:00:00Z');
    const local=(await owner.call('POST','/api/goals',{title:'DST',unit:'sessions',totalRequired:100,sessionAmount:1,timezone:'America/Los_Angeles'})).json!;
    const localBase='/api/goals/'+local.id;
    const save=async(date:string)=>{
      const goal=(await owner.call('GET',localBase+'?view=r11')).json!;
      return owner.sendExact('PATCH',localBase+'/logs/'+date,{status:'DONE',amount:1,expectedGoalSettingsRevision:goal.goalSettingsRevision,expectedHistoryRevision:goal.historyRevision});
    };
    now=new Date('2026-03-08T07:59:59Z');assert.equal((await save('2026-03-08')).status,422);
    now=new Date('2026-03-08T08:00:00Z');assert.equal((await save('2026-03-08')).status,200);
    now=new Date('2026-03-09T06:59:59Z');assert.equal((await save('2026-03-09')).status,422);
    now=new Date('2026-03-09T07:00:00Z');assert.equal((await save('2026-03-09')).status,200);
  });
});
