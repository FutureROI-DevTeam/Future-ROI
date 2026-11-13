import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { command, stopAndConfirm } from './runtime.mjs';
import { transaction, nextTask, reserve, finish, digest } from './state.mjs';
import { generateProposal, processIdentity } from './codex-worker.mjs';
import { api, pages, observeWork, verifyCandidate, accounted } from './github.mjs';
import { codeFiles, isCode, validateCode } from './code-profile.mjs';
import { parseCounts, countProblems } from '../../.github/scripts/ci-report.mjs';

export const codeProbe = `const fs=require('node:fs');let denied=0;
const paths=['/policy/code-browser-check.mjs','/policy/ci-report.test.mjs','/results/result.json','/workspace/node_modules/react/package.json','/workspace/apps/web/tests/goal-feedback.test.mjs'];
for(const p of paths){try{fs.writeFileSync(p,'bad')}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}}
try{fs.renameSync(paths[0],'/tmp/stolen')}catch(e){if(['EROFS','EACCES','EPERM','EXDEV'].includes(e.code))denied++}
try{fs.symlinkSync(paths[0],'/tmp/policy-link');fs.writeFileSync('/tmp/policy-link','bad')}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}
console.log(JSON.stringify({denied,secretFree:!Object.keys(process.env).some(k=>/TOKEN|SECRET|API_KEY/.test(k)),outsideAbsent:!fs.existsSync('/root/.codex/auth.json')&&!fs.existsSync('/var/run/docker.sock')&&!fs.existsSync('/workspace/.git')}));`;

export function prepareCodePolicy(folder, base) {
  for (const part of ['candidate','policy','results']) mkdirSync(join(folder, part), { recursive: true });
  writeFileSync(join(folder, 'results/result.json'), '{"status":"not-run"}\n');
  copyFileSync(new URL('./code-browser-check.mjs', import.meta.url), join(folder, 'policy/code-browser-check.mjs'));
  for (const file of ['ci-report.mjs','ci-report.test.mjs']) writeFileSync(join(folder, 'policy', file), command('git', ['show', `${base}:.github/scripts/${file}`]));
}
export function codeContainerArgs(name, folder, image, deadline, candidate = true) {
  return ['create','--name',name,'--label',`future-roi-harness=${name}`,'--network','none','--read-only','--user','1000:1000',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','2g','--cpus','2',
    '--tmpfs','/tmp:rw,nosuid,size=512m,mode=1777','--shm-size','128m',
    '--mount',`type=bind,source=${join(folder,'policy')},target=/policy,readonly`,
    '--mount',`type=bind,source=${join(folder,'results')},target=/results,readonly`,
    ...(candidate ? codeFiles.flatMap((path, i) => ['--mount',`type=bind,source=${join(folder,'candidate',String(i))},target=/workspace/${path},readonly`]) : []),
    '--workdir','/workspace',image,'node','-e',`setTimeout(()=>{},${Math.max(1,deadline-Date.now()-15000)})`];
}
export function checkCodeContainer(inside, folder) {
  const isolation = JSON.parse(inside(['node','-e',codeProbe]));
  if (isolation.denied !== 7 || !isolation.secretFree || !isolation.outsideAbsent) throw new Error('isolation-failed');
  const checks = [];
  for (const [layer, args] of [
    ['ci-report', ['node','--test','/policy/ci-report.test.mjs']],
    ['points-browser', ['node','--test','/policy/code-browser-check.mjs']],
    ['save-and-preview', ['node','--import','./apps/web/tests/register-contracts.mjs','--test','apps/web/tests/goal-feedback.test.mjs']],
    ['existing-browser', ['node','--test','apps/web/tests/goal-feedback.browser-check.mjs']],
    ['typecheck', ['npm','run','typecheck','--workspace=@futureroi/web']],
    ['build', ['npm','run','build','--workspace=@futureroi/web','--','--configLoader','native','--outDir','/tmp/web-build']],
  ]) {
    let output;
    try { output = inside(args); } catch (error) {
      writeFileSync(join(folder, `${layer}.log`), String(error.stdout ?? '') + String(error.stderr ?? ''));
      throw new Error(`${layer}-failed`);
    }
    writeFileSync(join(folder, `${layer}.log`), output);
    const counts = args.includes('--test') ? parseCounts(output) : null;
    if (counts && countProblems(counts, false, true).length) throw new Error('existing-check-incomplete');
    checks.push({ layer, passed: true, counts });
  }
  return { isolation, checks };
}

