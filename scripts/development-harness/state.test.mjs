import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as h from './state.mjs';
import { validateProposal, candidatePath, timeRemaining } from './runtime.mjs';

const contract = () => JSON.parse(readFileSync(new URL('./example-contract.json', import.meta.url)));
const setup = () => { const c = contract(); const s = h.emptyLedger(); h.enroll(s, c, 0); return { s, c, id: c.tasks[0].id }; };
const sha = 'a'.repeat(40);
const pass = (s, id) => { h.reserve(s, id, 'container', 1); h.finish(s, id, { container: 'container', stopped: true, passed: true, head: sha }, 2); };

test('契約はReadyや自由な指示で拡大せず、有限のfixtureだけを許可', () => {
  for (const change of [c => c.publish = true, c => c.workers = 2, c => c.maxCostCents = 10,
    c => c.tasks[0].allowedFiles.push('.github/workflows/application.yml'), c => c.tasks[0].revision++,
    c => c.tasks[0].dependencies.push('unknown'), c => c.attemptMs = -1, c => c.tasks = []]) {
    const c = contract(); change(c); assert.throws(() => h.validateContract(c));
  }
  for (const path of ['../policy', '.github/workflows/x.yml', 'package.json', 'scripts/development-harness/state.mjs',
    'apps/web/src/copy/today.ts', 'experiments/development-harness-fixture/../x']) {
    assert.throws(() => validateProposal({ files: { [path]: 'text' } }));
  }
  assert.throws(() => validateProposal({ files: { [candidatePath]: 'a' }, command: 'publish' }));
});

test('同じbatch再送は同一台帳、別batchやrevisionで作業と累積予算を初期化できない', () => {
  const { s, c, id } = setup();
  h.reserve(s, id, 'one', 1);
  h.enroll(s, c, 100);
  assert.equal(s.tasks[id].attempts, 1);
  assert.equal(s.batches[c.batchId].reservedMs, 60000);
  assert.throws(() => h.enroll(s, { ...c, batchId: 'new' }, 100), /existing-task/);
  const revision = structuredClone(c); revision.tasks[0].revision++;
  assert.throws(() => h.enroll(s, revision, 100));
  assert.equal(s.tasks[id].active.container, 'one');
});

test('取消要求と終了は別。停止不明では枠を保持し修復・再開も拒否', () => {
  const { s, c, id } = setup();
  h.reserve(s, id, 'one', 1); h.requestCancel(s, id);
  assert.equal(h.nextTask(s, c.batchId, 2).reason, 'worker-stop-unconfirmed');
  assert.throws(() => h.finish(s, id, { container: 'one', stopped: false, passed: true }, 3));
  assert.throws(() => h.resumeCancelled(s, id));
  assert.throws(() => h.authorizeRepair(s, id, {}));
  h.finish(s, id, { container: 'one', stopped: true, passed: true, head: sha }, 4);
  assert.equal(s.tasks[id].state, 'awaiting-decision');
  h.resumeCancelled(s, id);
  assert.equal(s.tasks[id].attempts, 1);
});

test('初回＋修復3回で停止。再起動・担当交替を模したJSON往復でも累積を維持', () => {
  let { s, c, id } = setup();
  for (let i = 0; i < 4; i++) {
    h.reserve(s, id, 'container', 1);
    h.finish(s, id, { container: 'container', stopped: true, passed: false }, 2);
    s = JSON.parse(JSON.stringify(s));
    h.authorizeRepair(s, id, { kind: 'mandatory-local-failure', head: null, reference: 'failed-check' });
  }
  assert.equal(s.tasks[id].attempts, 4);
  assert.equal(s.tasks[id].reservedMs, 240000);
  assert.equal(h.nextTask(s, c.batchId, 3).reason, 'no-authorized-work-or-budget');
  assert.throws(() => h.reserve(s, id, 'fifth', 4));
  assert.equal(h.nextTask(s, c.batchId, 3600000).reason, 'lifetime-budget');
});

test('レビュー容量1で正常終了。人がfixtureを受入れた後だけ依存する次作業へ進む', () => {
  const c = contract();
  c.tasks.push({ ...structuredClone(c.tasks[0]), id: 'fixture-next', dependencies: [c.tasks[0].id] });
  const s = h.emptyLedger(); h.enroll(s, c, 0);
  pass(s, c.tasks[0].id);
  assert.equal(h.nextTask(s, c.batchId, 3).reason, 'no-authorized-work-or-budget');
  assert.throws(() => h.reserve(s, c.tasks[0].id, 'again', 3));
  h.acceptFixture(s, c.tasks[0].id);
  assert.equal(h.nextTask(s, c.batchId, 3).id, 'fixture-next');
  assert.equal(s.metrics.totalCostCents, null);
  assert.equal(s.metrics.humanReviewMinutes, null);
});

test('レビュー中のheadはOptionalで変わらず、対象headへの必須修正のみ再開', () => {
  const { s, id } = setup(); pass(s, id);
  assert.throws(() => h.authorizeRepair(s, id, { kind: 'optional', head: sha, reference: 'style' }));
  assert.throws(() => h.authorizeRepair(s, id, { kind: 'required-review-change', head: 'b'.repeat(40), reference: 'review' }));
  assert.throws(() => h.authorizeRepair(s, id, { kind: 'mandatory-local-failure', head: sha, reference: 'fake' }));
  h.authorizeRepair(s, id, { kind: 'required-review-change', head: sha, reference: 'trusted-review-1' });
  assert.equal(s.tasks[id].state, 'repair-authorized');
  assert.equal(s.tasks[id].head, sha);
  assert.equal(s.tasks[id].attempts, 1);
});

