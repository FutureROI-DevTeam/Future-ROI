// Explicit Windows integration: installed pinned CLI, fake auth only, no model/API spend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeTools } from './codex-client.mjs';
import { processIdentity, recoverModel, stopModelSupervisor, generateProposal } from './codex-worker.mjs';
import { initialize, transaction } from './state.mjs';
import { recover } from './runtime.mjs';

test('固定Codex実体: fake ChatGPTで公開toolゼロ、未登録4種を拒否、project canary非送信', async () => {
  const evidence = await probeTools(mkdtempSync(join(tmpdir(), 'roi-tool-probe-')));
  assert.equal(evidence.advertisedTools, 0);
  assert.equal(evidence.rejectedCalls, 4);
  assert.equal(evidence.contextCanaryAbsent, true);
  assert.match(evidence.binarySha256, /^[a-f0-9]{64}$/);
});

test('モデル復旧: supervisorと登録済み子processを実停止し、spawn結果不明は拒否', async () => {
  const owner = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { windowsHide: true, stdio: 'ignore' });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { windowsHide: true, stdio: 'ignore' });
  const ownerClosed = new Promise(r => owner.on('close', r)), workerClosed = new Promise(r => worker.on('close', r));
  try {
    const active = { phase: 'model-running', owner: processIdentity(owner.pid), model: { ...processIdentity(worker.pid), stopped: false } };
    stopModelSupervisor(active);
    await ownerClosed;
    assert.equal(processIdentity(owner.pid), null);
    assert.notEqual(processIdentity(worker.pid), null);
    recoverModel(active);
    await workerClosed;
    assert.equal(processIdentity(worker.pid), null);
    assert.throws(() => recoverModel({ phase: 'model-starting', model: { stopped: false } }), /model-start-unconfirmed/);
  } finally { owner.kill(); worker.kill(); }
});

test('取消済みの生成はprobe/quota/modelを一つも開始しない', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'roi-cancel-model-')); initialize(directory);
  transaction(directory, s => { s.tasks.fixture = { cancelRequested: true, active: { container: 'reservation', owner: { pid: process.pid }, phase: 'model-preflight' } }; });
  await assert.rejects(generateProposal({ directory, id: 'fixture', folder: join(directory, 'never-created'),
    deadline: Date.now() + 60000, base: 'a'.repeat(40), baseline: '' }), /cancelled/);
  assert.equal(transaction(directory, s => s.tasks.fixture.active.phase), 'model-preflight');
});

test('CR-01: 復旧snapshot後に登録された最新子processも停止してから枠を解放', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'roi-recovery-race-')); initialize(directory);
  const owner = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { windowsHide: true, stdio: 'ignore' });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { windowsHide: true, stdio: 'ignore' });
  const workerClosed = new Promise(r => worker.on('close', r));
  try {
    transaction(directory, s => {
      s.batches.batch = { contract: { attemptMs: 60000 }, reservedMs: 60000 };
      s.tasks.fixture = { batchId: 'batch', state: 'implementing', actualMs: 0, reservedMs: 60000, receipts: [],
        active: { container: 'reservation', startedAt: Date.now(), phase: 'model-stopped', owner: processIdentity(owner.pid), model: { stopped: true } } };
    });
    recover(directory, 'fixture', snapshot => {
      // Deterministic interleaving: old snapshot says quota stopped; latest ledger has the
      // inference process that registered before the supervisor stopped. No real auth.
      transaction(directory, s => { s.tasks.fixture.active.phase = 'model-running'; s.tasks.fixture.active.model = { ...processIdentity(worker.pid), stopped: false }; });
      stopModelSupervisor(snapshot);
    });
    await workerClosed;
    assert.equal(processIdentity(worker.pid), null);
    assert.equal(transaction(directory, s => s.tasks.fixture.active), null);
  } finally { owner.kill(); worker.kill(); }
});
