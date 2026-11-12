import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRecord, parseCounts, countProblems } from '../../.github/scripts/ci-report.mjs';
import { digest, finish, nextTask, reserve, transaction } from './state.mjs';

export const image = 'node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54';
export const candidatePath = 'experiments/development-harness-fixture/answer.mjs';
export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const limit = 1024 * 1024;
const cleanEnv = () => Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'DOCKER_HOST', 'DOCKER_CONTEXT']
  .filter(k => process.env[k]).map(k => [k, process.env[k]]));
export function command(bin, args, options = {}) {
  return execFileSync(bin, args, { cwd: root, env: cleanEnv(), encoding: 'utf8', timeout: 15000,
    maxBuffer: limit, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options });
}
const git = (args, options) => command('git', args, options).trim();

export function validateProposal(p) {
  if (!p || Object.keys(p).join() !== 'files' || Object.keys(p.files ?? {}).join() !== candidatePath ||
      typeof p.files[candidatePath] !== 'string' || Buffer.byteLength(p.files[candidatePath]) > 16384 ||
      p.files[candidatePath].includes('\0')) { throw new Error('forbidden-proposal'); }
  return p;
}

export function timeRemaining(deadline, now = Date.now()) {
  if (deadline <= now) { throw new Error('attempt-time-budget'); }
  return Math.min(15000, deadline - now);
}

export function containerState(name, deadline = Date.now() + 15000) {
  // Failure (including daemon outage and absent container) is UNKNOWN, never proof of exit.
  const data = JSON.parse(command('docker', ['inspect', name], { timeout: timeRemaining(deadline) }))[0];
  if (data.Name !== '/' + name || data.Config.Labels?.['future-roi-harness'] !== name) { throw new Error('container-identity'); }
  return data.State;
}

export function stopAndConfirm(name, deadline = Date.now() + 15000) {
  const before = containerState(name, deadline);
  if (before.Running) { command('docker', ['stop', '--time', '1', name], { timeout: timeRemaining(deadline) }); }
  const after = containerState(name, deadline);
  if (after.Running || !['exited', 'created'].includes(after.Status)) { throw new Error('stop-unconfirmed'); }
  return after;
}

export function recover(directory, id) {
  const active = transaction(directory, s => s.tasks[id]?.active);
  if (!active) { throw new Error('no-active-worker'); }
  stopAndConfirm(active.container);
  transaction(directory, s => finish(s, id, { container: active.container, stopped: true, passed: false,
    diagnostic: 'recovered-interruption', head: null }));
}

const worker = `import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
mkdirSync('/work/experiments/development-harness-fixture',{recursive:true});
writeFileSync('/work/${candidatePath}',readFileSync('/baseline/answer.mjs'));
const p=JSON.parse(readFileSync('/input/proposal.json','utf8'));
writeFileSync('/work/${candidatePath}',p.files['${candidatePath}']);
setTimeout(()=>{},Number(process.argv[2]));`;

// Run these operations in the same principal/mounts as candidate code. The host checks the
// result and its own canary. A natural-language prohibition or writable copied test is insufficient.
const probe = `const fs=require('node:fs');let denied=0;
for(const f of ['/policy/worker.mjs','/policy/ci-report.mjs','/policy/result-canary','/results/result.json']){
try{fs.writeFileSync(f,'bad')}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}
}
try{fs.renameSync('/policy/worker.mjs','/policy/renamed')}catch(e){if(['EROFS','EACCES','EPERM','EXDEV'].includes(e.code))denied++}
try{fs.symlinkSync('/policy/result-canary','/work/link');fs.writeFileSync('/work/link','bad')}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}
const absent=['/var/run/docker.sock','/root/.codex/auth.json','/root/.config/gh/hosts.yml','/work/.git','/host-results/ledger.json'];
const secrets=Object.keys(process.env).filter(k=>/TOKEN|SECRET|API_KEY|CANARY/.test(k));
console.log(JSON.stringify({denied,absent:absent.every(f=>!fs.existsSync(f)),secrets:secrets.length}));`;

