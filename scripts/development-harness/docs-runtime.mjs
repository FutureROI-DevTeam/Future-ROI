import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { command, stopAndConfirm, timeRemaining } from './runtime.mjs';
import { transaction, nextTask, reserve, finish, digest } from './state.mjs';
import { generateProposal, processIdentity } from './codex-worker.mjs';
import { api, pages, observeWork, verifyCandidate, accounted } from './github.mjs';
import { safeRecord, parseCounts, countProblems } from '../../.github/scripts/ci-report.mjs';

export function validateDocument(proposal, spec) {
  const path = spec.allowedFiles[0], text = proposal?.files?.[path];
  if (Object.keys(proposal ?? {}).join() !== 'files' || Object.keys(proposal.files ?? {}).join() !== path ||
      typeof text !== 'string' || text.length < 200 || Buffer.byteLength(text) > 24576 || text.includes('\0') || !text.endsWith('\n')) { throw new Error('forbidden-proposal'); }
  return text;
}
const probe = `const fs=require('node:fs');let denied=0;
for(const p of ['/snapshot/scripts/check-foundation.ps1','/snapshot/.github/scripts/ci-report.mjs','/policy/canary','/results/result.json']){
try{fs.writeFileSync(p,'bad')}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}}
try{fs.symlinkSync('/policy/canary','/tmp/link');fs.writeFileSync('/tmp/link','bad')}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}
console.log(JSON.stringify({denied,secretFree:!Object.keys(process.env).some(k=>/TOKEN|SECRET|API_KEY/.test(k)),outsideAbsent:!fs.existsSync('/host/canary.md')&&!fs.existsSync('/root/.codex/auth.json')&&!fs.existsSync('/var/run/docker.sock')}));`;