export async function runCode(directory, batchId) {
  directory = resolve(directory); if (directory.includes(',')) throw new Error('unsupported-mount-path');
  const selected = transaction(directory, s => nextTask(s,batchId)); if (!selected.id) return selected;
  const id = selected.id, contract = transaction(directory,s=>s.batches[batchId].contract), spec = contract.tasks.find(t=>t.id===id);
  if (!isCode(contract)) throw new Error('worker-mode-mismatch');
  const task = transaction(directory,s=>s.tasks[id]);
  const {issue,main,comments} = accounted(directory,id,30000,()=>{
    observeWork(spec,task,api,contract.baseSha);
    return {issue:api(`repos/${contract.repository}/issues/${spec.issue}`),main:api(`repos/${contract.repository}/branches/main`),comments:pages(`issues/${spec.issue}/comments`).map(c=>({body:c.body}))};
  });
  if (issue.state!=='open'||issue.pull_request) throw new Error('issue-not-open');
  if (main.commit.sha!==contract.baseSha||!main.protected) throw new Error('baseline-or-protection-changed');
  const image=JSON.parse(command('docker',['image','inspect',contract.validatorImage]))[0];
  if (image.Id!==contract.validatorImage||image.Config.Labels?.['future-roi-baseline']!==contract.baseSha) throw new Error('validator-image-changed');
  const sources=Object.fromEntries(spec.contextFiles.map(p=>[p,command('git',['show',`${contract.baseSha}:${p}`])]));
  if(Buffer.byteLength(JSON.stringify(sources))>100000) throw new Error('context-budget');
  const name='roi-harness-'+randomUUID();
  const attempt=transaction(directory,s=>{reserve(s,id,name);s.tasks[id].active.owner=processIdentity(process.pid);s.tasks[id].active.phase='model-preflight';return {number:s.tasks[id].attempts,startedAt:s.tasks[id].active.startedAt};});
  const deadline=attempt.startedAt+contract.attemptMs,folder=join(directory,id,String(attempt.number));
  prepareCodePolicy(folder,contract.baseSha);
  const policyDigest=digest(readFileSync(join(folder,'policy/code-browser-check.mjs'),'utf8'));
  let creationAttempted=false,created=false,stopped=false,passed=false,head=null,model=null,verification=null,diagnostic='code-verification-failed';
  const run=(bin,args,options={})=>{const remaining=deadline-Date.now()-15000;if(remaining<=0)throw new Error('attempt-time-budget');return command(bin,args,{...options,timeout:Math.min(240000,remaining)});};
  try {
    const generated=await generateProposal({directory,id,folder,deadline,base:contract.baseSha,documentTask:{issue:spec.issue,paths:codeFiles,sources,issueData:{title:issue.title,body:issue.body,comments}}});
    model=generated.modelReceipt; const files=validateCode(generated.proposal);
    writeFileSync(join(folder,'proposal.json'),JSON.stringify(generated.proposal,null,2));
    codeFiles.forEach((p,i)=>writeFileSync(join(folder,'candidate',String(i)),files[p]));
    if(transaction(directory,s=>s.tasks[id].cancelRequested))throw new Error('cancelled');
    transaction(directory,s=>{s.tasks[id].active.phase='container-creating';}); creationAttempted=true;
    run('docker',codeContainerArgs(name,folder,contract.validatorImage,deadline));created=true;run('docker',['start',name]);
    transaction(directory,s=>{s.tasks[id].active.phase='container-running';});
    verification=checkCodeContainer(args=>run('docker',['exec',name,...args]),folder);
    run('docker',['cp',`${name}:/tmp/points-evidence`,join(folder,'results/screenshots')]);
    stopAndConfirm(name,deadline);stopped=true;
    if(transaction(directory,s=>s.tasks[id].cancelRequested||s.tasks[id].active?.container!==name))throw new Error('cancelled');
    const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,GIT_INDEX_FILE:join(folder,'index'),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_AUTHOR_NAME:'Future ROI Codex worker',GIT_AUTHOR_EMAIL:'worker@example.invalid',GIT_COMMITTER_NAME:'Future ROI Codex worker',GIT_COMMITTER_EMAIL:'worker@example.invalid'};
    const git=(args,options={})=>run('git',args,{env,...options}).trim();git(['read-tree',contract.baseSha]);
    for(const p of codeFiles){const blob=git(['hash-object','-w','--stdin'],{input:files[p]});git(['update-index','--cacheinfo',`100644,${blob},${p}`]);}
    head=git(['commit-tree',git(['write-tree']),'-p',task.head??contract.baseSha,'-m',`fix: #${spec.issue} の増減表示で整数部の桁落ちを防ぐ`]);verifyCandidate(contract,spec,head);
    writeFileSync(join(folder,'candidate.patch'),run('git',['diff','--binary',contract.baseSha,head]));
    writeFileSync(join(folder,'draft-pr.md'),`${spec.purpose}\n\nRefs #${spec.issue}\n\n基準 ${contract.baseSha}\n候補 ${head}\n\n隔離実Chromium・既存保存/試算・型/build検証済み。独立レビュー・PR後CIは未確認。残り4項目・Issue全体のClose・merge・配備は対象外。\n`);
    passed=true;diagnostic='none';
  } catch(error) { if(/^[a-z][a-z-]+$/.test(error.message))diagnostic=error.message; }
  if(created&&!stopped){try{stopAndConfirm(name,deadline);stopped=true;}catch{/* Unknown still occupies the slot. */}}
  if(!creationAttempted){const active=transaction(directory,s=>s.tasks[id].active);stopped=!active?.authHome&&['model-stopped','model-preflight'].includes(active?.phase);}
  const receipt={container:name,stopped,passed:passed&&stopped,head,diagnostic,baselineSha:contract.baseSha,controllerSha:command('git',['rev-parse','HEAD']).trim(),validatorImage:contract.validatorImage,policyDigest,model,verification,externalCI:'not-run',totalCostCents:null};
  writeFileSync(join(folder,'results/result.json'),JSON.stringify(receipt,null,2)+'\n');
  if(stopped)transaction(directory,s=>finish(s,id,receipt));
  return {id,state:transaction(directory,s=>s.tasks[id].active?'stop-unconfirmed':s.tasks[id].state),folder};
}