export function runOne(directory, batchId, proposal) {
  validateProposal(proposal);
  directory = resolve(directory);
  if (directory.includes(',')) { throw new Error('unsupported-mount-path'); }
  const selected = transaction(directory, s => nextTask(s, batchId));
  if (!selected.id) { return selected; }
  const id = selected.id;
  const name = 'roi-harness-' + randomUUID();
  const base = git(['rev-parse', 'HEAD']);
  // Read committed baseline code only; never mount checkout/.git/HOME/socket into the worker.
  const baseline = git(['show', `${base}:${candidatePath}`]) + '\n';
  // Known prerequisites fail before reservation. Uncertain create results still occupy a slot.
  command('docker', ['info', '--format', '{{.ServerVersion}}']);
  // Docker may store a tag pull only as repository@digest, without the tag@digest alias.
  command('docker', ['image', 'inspect', 'node@' + image.split('@')[1]]);
  const attempt = transaction(directory, s => {
    reserve(s, id, name);
    return { number: s.tasks[id].attempts, ms: s.batches[batchId].contract.attemptMs, startedAt: s.tasks[id].active.startedAt };
  });
  const folder = join(directory, id, String(attempt.number));
  const policy = join(folder, 'policy');
  const input = join(folder, 'input');
  const snapshot = join(folder, 'baseline');
  const results = join(folder, 'results');
  for (const d of [policy, input, snapshot, results]) { mkdirSync(d, { recursive: true }); }
  writeFileSync(join(results, 'result.json'), JSON.stringify({ state: 'not-run' }));
  writeFileSync(join(snapshot, 'answer.mjs'), baseline);
  writeFileSync(join(input, 'proposal.json'), JSON.stringify(proposal));
  writeFileSync(join(input, 'answer.mjs'), proposal.files[candidatePath]);
  writeFileSync(join(policy, 'worker.mjs'), worker);
  writeFileSync(join(policy, 'result-canary'), 'host-owned');
  // Reuse the committed existing checks; candidate cannot replace their code or result record.
  for (const file of ['ci-report.mjs', 'ci-report.test.mjs']) {
    writeFileSync(join(policy, file), command('git', ['show', `${base}:.github/scripts/${file}`]));
  }
  const started = attempt.startedAt;
  const deadline = started + attempt.ms;
  let diagnostic = 'runtime-or-verification-failure';
  let passed = false;
  let head = null;
  let record = null;
  let isolation = null;
  let created = false;
  const remaining = () => timeRemaining(deadline - 15000);
  const exec = args => command('docker', ['exec', name, ...args], { timeout: remaining() });
  try {
    command('docker', ['create', '--name', name, '--label', `future-roi-harness=${name}`, '--pull', 'never',
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--user', '1000:1000', '--pids-limit', '64', '--memory', '256m', '--cpus', '1',
      '--tmpfs', '/work:rw,nosuid,nodev,size=16m,uid=1000,gid=1000',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=32m,uid=1000,gid=1000',
      '--mount', `type=bind,src=${policy},dst=/policy,readonly`,
      '--mount', `type=bind,src=${input},dst=/input,readonly`,
      '--mount', `type=bind,src=${snapshot},dst=/baseline,readonly`,
      '--mount', `type=bind,src=${results},dst=/results,readonly`,
      '--workdir', '/work', image, 'node', '/policy/worker.mjs', String(attempt.ms - 15000)], { timeout: remaining() });
    created = true;
    command('docker', ['start', name], { timeout: remaining() });
    isolation = JSON.parse(exec(['node', '-e', probe]));
    if (isolation.denied !== 6 || !isolation.absent || isolation.secrets !== 0 ||
        readFileSync(join(policy, 'result-canary'), 'utf8') !== 'host-owned') { throw new Error('isolation-failed'); }
    // Run immutable baseline regressions BEFORE any candidate process can leave descendants.
    const output = exec(['node', '--test', '/policy/ci-report.test.mjs']);
    const counts = parseCounts(output);
    if (countProblems(counts, false, true).length) { throw new Error('existing-check-incomplete'); }
    record = safeRecord({ layer: 'diagnostic-tests', checkoutSha: base, sourceSha: base, exitCode: 0,
      status: 'passed', durationMs: Date.now() - started, counts, scope: 'node-tests', diagnostic: 'none' });
    // Execute the applied source through an immutable input mount. Candidate output is data,
    // checked outside its process; fake TAP/exit 0 cannot replace the behavior assertion.
    const cases = [[0, 0], [1, 2], [-5, 9], [1024, 4096], [2147483647, 1]];
    const observed = JSON.parse(exec(['node', '/input/answer.mjs', JSON.stringify(cases)]));
    if (JSON.stringify(observed) !== JSON.stringify(cases.map(([a, b]) => a + b))) { throw new Error('behavior-failed'); }
    const exported = proposal.files[candidatePath];
    stopAndConfirm(name, deadline);
    // Candidate termination is confirmed before trusted Git object construction / artifact writes.
    if (transaction(directory, s => s.tasks[id].cancelRequested || s.tasks[id].active?.container !== name)) { throw new Error('cancelled'); }
    const index = join(folder, 'index');
    const env = { ...cleanEnv(), GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'Future ROI fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Future ROI fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
    const boundedGit = (args, options = {}) => git(args, { ...options, env, timeout: timeRemaining(deadline) });
    const blob = boundedGit(['hash-object', '-w', '--stdin'], { input: exported });
    boundedGit(['read-tree', base]);
    boundedGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${candidatePath}`]);
    const tree = boundedGit(['write-tree']);
    head = boundedGit(['commit-tree', tree, '-p', base, '-m', 'test: 隔離fixtureの整数加算を修正する']);
    writeFileSync(join(folder, 'candidate.patch'), command('git', ['diff', '--binary', base, head], { timeout: timeRemaining(deadline) }));
    writeFileSync(join(folder, 'draft-pr.md'), `## 何を変えたか\n\n整数加算fixtureを修正したローカル比較成果物。実Issueの完了ではありません。\n\n## 検証\n\n- 外側の整数出力照合、隔離書込み拒否、既存ci-report回帰: 成功\n- baseline/checkout: ${base}\n- candidate commit: ${head}\n- PR後CI: 未実行。Draft未発行。レビュー可能ではありません。\n- 総費用・人の時間: 未計測。新規モデル/API呼出しなし。\n\n## 関連Issue\n\nRefs #340（ハーネス実装PRとは別の実証用成果物）\n`);
    timeRemaining(deadline);
    diagnostic = 'none';
    passed = true;
  } catch (error) {
    // Persist only fixed diagnostic codes, never candidate stdout, exception strings or env values.
    if (['isolation-failed', 'behavior-failed', 'candidate-mutated', 'existing-check-incomplete', 'attempt-time-budget', 'cancelled'].includes(error.message)) {
      diagnostic = error.message;
    }
  }
  let stopped = false;
  if (created) {
    try { stopAndConfirm(name, deadline); stopped = true; } catch { /* Occupy the slot until explicit recovery. */ }
  }
  const receipt = { container: name, stopped, passed: passed && stopped, diagnostic, head,
    baselineSha: base, candidateDigest: digest(proposal), isolation, existingCheck: record,
    image, externalCI: 'not-run', totalCostCents: null, incrementalBillableCalls: 0 };
  writeFileSync(join(results, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (stopped) { transaction(directory, s => {
    if (s.tasks[id].active?.container === name) { finish(s, id, receipt); }
  }); }
  return { id, state: stopped ? transaction(directory, s => s.tasks[id].state) : 'stop-unconfirmed', folder };
}