export async function runDocument(directory, batchId) {
  directory = resolve(directory);
  if (directory.includes(',')) { throw new Error('unsupported-mount-path'); }
  const selected = transaction(directory, s => nextTask(s, batchId));
  if (!selected.id) { return selected; }
  const id = selected.id;
  const contract = transaction(directory, s => s.batches[batchId].contract), spec = contract.tasks.find(t => t.id === id);
  if (contract.mode !== 'codex-issue-docs') { throw new Error('worker-mode-mismatch'); }
  const task = transaction(directory, s => s.tasks[id]);
  const { issue, main, comments } = accounted(directory, id, 30000, () => {
    observeWork(spec, task); // Existing branches/PRs are reconciled before model spend.
    return { issue: api(`repos/${contract.repository}/issues/${spec.issue}`), main: api(`repos/${contract.repository}/branches/main`),
      comments: pages(`issues/${spec.issue}/comments`).map(c => ({ author: c.user.login, createdAt: c.created_at, body: c.body })) };
  });
  if (issue.state !== 'open' || issue.pull_request) { throw new Error('issue-not-open'); }
  if (main.commit.sha !== contract.baseSha || !main.protected) { throw new Error('baseline-or-protection-changed'); }
  const image = JSON.parse(command('docker', ['image', 'inspect', contract.validatorImage]))[0];
  if (image.Id !== contract.validatorImage) { throw new Error('validator-image-changed'); }
  const base = contract.baseSha;
  const tracked = command('git', ['ls-tree', '-r', '--name-only', base]).trim().split(/\r?\n/);
  if (tracked.includes(spec.allowedFiles[0]) || spec.contextFiles.some(p => !tracked.includes(p))) { throw new Error('new-file-or-context-required'); }
  const sources = Object.fromEntries(spec.contextFiles.map(p => {
    const text = command('git', ['show', `${base}:${p}`]);
    if (!p.endsWith('package-lock.json')) { return [p, text]; }
    const lock = JSON.parse(text), packages = Object.fromEntries(Object.entries(lock.packages ?? {}).filter(([key]) =>
      /(?:^|node_modules\/)(?:better-auth|seroval|react|react-dom|vite|typescript|@tanstack\/react-router)$/.test(key)).map(([key, value]) => [key, value.version]));
    return [p, { sha256: digest(text), extractedVersions: packages, extraction: 'version fields for named dependencies only; not full lockfile' }];
  }));
  if (Buffer.byteLength(JSON.stringify(sources)) > 100000) { throw new Error('context-budget'); }
  const name = 'roi-harness-' + randomUUID();
  const attempt = transaction(directory, s => {
    reserve(s, id, name); s.tasks[id].active.owner = processIdentity(process.pid); s.tasks[id].active.phase = 'model-preflight';
    return { number: s.tasks[id].attempts, startedAt: s.tasks[id].active.startedAt };
  });
  const deadline = attempt.startedAt + contract.attemptMs, folder = join(directory, id, String(attempt.number));
  const snapshot = join(folder, 'snapshot'), policy = join(folder, 'policy'), results = join(folder, 'results');
  for (const path of [snapshot, policy, results]) { mkdirSync(path, { recursive: true }); }
  writeFileSync(join(results, 'result.json'), '{"status":"not-run"}\n');
  writeFileSync(join(policy, 'canary'), 'host-owned');
  writeFileSync(join(policy, 'gitconfig'), '[safe]\n\tdirectory = /snapshot\n');
  let creationAttempted = false, created = false, stopped = false, passed = false, head = null, isolation = null, model = null, record = null, snapshotGitHead = null, diagnostic = 'document-verification-failed', stage = 'model';
  const run = (bin, args, options = {}) => {
    timeRemaining(deadline - 15000);
    return command(bin, args, { ...options, timeout: Math.min(180000, deadline - Date.now() - 15000) });
  };
  try {
    const generated = await generateProposal({ directory, id, folder, deadline, base, documentTask: { issue: spec.issue,
      path: spec.allowedFiles[0], sources, issueData: { title: issue.title, body: issue.body, comments } } });
    model = generated.modelReceipt;
    const text = validateDocument(generated.proposal, spec);
    writeFileSync(join(folder, 'proposal.json'), JSON.stringify(generated.proposal, null, 2));
    run('git', ['archive', '--format=tar', '--output', join(folder, 'baseline.tar'), base]);
    run('tar', ['-xf', join(folder, 'baseline.tar'), '-C', snapshot]);
    // Synthetic Git metadata contains only the public baseline, never the host .git/config.
    run('git', ['init', '--template=', snapshot]);
    run('git', ['-C', snapshot, '-c', 'core.autocrlf=false', 'add', '--all']);
    run('git', ['-C', snapshot, '-c', 'user.name=Harness', '-c', 'user.email=harness@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'baseline']);
    snapshotGitHead = run('git', ['-C', snapshot, 'rev-parse', 'HEAD']).trim();
    mkdirSync(join(snapshot, 'docs/changes'), { recursive: true });
    writeFileSync(join(snapshot, spec.allowedFiles[0]), text);
    if (transaction(directory, s => s.tasks[id].cancelRequested)) { throw new Error('cancelled'); }
    transaction(directory, s => { s.tasks[id].active.phase = 'container-creating'; });
    creationAttempted = true;
    run('docker', ['create', '--name', name, '--label', `future-roi-harness=${name}`, '--network', 'none', '--read-only', '--user', '1000:1000',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '768m', '--cpus', '1',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,mode=1777', '--mount', `type=bind,source=${snapshot},target=/snapshot,readonly`,
      '--mount', `type=bind,source=${policy},target=/policy,readonly`, '--mount', `type=bind,source=${results},target=/results,readonly`,
      '--env', 'GIT_CONFIG_GLOBAL=/policy/gitconfig', '--workdir', '/snapshot', contract.validatorImage,
      'node', '-e', `setTimeout(()=>{},${Math.max(1, deadline - Date.now() - 15000)})`]);
    created = true; run('docker', ['start', name]);
    transaction(directory, s => { s.tasks[id].active.phase = 'container-running'; });
    const inside = args => run('docker', ['exec', name, ...args]);
    isolation = JSON.parse(inside(['node', '-e', probe]));
    if (isolation.denied !== 5 || !isolation.secretFree || !isolation.outsideAbsent || readFileSync(join(policy, 'canary'), 'utf8') !== 'host-owned') { throw new Error('isolation-failed'); }
    const output = inside(['node', '--test', '/snapshot/.github/scripts/ci-report.test.mjs']);
    const counts = parseCounts(output);
    if (countProblems(counts, false, true).length) { throw new Error('existing-check-incomplete'); }
    stage = 'foundation';
    inside(['pwsh', '-NoProfile', '-File', '/snapshot/scripts/check-foundation.ps1']);
    record = safeRecord({ layer: 'foundation', sourceSha: base, checkoutSha: snapshotGitHead, exitCode: 0, status: 'passed', durationMs: Date.now() - attempt.startedAt, counts, scope: 'node-tests', diagnostic: 'none' });
    stopAndConfirm(name, deadline); stopped = true;
    if (transaction(directory, s => s.tasks[id].cancelRequested || s.tasks[id].active?.container !== name)) { throw new Error('cancelled'); }
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_INDEX_FILE: join(folder, 'index'),
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(policy, 'gitconfig'), GIT_AUTHOR_NAME: 'Future ROI Codex worker', GIT_AUTHOR_EMAIL: 'worker@example.invalid',
      GIT_COMMITTER_NAME: 'Future ROI Codex worker', GIT_COMMITTER_EMAIL: 'worker@example.invalid' };
    const git = (args, options = {}) => run('git', args, { env, ...options }).trim();
    const blob = git(['hash-object', '-w', '--stdin'], { input: text });
    git(['read-tree', base]); git(['update-index', '--add', '--cacheinfo', `100644,${blob},${spec.allowedFiles[0]}`]);
    const tree = git(['write-tree']);
    head = git(['commit-tree', tree, '-p', task.head ?? base, '-m', `docs: #${spec.issue} の依存と履歴の比較資料を追加する`]);
    verifyCandidate(contract, spec, head);
    writeFileSync(join(folder, 'candidate.patch'), run('git', ['diff', '--binary', base, head]));
    writeFileSync(join(folder, 'draft-pr.md'), `# #${spec.issue} の比較資料\n\n${spec.purpose}\n\nRefs #${spec.issue}\n\n基準main: ${base}\n候補head: ${head}\n\n隔離Foundation/ci-report回帰・書込み拒否確認済み。外部PR/CIは未実行。採択・Issue完了・費用削減は未確認。\n`);
    passed = true; diagnostic = 'none';
  } catch (error) {
    if (error.code === 'ETIMEDOUT') { diagnostic = `${stage}-timeout`; }
    if (/^[a-z][a-z-]+$/.test(error.message)) { diagnostic = error.message; }
  }
  if (created && !stopped) { try { stopAndConfirm(name, deadline); stopped = true; } catch { /* Unknown worker occupies capacity. */ } }
  if (!creationAttempted) {
    const active = transaction(directory, s => s.tasks[id].active);
    stopped = !active?.authHome && ['model-stopped', 'model-preflight'].includes(active?.phase);
  }
  const receipt = { container: name, stopped, passed: passed && stopped, head, diagnostic, baselineSha: base, snapshotGitHead,
    snapshotContent: 'fixed-main-with-exact-untracked-document',
    controllerSha: command('git', ['rev-parse', 'HEAD']).trim(), isolation, model, existingCheck: record, validatorImage: contract.validatorImage,
    externalCI: 'not-run', totalCostCents: null };
  writeFileSync(join(results, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (stopped) { transaction(directory, s => finish(s, id, receipt)); }
  return { id, state: transaction(directory, s => s.tasks[id].active ? 'stop-unconfirmed' : s.tasks[id].state), folder };
}
