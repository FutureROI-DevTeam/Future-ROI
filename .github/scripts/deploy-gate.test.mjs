import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REQUIRED_JOBS, checkDeployment, classifySchema, decideGate, evaluateCurrentMain, parseSchemaReport, switchBlocks } from './deploy-gate.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
let nextId = 1;
const run = (name, overrides = {}) => ({ id: nextId++, run_attempt: 1, name, head_sha: A, head_branch: 'main', event: 'push',
  status: 'completed', conclusion: 'success', ...overrides });
const jobsFor = (name, conclusion = 'success') => REQUIRED_JOBS[name].map(job => ({ name: job, conclusion }));
const green = () => {
  const app = run('Application');
  const foundation = run('Foundation');
  return { runs: [app, foundation], jobsByRunId: { [app.id]: jobsFor('Application'), [foundation.id]: jobsFor('Foundation') } };
};
const input = overrides => ({ enabled: true, targetSha: A, mainSha: A, ...green(), ...overrides });

test('同じSHAの必須CIがすべて成功し、mainの先頭のときだけ配備する', () => {
  assert.deepEqual(decideGate(input()), { deploy: true, reason: 'ci-passed' });
});

test('CD無効・mainの先頭でない・不正SHAでは配備しない', () => {
  assert.equal(decideGate(input({ enabled: false })).reason, 'cd-disabled');
  assert.equal(decideGate(input({ mainSha: B })).reason, 'not-main-head');
  assert.equal(decideGate(input({ targetSha: 'main' })).reason, 'invalid-sha');
});

test('片方のCIが未完了・未実行なら待つ', () => {
  const { runs, jobsByRunId } = green();
  assert.equal(decideGate(input({ runs: [runs[0]], jobsByRunId })).reason, 'waiting:Foundation');
  runs[1].status = 'in_progress';
  assert.equal(decideGate(input({ runs, jobsByRunId })).reason, 'waiting:Foundation');
});

test('CIの失敗・job欠落・jobのskipでは配備しない', () => {
  const failed = green();
  failed.runs[0].conclusion = 'failure';
  assert.equal(decideGate(input(failed)).reason, 'ci-failed:Application');
  const missing = green();
  missing.jobsByRunId[missing.runs[0].id] = jobsFor('Application').slice(1);
  assert.match(decideGate(input(missing)).reason, /^job-missing:/);
  const skipped = green();
  skipped.jobsByRunId[skipped.runs[1].id] = jobsFor('Foundation', 'skipped');
  assert.equal(decideGate(input(skipped)).reason, 'job-not-success:Repository checks');
});

test('別SHA・PR・別branchのrunは数えず、同じSHAの最新runの結果を使う', () => {
  const { runs, jobsByRunId } = green();
  const others = [run('Foundation', { head_sha: B }), run('Foundation', { event: 'pull_request' }), run('Foundation', { head_branch: 'x' })];
  assert.equal(decideGate(input({ runs: [runs[0], ...others], jobsByRunId })).reason, 'waiting:Foundation');
  const rerunFailed = run('Application', { conclusion: 'failure' });
  assert.equal(decideGate(input({ runs: [...runs, rerunFailed], jobsByRunId })).reason, 'ci-failed:Application');
});

const report = (status, app, findings) => ({ version: 1, status, findings,
  app: { historyTable: 'present', applied: [], pending: [], checksumMismatch: [], unknownHistory: [], ...app } });

test('schemaは差分なしならok、追加migrationだけ未適用ならpending', () => {
  assert.equal(classifySchema(report('ok', {}, []), 0), 'ok');
  assert.equal(classifySchema(report('drift', { pending: ['0009_x.sql'] }, [{ code: 'pending_migration', target: '0009_x.sql' }]), 1), 'pending');
});

test('空DB・checksum不一致・不明履歴・認証差分・判定不能はstop', () => {
  const pending = [{ code: 'pending_migration', target: '0009_x.sql' }];
  assert.equal(classifySchema(report('drift', { historyTable: 'missing', pending: ['0001.sql'] }, [{ code: 'empty_database' }]), 1), 'stop');
  assert.equal(classifySchema(report('drift', { pending: ['0009_x.sql'], checksumMismatch: ['0001.sql'] }, pending), 1), 'stop');
  assert.equal(classifySchema(report('drift', { pending: ['0009_x.sql'], unknownHistory: ['9999.sql'] }, pending), 1), 'stop');
  assert.equal(classifySchema(report('drift', { pending: ['0009_x.sql'] }, [...pending, { code: 'auth_table_missing', target: 'user' }]), 1), 'stop');
  assert.equal(classifySchema(null, 3), 'stop');
  assert.equal(classifySchema(report('ok', {}, []), 1), 'stop');
});

