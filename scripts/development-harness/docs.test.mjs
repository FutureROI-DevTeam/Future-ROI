import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateContract, emptyLedger, enroll, nextTask, reserve, finish, initialize, transaction, acceptFixture, requestCancel, resumeCancelled } from './state.mjs';
import { validateDocument } from './docs-runtime.mjs';
import { classifyWork, publishDraft, validateChecks, requiredJobs, requiredSteps, checkoutEvidence, accounted, pages } from './github.mjs';
const contract = () => JSON.parse(readFileSync(new URL('./issue-331-contract.json', import.meta.url)));
const head = 'a'.repeat(40);
test('CR-04: fixtureへのpublish拒否や不明予算で累積値をnullへ破損しない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roi-budget-test-'));
  try {
    initialize(dir); const c = JSON.parse(readFileSync(new URL('./codex-contract.json', import.meta.url)));
    transaction(dir, s => { enroll(s, c); reserve(s, c.tasks[0].id, 'c'); });
    const before = readFileSync(join(dir, 'ledger.json'), 'utf8');
    assert.throws(() => publishDraft(dir, c.tasks[0].id), /publish-not-authorized/);
    assert.throws(() => accounted(dir, c.tasks[0].id, undefined, () => {}), /invalid-operation-budget/);
    assert.equal(readFileSync(join(dir, 'ledger.json'), 'utf8'), before);
  } finally { rmSync(dir, { recursive: true }); }
});
test('実Issue identity・exact new document・有限予算を固定しfixture受入でClose相当に進めない', () => {
  const c = contract(), s = emptyLedger(); enroll(s, c); reserve(s, 'issue-331', 'container');
  finish(s, 'issue-331', { container: 'container', stopped: true, passed: true, head });
  assert.throws(() => acceptFixture(s, 'issue-331'), /fixture-only/);
  assert.throws(() => enroll(s, { ...c, batchId: 'revision-bypass' }), /existing-task/);
  for (const path of ['docs/changes/../product-spec.md', '.github/workflows/foundation.yml', 'docs/changes/issue-332-x.md']) {
    const bad = contract(); bad.tasks[0].allowedFiles = [path]; assert.throws(() => validateContract(bad), /forbidden-scope/);
  }
  assert.throws(() => validateDocument({ files: { [c.tasks[0].allowedFiles[0]]: 'pass\n', 'scripts/check-foundation.ps1': '' } }, c.tasks[0]), /forbidden-proposal/);
  assert.equal(nextTask(JSON.parse(JSON.stringify(s)), c.batchId).reason, 'no-authorized-work-or-budget');
});
test('全状態PRと別名branch・foreign repo・既存headを照合する', () => {
  const c = contract(), spec = c.tasks[0], task = { head };
  const pr = { number: 1, head: { ref: spec.branch, sha: head, repo: { full_name: c.repository } }, base: { ref: 'main' }, state: 'open', draft: true, body: 'Refs #331' };
  assert.equal(classifyWork(spec, task, [], [pr]).pr.number, 1);
  for (const bad of [{ ...pr, state: 'closed' }, { ...pr, draft: false }, { ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } }]) {
    assert.throws(() => classifyWork(spec, task, [], [bad]), /existing-pr-conflict/);
  }
  assert.throws(() => classifyWork(spec, task, [{ branch: 'fix/331-other', sha: head }], []), /branch-conflict/);
  assert.throws(() => classifyWork(spec, task, [], [pr, { ...pr, number: 2 }]), /ambiguous/);
  const implementation = { ...pr, number: 344, head: { ...pr.head, ref: 'chore/340-development-harness' }, body: 'Demonstration #331 will be a separate PR.', scopeOverlap: false };
  assert.equal(classifyWork(spec, task, [], [implementation]).pr, null);
  assert.throws(() => classifyWork(spec, task, [], [{ ...implementation, scopeOverlap: true }]), /existing-pr-conflict/);
});
test('push成功応答喪失後はremote照合、PR成功応答喪失後も再作成しない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roi-publisher-test-'));
  try {
    initialize(dir); const c = contract(); transaction(dir, s => { enroll(s, c); reserve(s, 'issue-331', 'c'); finish(s, 'issue-331', { container: 'c', stopped: true, passed: true, head }); });
    let remote = null, pr = null, pushes = 0, posts = 0;
    const io = { verify() {}, observe: () => ({ remote, pr }), push: () => { pushes++; remote = { sha: head }; throw new Error('response-lost'); },
      read: () => { posts++; pr = { number: 345, head: { sha: head } }; throw new Error('response-lost'); } };
    assert.throws(() => publishDraft(dir, 'issue-331', io), /response-lost/);
    assert.equal(transaction(dir, s => nextTask(s, c.batchId).reason), 'write-still-unknown');
    assert.throws(() => publishDraft(dir, 'issue-331', io), /response-lost/);
    assert.equal(publishDraft(dir, 'issue-331', io).pr, 345);
    assert.equal(publishDraft(dir, 'issue-331', io).pr, 345);
    assert.deepEqual([pushes, posts], [1, 1]);
    assert.equal(transaction(dir, s => s.tasks['issue-331'].reservedMs), 780000);
  } finally { rmSync(dir, { recursive: true }); }
});
test('不明書込みの不在は再送許可にならない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roi-publisher-test-'));
  try {
    initialize(dir); const c = contract(); transaction(dir, s => { enroll(s, c); reserve(s, 'issue-331', 'c'); finish(s, 'issue-331', { container: 'c', stopped: true, passed: true, head }); });
    let writes = 0; const io = { verify() {}, observe: () => ({ remote: null, pr: null }), push: () => { writes++; throw new Error('lost'); } };
    assert.throws(() => publishDraft(dir, 'issue-331', io), /lost/);
    assert.throws(() => publishDraft(dir, 'issue-331', io), /write-still-unknown/); assert.equal(writes, 1);
  } finally { rmSync(dir, { recursive: true }); }
});
test('CIの未実行、旧head、他発行元、必須step skip、古いattemptを合格にしない', () => {
  const checks = [], runs = [], jobs = [];
  Object.entries(requiredJobs).forEach(([name, path], index) => {
    const id = index + 1;
    checks.push({ id, name, head_sha: head, app: { id: 15368 }, check_suite: { id }, status: 'completed', conclusion: 'success' });
    runs.push({ id, check_suite_id: id, head_sha: head, path, event: 'pull_request', status: 'completed', conclusion: 'success', run_attempt: 2 });
    jobs.push({ id, run_id: id, run_attempt: 2, conclusion: 'success', checkoutEvidence: { checkout: head, source: head }, steps: ['Set up job', ...requiredSteps[name]].map(name => ({ name, conclusion: 'success' })) });
  });
  assert.equal(validateChecks(head, checks, runs, jobs, head), true);
  assert.equal(validateChecks('b'.repeat(40), checks, runs, jobs, head), false);
  assert.equal(validateChecks(head, [], runs, jobs, head), false);
  const mutate = fn => { const copy = structuredClone({ checks, runs, jobs }); fn(copy); assert.equal(validateChecks(head, copy.checks, copy.runs, copy.jobs, head), false); };
  mutate(c => { c.checks[0].app.id = 1; }); mutate(c => { c.jobs[0].steps[1].conclusion = 'skipped'; }); mutate(c => { c.jobs[0].run_attempt = 1; });
  mutate(c => { c.jobs[0].checkoutEvidence.checkout = 'b'.repeat(40); });
  mutate(c => { c.jobs[0].steps = [{ name: 'Set up job', conclusion: 'success' }]; });
  assert.deepEqual(checkoutEvidence(`time [command]/usr/bin/git log -1 --format=%H\ntime ${head}\ntime CI_SOURCE_SHA: ${head}\n`), { checkout: head, source: head });
  assert.equal(checkoutEvidence('passed ' + head).checkout, null);
});
test('IR-01: 古い照合が別controllerの新Draft intentを消して再POSTしない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roi-race-test-'));
  try {
    initialize(dir); const c = contract(); transaction(dir, s => { enroll(s, c); reserve(s, 'issue-331', 'c'); finish(s, 'issue-331', { container: 'c', stopped: true, passed: true, head });
      s.tasks['issue-331'].writeIntent = { id: 'original', operation: 'push', head, branch: c.tasks[0].branch }; s.tasks['issue-331'].state = 'write-unknown'; });
    let posts = 0, nested = false;
    const io = { verify() {}, observe() {
      if (!nested) { nested = true; assert.throws(() => publishDraft(dir, 'issue-331', io), /lost/); }
      return { remote: { sha: head }, pr: null };
    }, read() { posts++; throw new Error('lost'); } };
    assert.throws(() => publishDraft(dir, 'issue-331', io), /write-intent-changed/);
    assert.equal(posts, 1); assert.equal(transaction(dir, s => s.tasks['issue-331'].writeIntent.operation), 'draft');
  } finally { rmSync(dir, { recursive: true }); }
});
test('IR-02: cancel中もpush結果を照合でき、新規POSTは行わない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roi-cancel-test-'));
  try {
    initialize(dir); const c = contract(); transaction(dir, s => { enroll(s, c); reserve(s, 'issue-331', 'c'); finish(s, 'issue-331', { container: 'c', stopped: true, passed: true, head });
      s.tasks['issue-331'].writeIntent = { id: 'original', operation: 'push', head, branch: c.tasks[0].branch }; requestCancel(s, 'issue-331'); });
    let posts = 0;
    const result = publishDraft(dir, 'issue-331', { verify() {}, observe: () => ({ remote: { sha: head }, pr: null }), read() { posts++; } });
    assert.equal(result.state, 'cancelled; reconciled-only'); assert.equal(posts, 0);
    transaction(dir, s => { assert.equal(s.tasks['issue-331'].cancelRequested, true); resumeCancelled(s, 'issue-331'); });
  } finally { rmSync(dir, { recursive: true }); }
});
test('IR-04: ページごとの成功で共通期限を延ばさず累積予算を保存', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roi-deadline-test-'));
  const clock = Date.now; let now = clock(); Date.now = () => now;
  try {
    initialize(dir); transaction(dir, s => enroll(s, contract())); let calls = 0;
    assert.throws(() => accounted(dir, 'issue-331', 20, () => pages('branches', null, () => {
      calls++; now += 25;
      return Array(100).fill({});
    })), /operation-time-budget/);
    assert.equal(calls, 1); assert.ok(transaction(dir, s => s.tasks['issue-331'].reservedMs) >= 20);
    assert.ok(transaction(dir, s => s.tasks['issue-331'].actualMs) >= 25);
  } finally { Date.now = clock; rmSync(dir, { recursive: true }); }
});
