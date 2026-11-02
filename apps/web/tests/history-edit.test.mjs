import assert from 'node:assert/strict';
import test from 'node:test';
import { cumulativeSeries, editableDate } from '../src/features/history/history-model.ts';
import { isSameSnapshot } from '../src/features/today/snapshot.ts';
test('period window preserves carried progress, zero, missing days and excess',()=>{
  const logs=[{localDate:'2026-01-01',status:'DONE',amount:40},{localDate:'2026-01-03',status:'SKIPPED',amount:null},{localDate:'2026-01-04',status:'DONE',amount:50}];
  const all=cumulativeSeries(logs,10,'2026-01-01','2026-01-04');
  const window=cumulativeSeries(logs,10,'2026-01-01','2026-01-04','2026-01-02');
  assert.deepEqual(window,all.slice(1));
  assert.deepEqual(window.map(d=>[d.status,d.amount,d.cumulative]),[['UNRECORDED',null,50],['SKIPPED',null,50],['DONE',50,100]]);
  assert.equal(editableDate('2026-01-01','2026-01-01','2026-01-04'),true);
  assert.equal(editableDate('2026-01-05','2026-01-01','2026-01-04'),false);
});
test('history fingerprint rejects stale logs with unchanged total',()=>{
  const goal={historyRevision:'2',today:'2026-01-04',goalSettingsRevision:0,answerRevision:0,sessionAmount:30,unit:'minutes',recordStartDate:'2026-01-01',totalRequired:100,todayStatus:'UNRECORDED',initialProgress:0};
  const logs=[{localDate:'2026-01-01',status:'DONE',amount:30},{localDate:'2026-01-02',status:'SKIPPED',amount:null}];
  const today={today:goal.today,yesterday:'2026-01-03',yesterdayMissing:true,todayLog:null,context:{...goal,historyFingerprint:JSON.stringify(logs.map(l=>[l.localDate,l.status,l.amount]))},prediction:{progress:{done:30,total:100},todayStatus:'UNRECORDED'}};
  assert.equal(isSameSnapshot(goal,today,logs),true);
  assert.equal(isSameSnapshot(goal,today,[{...logs[0],localDate:'2026-01-02'},{...logs[1],localDate:'2026-01-01'}]),false);
  assert.equal(isSameSnapshot({...goal,historyRevision:'3'},today,logs),false);
});

test('timezone change before first record may put record start after today; no future facts are invented',()=>{
  assert.deepEqual(cumulativeSeries([],0,'2026-11-02','2026-11-01'),[]);
  assert.equal(editableDate('2026-11-01','2026-11-02','2026-11-01'),false);
});