test('AR-01: cancel/resumeはレビュー待ち・受入済みheadの修復許可にならない', () => {
  for (const state of ['artifacts-ready', 'review-ready', 'accepted']) {
    const { s, c, id } = setup(); pass(s, id); s.tasks[id].state = state;
    h.requestCancel(s, id); h.requestCancel(s, id); h.resumeCancelled(s, id);
    assert.equal(s.tasks[id].state, state);
    assert.equal(s.tasks[id].repair, null);
    assert.equal(h.nextTask(s, c.batchId, 3).id, undefined);
    assert.equal(s.tasks[id].head, sha);
  }
  const { s, c, id } = setup();
  h.requestCancel(s, id); h.resumeCancelled(s, id);
  assert.equal(h.nextTask(s, c.batchId, 1).id, id);
});

test('AR-02: 期限残量に収まらない開始を拒否し、安全終了の超過も累積へ加算', () => {
  const { s, c, id } = setup();
  assert.equal(h.nextTask(s, c.batchId, c.lifetimeMs - 1).reason, 'lifetime-budget');
  assert.throws(() => h.reserve(s, id, 'late', c.lifetimeMs - 1));
  h.reserve(s, id, 'one', 1);
  h.finish(s, id, { container: 'one', stopped: true, passed: false }, 70001);
  assert.equal(s.tasks[id].reservedMs, 70000);
  assert.equal(s.batches[c.batchId].reservedMs, 70000);
  assert.equal(timeRemaining(1000, 999), 1);
  assert.throws(() => timeRemaining(1000, 1000), /time-budget/);
  assert.equal(timeRemaining(30000, 1), 15000);
});

test('応答喪失は再書込みより照合。0件・多件・別headを成功としない', () => {
  const { s, c, id } = setup(); pass(s, id);
  const intent = { repository: h.repository, base: 'main', branch: `harness/${id}`, head: sha, operation: 'draft-pr' };
  h.beginWrite(s, id, intent);
  assert.throws(() => h.beginWrite(s, id, intent));
  assert.throws(() => h.enroll(s, { ...c, batchId: 'bypass' }, 3));
  for (const matches of [[], [{ ...intent, head: 'b'.repeat(40), number: 1, draft: true }], [intent, intent]]) {
    assert.throws(() => h.reconcileWrite(s, id, { complete: true, matches }));
    assert.ok(s.tasks[id].writeIntent);
  }
  h.reconcileWrite(s, id, { complete: true, matches: [{ ...intent, number: 123, draft: true }] });
  assert.equal(s.tasks[id].state, 'draft-created');
  assert.equal(s.tasks[id].pr, 123);
});

test('取消中に確定したPR照合をresumeで未確定へ巻き戻さない', () => {
  const { s, id } = setup(); pass(s, id);
  const intent = { repository: h.repository, base: 'main', branch: `harness/${id}`, head: sha, operation: 'draft-pr' };
  h.beginWrite(s, id, intent); h.requestCancel(s, id);
  assert.throws(() => h.resumeCancelled(s, id), /unconfirmed/);
  h.reconcileWrite(s, id, { complete: true, matches: [{ ...intent, number: 123, draft: true }] });
  h.resumeCancelled(s, id);
  assert.equal(s.tasks[id].state, 'draft-created');
  assert.equal(s.tasks[id].pr, 123);
});

test('CIはhead/checkout/producer/run/attemptを照合。未実行・skip・旧成功は拒否', () => {
  const expected = [{ workflow: 'application.yml', job: 'application', producer: 'github-actions', checkout: 'b'.repeat(40), run: 11, attempt: 2 }];
  const good = { ...expected[0], repository: h.repository, head: sha, conclusion: 'success', status: 'completed', unrun: 0 };
  for (const patch of [{ head: 'c'.repeat(40) }, { checkout: sha }, { producer: 'other-app' }, { attempt: 1 },
    { run: 10 }, { unrun: 1 }, { conclusion: 'skipped' }, { status: 'queued' }, { conclusion: null }]) {
    const t = { state: 'draft-created', head: sha };
    assert.equal(h.assessCI(t, [{ ...good, ...patch }], expected), false);
    assert.equal(t.state, 'ci-wait');
  }
  const t = { state: 'draft-created', head: sha };
  assert.equal(h.assessCI(t, [], expected), false);
  assert.equal(h.assessCI(t, [good], expected), true);
  assert.equal(t.state, 'review-ready');
  assert.equal(h.assessCI(t, [], expected), false);
});

test('台帳の二重初期化・破損・lockを無視せず、transaction失敗は変更しない', () => {
  const d = mkdtempSync(join(tmpdir(), 'roi-harness-state-'));
  try {
    h.initialize(d); assert.throws(() => h.initialize(d));
    h.transaction(d, s => h.enroll(s, contract(), 0));
    assert.throws(() => h.transaction(d, s => { s.metrics.totalCostCents = 0; throw new Error('stop'); }));
    assert.equal(h.transaction(d, s => s.metrics.totalCostCents), null);
    writeFileSync(join(d, 'ledger.lock'), 'old');
    assert.throws(() => h.transaction(d, () => {}));
    rmSync(join(d, 'ledger.lock'));
    writeFileSync(join(d, 'ledger.json'), '{broken');
    assert.throws(() => h.transaction(d, () => {}));
    assert.equal(readFileSync(join(d, 'ledger.json'), 'utf8'), '{broken');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