test('db:checkの出力から結果JSONだけを取り出す', () => {
  const json = JSON.stringify(report('ok', {}, []));
  assert.deepEqual(parseSchemaReport(`> npm banner\n(node) Warning: x\n${json}\nnpm error x`), JSON.parse(json));
  assert.equal(parseSchemaReport('no json'), null);
});

test('deploymentは対象SHA・production・READYのときだけok', () => {
  const ok = { readyState: 'READY', target: 'production', meta: { cdSha: A } };
  assert.equal(checkDeployment(ok, A), 'ok');
  assert.equal(checkDeployment({ ...ok, meta: { cdSha: B } }, A), 'sha-mismatch');
  assert.equal(checkDeployment({ ...ok, target: null }, A), 'not-production:null');
  assert.equal(checkDeployment({ ...ok, readyState: 'ERROR' }, A), 'not-ready:ERROR');
  assert.equal(checkDeployment(null, A), 'missing');
});

test('古いAが待機Bを置換しても、ロック後のgateは最新main BのCIを照合する', async () => {
  const app = run('Application', { head_sha: B });
  const foundation = run('Foundation', { head_sha: B });
  const paths = [];
  const api = async path => {
    paths.push(path);
    if (path === '/git/ref/heads/main') return { object: { sha: B } };
    if (path.startsWith('/actions/workflows/')) return { workflow_runs: [] };
    if (path.startsWith('/actions/runs?')) return { workflow_runs: [app, foundation] };
    return { jobs: jobsFor(path.includes(`/${app.id}/`) ? 'Application' : 'Foundation') };
  };
  // GitHub single-pending queue: X running; B waits; stale A's rerun replaces B.
  let pendingEvent = B;
  pendingEvent = A;
  assert.equal(pendingEvent, A);
  assert.equal(decideGate(input({ targetSha: pendingEvent, mainSha: B })).reason, 'not-main-head'); // old bug
  const result = await evaluateCurrentMain({ enabled: true, api, currentRunId: '10' });
  assert.deepEqual(result, { sha: B, deploy: true, reason: 'ci-passed' });
  assert.ok(paths.includes(`/actions/runs?head_sha=${B}&event=push&branch=main&per_page=100`));
  app.conclusion = 'failure';
  assert.equal((await evaluateCurrentMain({ enabled: true, api })).reason, 'ci-failed:Application');
});

test('失敗・取消された切替は後続CDを止め、gate-only/skipでは解除しない', async () => {
  assert.equal(switchBlocks([]), null);
  assert.equal(switchBlocks([{ name: 'Reconcile production switch', conclusion: 'skipped' }]), null);
  for (const conclusion of ['failure', 'cancelled', 'timed_out', null]) {
    assert.equal(switchBlocks([{ name: 'Reconcile production switch', conclusion }]), true);
  }
  assert.equal(switchBlocks([{ name: 'Reconcile production switch', conclusion: 'success' }]), false);
  const { runs, jobsByRunId } = green();
  const api = async path => {
    if (path === '/git/ref/heads/main') return { object: { sha: A } };
    if (path.startsWith('/actions/workflows/')) return { workflow_runs: [{ id: 100 }, { id: 99, run_attempt: 2 }, { id: 98 }] };
    if (path.startsWith('/actions/runs?')) return { workflow_runs: runs };
    if (path.includes('/100/')) return { jobs: [] };
    if (path.includes('/99/')) return { jobs: [{ name: 'Reconcile production switch',
      conclusion: path.includes('/attempts/1/') ? 'failure' : 'skipped' }] };
    if (path.includes('/98/')) return { jobs: [{ name: 'Reconcile production switch', conclusion: 'success' }] };
    return { jobs: jobsByRunId[Number(path.split('/')[3])] };
  };
  assert.equal((await evaluateCurrentMain({ enabled: true, api, currentRunId: '100' })).reason, 'previous-switch-needs-review');
  assert.equal((await evaluateCurrentMain({ enabled: true, api, currentRunId: '99' })).deploy, true); // operator-approved full retry
  assert.deepEqual(await evaluateCurrentMain({ enabled: false, api: () => { throw new Error('must not call'); } }),
    { deploy: false, reason: 'cd-disabled' });
});

