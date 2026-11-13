import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codeFiles, codeProfile, validateCode, validateCodeDiff, recordCodeReview } from './code-profile.mjs';
import { validateContract, emptyLedger, enroll, reserve, finish, nextTask, authorizeRepair, initialize, transaction } from './state.mjs';
import { publishDraft, historicalBaselinePR } from './github.mjs';
import { collectScreenshots } from './code-runtime.mjs';
const head='a'.repeat(40);
test('screenshot export has fixed paths and rejects forged success, malformed data and unbounded output',()=>{
  const dir=mkdtempSync(join(tmpdir(),'roi-png-'));
  try{
    for(const output of ['PASS','../auth.json',Buffer.from('not a PNG').toString('base64'),Buffer.alloc(500001).toString('base64')])assert.throws(()=>collectScreenshots(()=>output,dir),/invalid-screenshot/);
    const png=Buffer.from('89504e470d0a1a0a','hex').toString('base64');let reads=0;
    collectScreenshots(args=>{assert.match(args[2],reads++===0?/390\.png/:/1440\.png/);return png;},dir);
    assert.equal(reads,2);
  }finally{rmSync(dir,{recursive:true});}
});
test('merged baseline history is not unfinished work, but same-Issue identity and unknown ancestry still block',()=>{
  const spec={issue:253},pr={state:'closed',merged_at:'2026-11-12',merge_commit_sha:head,head:{ref:'fix/244-actual-save-delta'},body:'Refs #253'};
  assert.equal(historicalBaselinePR(pr,spec,head,()=>true),true);
  for(const changed of [{merged_at:null},{state:'open'},{head:{ref:'fix/253-old'}},{body:'<!-- future-roi-harness:issue-253 -->'},{merge_commit_sha:'unknown'}])assert.equal(historicalBaselinePR({...pr,...changed},spec,head,()=>true),false);
  assert.equal(historicalBaselinePR(pr,spec,head,()=>false),false);
  assert.equal(historicalBaselinePR(pr,spec,undefined,()=>true),false);
});
export function contract() {
  const c=JSON.parse(readFileSync(new URL('./issue-331-contract.json',import.meta.url)));
  Object.assign(c,{mode:'codex-issue-code',batchId:'issue-code-253-v1'});
  Object.assign(c.tasks[0],{id:'issue-253',issue:253,profile:codeProfile,branch:'fix/253-harness',allowedFiles:codeFiles,
    operations:['generate-code','verify','push-branch','create-draft','observe-ci'],exclusions:'other-product-changes,ci,harness,policy,auth,tests,dependencies,adoption,issue-close,merge,deploy'});
  return c;
}
test('code profile cannot change Issue, allowed paths, tests, operations or capacity',()=>{
  const c=contract();validateContract(c);
  for(const edit of [x=>x.tasks[0].issue=244,x=>x.tasks[0].allowedFiles=['apps/web/src/auth/client.ts'],x=>x.tasks[0].allowedFiles=[...codeFiles,'apps/web/tests/goal-feedback.test.mjs'],x=>x.reviewLimit=2,x=>x.tasks[0].operations.push('merge')]){
    const bad=structuredClone(c);edit(bad);assert.throws(()=>validateContract(bad));
  }
  const files=Object.fromEntries(codeFiles.map(p=>[p,'source\n']));assert.deepEqual(validateCode({files}),files);
  assert.throws(()=>validateCode({files:{...files,'package.json':'{}'}}),/forbidden-proposal/);
  assert.throws(()=>validateCode({files:{...files,[codeFiles[0]]:'PASS'}}),/forbidden-proposal/);
});
test('publisher raw diff rejects additions, symlinks, executable mode, missing or extra files',()=>{
  const lines=codeFiles.map(p=>`:100644 100644 ${'b'.repeat(40)} ${head} M\t${p}`);validateCodeDiff(lines);
  for(const bad of [lines.slice(0,1),[...lines,lines[0]],lines.map(l=>l.replace('100644 100644','000000 100644').replace(' M\t',' A\t')),lines.map(l=>l.replace('100644 100644','100644 120000')),lines.map(l=>l.replace('100644 100644','100644 100755'))])assert.throws(()=>validateCodeDiff(bad),/candidate-diff/);
});
test('code shares global capacity and cumulative budgets; review is bound to the generated head',()=>{
  const s=emptyLedger(),c=contract();enroll(s,c);reserve(s,'issue-253','c');finish(s,'issue-253',{container:'c',stopped:true,passed:true,head});
  assert.throws(()=>recordCodeReview(s,'issue-253',{head:'b'.repeat(40),blocking:0,reference:'old'}));
  assert.throws(()=>recordCodeReview(s,'issue-253',{head,blocking:1,reference:'blocking'}));
  recordCodeReview(s,'issue-253',{head,blocking:0,reference:'independent-review'});
  const before=s.tasks['issue-253'].reservedMs;
  authorizeRepair(s,'issue-253',{head,kind:'required-review-change',reference:'mandatory'});reserve(s,'issue-253','repair');
  assert.ok(s.tasks['issue-253'].reservedMs>before);assert.throws(()=>recordCodeReview(s,'issue-253',{head,blocking:0,reference:'during-run'}));
  assert.throws(()=>enroll(s,{...c,batchId:'reset-attempts'}),/existing-task/);
  assert.equal(nextTask(s,c.batchId).reason,'worker-stop-unconfirmed');
});
test('code cannot publish before independent review and cannot reuse review of an older head',()=>{
  const dir=mkdtempSync(join(tmpdir(),'roi-code-review-'));
  try{
    initialize(dir);transaction(dir,s=>{enroll(s,contract());reserve(s,'issue-253','c');finish(s,'issue-253',{container:'c',stopped:true,passed:true,head});});
    const before=readFileSync(join(dir,'ledger.json'),'utf8');assert.throws(()=>publishDraft(dir,'issue-253'),/code-review/);assert.equal(readFileSync(join(dir,'ledger.json'),'utf8'),before);
    transaction(dir,s=>{recordCodeReview(s,'issue-253',{head,blocking:0,reference:'review'});s.tasks['issue-253'].head='b'.repeat(40);});
    assert.throws(()=>publishDraft(dir,'issue-253'),/code-review/);
  }finally{rmSync(dir,{recursive:true});}
});
