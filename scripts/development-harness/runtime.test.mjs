// Explicit Docker integration suite. Never silently skip when the runtime/image is unavailable.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, enroll, transaction, requestCancel, nextTask, authorizeRepair } from './state.mjs';
import { runOne, recover, candidatePath, command, image, root, containerState } from './runtime.mjs';

const contract = () => JSON.parse(readFileSync(new URL('./example-contract.json', import.meta.url)));
const proposal = () => JSON.parse(readFileSync(new URL('./example-proposal.json', import.meta.url)));
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), 'roi-harness-integration-'));
  initialize(directory); const c = contract(); transaction(directory, s => enroll(s, c));
  return { directory, c, id: c.tasks[0].id };
};

test('実Docker: 正常差分→拒否probe→既存検証→commit/patch/Draft成果物、再送は増殖しない', () => {
  const { directory, c, id } = setup();
  process.env.ROI_HARNESS_SECRET_CANARY = 'synthetic-host-only';
  try {
    const result = runOne(directory, c.batchId, proposal());
    const receipt = JSON.parse(readFileSync(join(result.folder, 'results/result.json')));
    assert.equal(result.state, 'artifacts-ready', JSON.stringify(receipt));
    assert.equal(receipt.isolation.denied, 6);
    assert.equal(receipt.isolation.secrets, 0);
    assert.equal(receipt.existingCheck.counts.tests.pass, 6);
    assert.equal(receipt.externalCI, 'not-run');
    assert.equal(receipt.totalCostCents, null);
    assert.match(receipt.head, /^[a-f0-9]{40}$/);
    assert.match(readFileSync(join(result.folder, 'candidate.patch'), 'utf8'), /a \+ b/);
    assert.match(readFileSync(join(result.folder, 'draft-pr.md'), 'utf8'), /Draft未発行/);
    assert.ok(runOne(directory, c.batchId, proposal()).reason);
    assert.equal(transaction(directory, s => s.tasks[id].attempts), 1);
    console.log(JSON.stringify({ evidenceDirectory: directory, head: receipt.head }));
  } finally { delete process.env.ROI_HARNESS_SECRET_CANARY; }
});

test('実Docker: 誤実装・偽TAP成功を拒否し、同じ台帳で修復後に合格', () => {
  const { directory, c, id } = setup();
  const wrong = { files: { [candidatePath]: 'const values=JSON.parse(process.argv[2]); console.log(JSON.stringify(values.map(([a,b])=>a-b)));\n' } };
  const wrongResult = runOne(directory, c.batchId, wrong);
  assert.equal(wrongResult.state, 'awaiting-decision');
  assert.equal(JSON.parse(readFileSync(join(wrongResult.folder, 'results/result.json'))).diagnostic, 'behavior-failed');
  transaction(directory, s => authorizeRepair(s, id, { kind: 'mandatory-local-failure', head: null, reference: 'wrong-output-rejected' }));
  const fake = { files: { [candidatePath]: 'console.log("# tests 1\\n# pass 1\\n# fail 0");\n' } };
  const failed = runOne(directory, c.batchId, fake);
  assert.equal(failed.state, 'awaiting-decision');
  const receipt = JSON.parse(readFileSync(join(failed.folder, 'results/result.json')));
  assert.equal(receipt.passed, false);
  transaction(directory, s => authorizeRepair(s, id, { kind: 'mandatory-local-failure', head: null, reference: 'fake-success-rejected' }));
  const repaired = runOne(directory, c.batchId, proposal());
  assert.equal(repaired.state, 'artifacts-ready');
  assert.equal(transaction(directory, s => s.tasks[id].attempts), 3);
  assert.equal(transaction(directory, s => s.tasks[id].reservedMs), 180000);
});

test('実Docker: worker生存中の取消では枠を解放せず、runtime停止確認後に復旧', () => {
  const { directory, c, id } = setup();
  const name = 'roi-harness-stop-' + Date.now();
  command('docker', ['create', '--pull', 'never', '--name', name, '--label', `future-roi-harness=${name}`, '--network', 'none',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000', image,
    'node', '-e', 'setTimeout(()=>{},30000)']);
  command('docker', ['start', name]);
  transaction(directory, s => {
    // A persisted reservation models the controller having exited while its worker survived.
    s.tasks[id].active = { container: name, startedAt: Date.now(), attempt: 1 };
    s.tasks[id].attempts = 1; s.tasks[id].reservedMs = 60000; s.batches[c.batchId].reservedMs = 60000;
    s.tasks[id].state = 'implementing'; requestCancel(s, id);
  });
  assert.equal(transaction(directory, s => nextTask(s, c.batchId)).reason, 'worker-stop-unconfirmed');
  recover(directory, id);
  assert.equal(transaction(directory, s => s.tasks[id].active), null);
  assert.equal(transaction(directory, s => s.tasks[id].state), 'awaiting-decision');
  assert.equal(transaction(directory, s => s.tasks[id].attempts), 1);
});

test('実CLI中断: hostをkillしてもcontainerと台帳が残り、二重起動せず復旧できる', async () => {
  const { directory, c, id } = setup();
  const input = join(directory, 'proposals.json');
  writeFileSync(input, JSON.stringify({ [id]: { files: { [candidatePath]: 'setTimeout(()=>{},40000);\n' } } }));
  const child = spawn(process.execPath, ['scripts/development-harness/cli.mjs', 'run', directory, c.batchId, input],
    { cwd: root, stdio: 'ignore', windowsHide: true });
  let active;
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        active = transaction(directory, s => s.tasks[id].active);
        if (active && containerState(active.container).Running) { break; }
      } catch { /* A live writer lock or not-yet-created container is not exit confirmation. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(active && containerState(active.container).Running);
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
    assert.equal(containerState(active.container).Running, true);
    assert.equal(transaction(directory, s => nextTask(s, c.batchId)).reason, 'worker-stop-unconfirmed');
    recover(directory, id);
    assert.equal(transaction(directory, s => s.tasks[id].active), null);
    assert.equal(transaction(directory, s => s.tasks[id].attempts), 1);
  } finally {
    if (child.exitCode === null) { child.kill(); }
    if (active) { try { recover(directory, id); } catch { /* Already recovered; retain evidence. */ } }
  }
});

test('AR-02 実Docker: 遅い候補を共通期限で止め、新しい合格成果物を作らない', () => {
  const directory = mkdtempSync(join(tmpdir(), 'roi-harness-deadline-'));
  initialize(directory); const c = contract(); c.attemptMs = 20000;
  transaction(directory, s => enroll(s, c));
  const result = runOne(directory, c.batchId, { files: { [candidatePath]: 'setTimeout(()=>{},40000);\n' } });
  assert.notEqual(result.state, 'artifacts-ready');
  assert.equal(JSON.parse(readFileSync(join(result.folder, 'results/result.json'))).passed, false);
  if (result.state === 'stop-unconfirmed') { recover(directory, c.tasks[0].id); }
  assert.ok(transaction(directory, s => s.tasks[c.tasks[0].id].reservedMs) >= 20000);
});