// Exercise the real workflow's trigger filters, workflow-level concurrency and
// gate job condition together. Testing evaluateCurrentMain alone misses a skipped gate.
const workflow = readFileSync(new URL('../workflows/deploy-production.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function workflowEntry(run, id = 100) {
  const values = key => workflow.match(new RegExp(`^    ${key}: \\[([^\\]]+)\\]`, 'm'))[1].split(',').map(v => v.trim());
  if (!values('workflows').includes(run.name) || !values('branches').includes(run.head_branch)
      || !values('types').includes('completed')) return null;
  const github = { repository: 'FutureROI-DevTeam/Future-ROI', run_id: id, event: { workflow_run: run } };
  const expression = text => Function('github', 'format', `return (${text})`)(github,
    (pattern, ...args) => pattern.replace(/\{(\d+)\}/g, (_, index) => args[index]));
  const group = workflow.match(/^  group: (.+)$/m)[1];
  const condition = workflow.match(/\n  gate:[\s\S]*?\n    if: >-\n([\s\S]*?)\n    runs-on:/)[1].trim();
  return { group: group.startsWith('${{') ? expression(group.replace(/^\$\{\{\s*|\s*\}\}$/g, '')) : group,
    gate: expression(condition) };
}

test('workflow_dispatchの完了が待機Bを置換しても、実workflow条件から最新Bのpush CIを照合する', async () => {
  const repo = { full_name: 'FutureROI-DevTeam/Future-ROI' };
  const app = run('Application', { head_sha: B });
  const foundation = run('Foundation', { head_sha: B });
  const paths = [];
  const api = async path => {
    paths.push(path);
    if (path === '/git/ref/heads/main') return { object: { sha: B } };
    if (path.startsWith('/actions/workflows/')) return { workflow_runs: [] };
    if (path.startsWith('/actions/runs?')) return { workflow_runs: [app, foundation] };
    return { jobs: jobsFor(path.includes(`/${app.id}/`) ? 'Application' : 'Foundation') };
  };
  for (const name of ['Application', 'Foundation']) {
    for (const [head_sha, conclusion] of [[A, 'success'], [B, 'failure'], [B, 'cancelled']]) {
      const pending = new Map([['production-deploy', B]]); // X holds the common lock.
      const manual = { ...run(name, { event: 'workflow_dispatch', head_sha, conclusion }), head_repository: repo };
      const entry = workflowEntry(manual);
      pending.set(entry.group, manual.head_sha); // GitHub replaces B with the manual wake-up.
      assert.equal(pending.get('production-deploy'), head_sha);
      assert.equal(entry.gate, true, 'the replacement must reach latest-main reconciliation');
      assert.deepEqual(await evaluateCurrentMain({ enabled: true, api }), { sha: B, deploy: true, reason: 'ci-passed' });
    }
  }
  assert.ok(paths.includes(`/actions/runs?head_sha=${B}&event=push&branch=main&per_page=100`));
});

test('手動CIの成功は起床だけを許し、push CIの未実行・失敗・未完了を代替しない', () => {
  const { runs, jobsByRunId } = green();
  const dispatch = run('Foundation', { event: 'workflow_dispatch' });
  const allJobs = { ...jobsByRunId, [dispatch.id]: jobsFor('Foundation') };
  assert.equal(decideGate(input({ runs: [runs[0], dispatch], jobsByRunId: allJobs })).reason, 'waiting:Foundation');
  runs[1].conclusion = 'failure';
  assert.equal(decideGate(input({ runs: [...runs, dispatch], jobsByRunId: allJobs })).reason, 'ci-failed:Foundation');
  runs[1].status = 'in_progress';
  assert.equal(decideGate(input({ runs: [...runs, dispatch], jobsByRunId: allJobs })).reason, 'waiting:Foundation');
});

test('gateが拒否する別repoイベントはworkflow-level共通待機を置換しない', () => {
  const pending = new Map([['production-deploy', B]]);
  const foreign = { ...run('Application', { event: 'pull_request' }), head_repository: { full_name: 'fork/Future-ROI' } };
  const entry = workflowEntry(foreign, 200);
  assert.equal(entry.gate, false);
  assert.notEqual(entry.group, 'production-deploy');
  pending.set(entry.group, A);
  assert.equal(pending.get('production-deploy'), B);
  assert.notEqual(workflowEntry(foreign, 201).group, entry.group);
  assert.equal(workflowEntry({ ...foreign, head_branch: 'feature' }), null);
  assert.equal(workflowEntry({ ...foreign, name: 'Unrelated workflow' }), null);
});

// 2026-10: run 99 attempt 1 failed its switch; the operator's full retry (attempt 2) found
// production already on main and skipped the switch. Every later gate stayed blocked while
// all runs were green, so merges silently stopped reaching production.
function retryHistory(attempts) {
  const { runs, jobsByRunId } = green();
  return async path => {
    if (path === '/git/ref/heads/main') return { object: { sha: A } };
    if (path.startsWith('/actions/workflows/')) {
      return { workflow_runs: [{ id: 100 }, { id: 99, run_attempt: Object.keys(attempts).length }, { id: 98 }] };
    }
    if (path.startsWith('/actions/runs?')) return { workflow_runs: runs };
    if (path.includes('/100/')) return { jobs: [] };
    if (path.includes('/99/')) {
      const conclusion = attempts[Number(path.match(/\/attempts\/(\d+)\//)[1])];
      return { jobs: conclusion === undefined ? [] : [{ name: 'Reconcile production switch', conclusion }] };
    }
    if (path.includes('/98/')) return { jobs: [{ name: 'Reconcile production switch', conclusion: 'success' }] };
    return { jobs: jobsByRunId[Number(path.split('/')[3])] };
  };
}

test('skipしたRe-runは遮断を解除せず、遮断元のrunとattemptを示す', async () => {
  const api = retryHistory({ 1: 'failure', 2: 'skipped' });
  assert.deepEqual(await evaluateCurrentMain({ enabled: true, api, currentRunId: '100' }),
    { sha: A, deploy: false, reason: 'previous-switch-needs-review', blocked_by: '99/attempts/1' });
  // Gate-only attempts (no switch job at all) do not clear it either.
  assert.equal((await evaluateCurrentMain({ enabled: true, api: retryHistory({ 1: 'cancelled', 2: undefined }),
    currentRunId: '100' })).blocked_by, '99/attempts/1');
  // Unknown/in-progress switch results also block.
  assert.equal((await evaluateCurrentMain({ enabled: true, api: retryHistory({ 1: null }), currentRunId: '100' })).reason,
    'previous-switch-needs-review');
});

test('失敗runの全体Re-runは配備へ進めるが、自分の切替が成功するまで回復扱いにしない', async () => {
  const api = retryHistory({ 1: 'failure', 2: 'skipped' });
  assert.deepEqual(await evaluateCurrentMain({ enabled: true, api, currentRunId: '99', currentAttempt: 3 }),
    { sha: A, deploy: true, reason: 'ci-passed', retry_of_failed_switch: 'true' });
  // A first attempt, or a retry of a run whose newest switch succeeded, is not flagged.
  assert.equal((await evaluateCurrentMain({ enabled: true, api, currentRunId: '99', currentAttempt: 1 }))
    .retry_of_failed_switch, undefined);
  assert.equal((await evaluateCurrentMain({ enabled: true, api: retryHistory({ 1: 'failure', 2: 'success' }),
    currentRunId: '99', currentAttempt: 3 })).retry_of_failed_switch, undefined);
});

test('Re-runの切替が成功した後は、後続のCDが通常どおり配備できる', async () => {
  const api = retryHistory({ 1: 'failure', 2: 'skipped', 3: 'success' });
  assert.deepEqual(await evaluateCurrentMain({ enabled: true, api, currentRunId: '100' }),
    { sha: A, deploy: true, reason: 'ci-passed' });
  // A newer failure after that recovery blocks again.
  assert.equal((await evaluateCurrentMain({ enabled: true, api: retryHistory({ 1: 'success', 2: 'failure' }),
    currentRunId: '100' })).blocked_by, '99/attempts/2');
});

// The block and the no-op retry must turn the run red. Evaluate the real step conditions.
function stepCondition(name) {
  const body = workflow.split(`- name: ${name}\n`)[1]?.split(/\n\s+- (?:name|uses): /)[0];
  assert.ok(body, `step "${name}" must exist`);
  const condition = body.match(/^\s+if: (.+)$/m);
  assert.ok(condition, `step "${name}" must have its own if:`);
  return condition[1];
}
function evaluate(condition, outputs) {
  const js = condition.replace(/steps\.gate\.outputs\.(\w+)/g, (_, key) => JSON.stringify(outputs[key] ?? ''));
  return Function(`return (${js})`)();
}

test('CD無効でも失敗切替のRe-runは失敗表示にし、通常の停止とは区別する', async () => {
  for (const [attempts, currentAttempt, failedRetry] of [
    [{ 1: 'failure' }, 2, true],
    [{ 1: 'cancelled', 2: 'skipped' }, 3, true],
    [{ 1: null, 2: undefined }, 3, true],
    [{ 1: 'failure', 2: 'success' }, 3, false],
    [{ 1: 'skipped' }, 2, false],
    [{}, 1, false],
  ]) {
    const history = retryHistory(attempts);
    const api = path => {
      assert.match(path, /^\/actions\/runs\/99\/attempts\/\d+\/jobs\?per_page=100$/,
        'CD無効時は自分の切替履歴だけを読み、mainやCIを照合しない');
      return history(path);
    };
    const result = await evaluateCurrentMain({ enabled: false, api, currentRunId: '99', currentAttempt });
    assert.deepEqual(result, { deploy: false, reason: 'cd-disabled',
      ...(failedRetry ? { retry_of_failed_switch: 'true' } : {}) });
    const outputs = Object.fromEntries(Object.entries(result).map(([key, value]) => [key, String(value)]));
    assert.equal(evaluate(stepCondition('Fail a retry that cannot reach the switch'), outputs), failedRetry);
  }
});

test('遮断中と、切替に届かないRe-runはgate jobを失敗にする', () => {
  const blocked = stepCondition('Fail while a previous switch needs review');
  const noop = stepCondition('Fail a retry that cannot reach the switch');
  assert.equal(evaluate(blocked, { reason: 'previous-switch-needs-review', deploy: 'false' }), true);
  for (const reason of ['cd-disabled', 'ci-passed', 'waiting:Application', 'ci-failed:Foundation']) {
    assert.equal(evaluate(blocked, { reason }), false);
  }
  assert.equal(evaluate(noop, { retry_of_failed_switch: 'true', deploy: 'false' }), true);
  assert.equal(evaluate(noop, { retry_of_failed_switch: 'true', deploy: 'true' }), false);
  assert.equal(evaluate(noop, { deploy: 'false' }), false);
  const gateJob = workflow.match(/\n  gate:[\s\S]*?\n  schema:/)[0];
  assert.match(gateJob, /retry_of_failed_switch: \$\{\{ steps\.gate\.outputs\.retry_of_failed_switch \}\}/);
  // The skip step reads the flag from the gate job output, not from an unset variable.
  const skip = workflow.split('- name: Skip if production already runs this SHA\n')[1].split('run: |')[0];
  assert.match(skip, /RETRY_OF_FAILED_SWITCH: \$\{\{ needs\.gate\.outputs\.retry_of_failed_switch \}\}/);
});

// Run the real "Skip if production already runs this SHA" shell with a fake curl.
async function skipStep(t, { productionSha, retry }) {
  const { mkdtempSync, writeFileSync, readFileSync: read, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, sep } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'cd-skip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const block = workflow.split('- name: Skip if production already runs this SHA\n')[1].split('\n      - name:')[0];
  const script = block.split('run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
  const deployment = { id: 'dpl_current', readyState: 'READY', target: 'production', meta: { cdSha: productionSha } };
  writeFileSync(join(dir, 'deployment.json'), JSON.stringify(deployment));
  const posix = p => p.split(sep).join('/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
  writeFileSync(join(dir, 'curl'), `#!/bin/sh\ncat "${posix(join(dir, 'deployment.json'))}"\n`);
  chmodSync(join(dir, 'curl'), 0o755);
  const bash = process.env.BASH_EXE ?? (process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash');
  const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-c', `PATH="${posix(dir)}:$PATH"\n${script}`], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8',
    env: { ...process.env, TARGET_SHA: A, PRODUCTION_URL: 'https://prod.example', VERCEL_TOKEN: 'synthetic',
      VERCEL_ORG_ID: 'team_x', RUNNER_TEMP: posix(dir), GITHUB_OUTPUT: posix(join(dir, 'out')),
      GITHUB_STEP_SUMMARY: posix(join(dir, 'summary')), RETRY_OF_FAILED_SWITCH: retry },
  });
  const file = name => { try { return read(join(dir, name), 'utf8'); } catch { return ''; } };
  if (result.error) throw result.error;
  return { code: result.status, output: file('out'), summary: file('summary'), stderr: result.stderr };
}

test('本番が既に対象SHAのとき、通常runは成功でskipし、失敗切替のRe-runは失敗にする', async t => {
  const normal = await skipStep(t, { productionSha: A, retry: '' });
  assert.equal(normal.code, 0, normal.stderr);
  assert.match(normal.output, /same=true/);
  const retry = await skipStep(t, { productionSha: A, retry: 'true' });
  assert.equal(retry.code, 1, retry.stderr);
  assert.match(retry.output, /same=true/);
  assert.match(retry.summary, /遮断を解除しません/);
  // When production differs, a retry proceeds to build and switch (same=false).
  const differs = await skipStep(t, { productionSha: B, retry: 'true' });
  assert.equal(differs.code, 0, differs.stderr);
  assert.match(differs.output, /same=false/);
  assert.match(differs.output, /previous=dpl_current/);
});
