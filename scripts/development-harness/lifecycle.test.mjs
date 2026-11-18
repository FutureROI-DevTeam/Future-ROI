import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import * as state from './state.mjs';

// Evaluate the real entry point/runtime in a child process. Only external execution
// and the cancellation interleaving are controlled; ledger/budget transitions are real.
async function loadWith(file, overrides) {
  const module = new vm.SourceTextModule(readFileSync(file, 'utf8'), {
    initializeImportMeta: meta => { meta.url = file.href; },
  });
  await module.link(async specifier => {
    const url = specifier.startsWith('.') ? new URL(specifier, file).href : specifier;
    const values = { ...await import(url), ...overrides[specifier] };
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) { this.setExport(name, value); }
    });
  });
  await module.evaluate();
  return module.namespace;
}

async function scenario(kind, directory, variant) {
  state.initialize(directory);
  const cli = kind === 'cli';
  const contract = JSON.parse(readFileSync(new URL(cli ? './codex-contract.json' : './example-contract.json', import.meta.url)));
  if (variant === 'task-budget') { contract.taskMs = contract.attemptMs; }
  if (variant === 'batch-budget') { contract.batchMs = contract.attemptMs; }
  state.transaction(directory, s => state.enroll(s, contract));
  const id = contract.tasks[0].id;
  if (cli) {
    process.argv = [process.execPath, 'cli.mjs', 'run-codex', directory, contract.batchId];
    await loadWith(new URL('./cli.mjs', import.meta.url), {
      './runtime.mjs': { runOne: async () => {
        state.transaction(directory, s => {
          state.reserve(s, id, 'controlled-worker');
          const passed = variant === 'repair-success' && s.tasks[id].attempts === 2;
          state.finish(s, id, { container: 'controlled-worker', stopped: true, passed,
            head: passed ? 'a'.repeat(40) : null,
            diagnostic: passed ? 'none' : variant === 'forbidden-proposal' ? variant : 'behavior-failed' });
          if (variant === 'lifetime-budget') { s.batches[contract.batchId].expiresAt = Date.now(); }
        });
        return { id, state: state.transaction(directory, s => s.tasks[id].state) };
      } },
    });
    return;
  }

  const fs = await import('node:fs');
  const calls = [];
  let cancellationRecorded = false;
  const runtime = await loadWith(new URL('./runtime.mjs', import.meta.url), {
    'node:fs': { mkdirSync: (path, options) => {
      const result = fs.mkdirSync(path, options);
      if (String(path).endsWith('policy') && variant === 'cancel-before-create') {
        state.transaction(directory, s => state.requestCancel(s, id));
        cancellationRecorded = true;
      }
      return result;
    } },
    'node:child_process': { execFileSync: (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === 'git') {
        if (args[0] === 'rev-parse') { return 'a'.repeat(40); }
        if (args[0] === 'show') { return '// public baseline'; }
      }
      if (bin === 'docker') {
        if (['info', 'image'].includes(args[0])) { return '{}'; }
        if (args[0] === 'create' && variant === 'unknown-create') { throw new Error('response-lost'); }
      }
      assert.fail(`Unexpected external command: ${bin} ${args[0]}`);
    } },
  });
  const proposal = JSON.parse(readFileSync(new URL('./example-proposal.json', import.meta.url)));
  const result = await runtime.runOne(directory, contract.batchId, proposal);
  const task = state.transaction(directory, s => s.tasks[id]);
  if (variant === 'cancel-before-create') {
    assert.equal(cancellationRecorded, true);
    assert.equal(result.state, 'awaiting-decision');
    assert.equal(task.active, null);
    assert.equal(task.receipts.at(-1).diagnostic, 'cancelled');
    assert.equal(task.receipts.at(-1).stopped, true);
    assert.equal(calls.some(([bin, action]) => bin === 'docker' && ['create', 'inspect', 'stop', 'rm'].includes(action)), false);
    state.transaction(directory, s => state.resumeCancelled(s, id));
    assert.equal(state.transaction(directory, s => state.nextTask(s, contract.batchId)).id, id);
    assert.equal(state.transaction(directory, s => s.tasks[id].attempts), 1);
    assert.equal(state.transaction(directory, s => s.tasks[id].reservedMs), contract.attemptMs);
    assert.equal(state.transaction(directory, s => s.batches[contract.batchId].reservedMs), contract.attemptMs);
  } else {
    assert.equal(result.state, 'stop-unconfirmed');
    assert.ok(task.active);
    assert.equal(task.receipts.length, 0);
    assert.equal(state.transaction(directory, s => state.nextTask(s, contract.batchId)).reason, 'worker-stop-unconfirmed');
    assert.throws(() => state.transaction(directory, s => state.resumeCancelled(s, id)), /stop-or-write-unconfirmed/);
  }
}

if (process.argv[2] === '--scenario') {
  await scenario(...process.argv.slice(3));
} else {
  const run = (kind, variant, check) => {
    const directory = mkdtempSync(join(tmpdir(), 'roi-lifecycle-'));
    try {
      const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url),
        '--scenario', kind, directory, variant], { encoding: 'utf8', timeout: 15000, windowsHide: true });
      assert.ifError(child.error);
      check(child, JSON.parse(readFileSync(join(directory, 'ledger.json'), 'utf8')));
    } finally { rmSync(directory, { recursive: true }); }
  };
  for (const variant of ['behavior-failed', 'forbidden-proposal', 'task-budget', 'batch-budget', 'lifetime-budget']) {
    test(`CLI: ${variant}で自動修復を継続できなければexit 1、失敗と累積予算を保持`, () => {
      run('cli', variant, (child, ledger) => {
        assert.equal(child.status, 1, child.stderr + child.stdout);
        const task = ledger.tasks['fixture-issue-340'];
        const expected = ['behavior-failed', 'forbidden-proposal'].includes(variant) ? 4 : 1;
        assert.equal(task.attempts, expected);
        assert.equal(task.state, 'awaiting-decision');
        assert.equal(task.active, null);
        assert.equal(task.head, null);
        assert.equal(task.receipts.length, expected);
        assert.equal(ledger.batches[task.batchId].modelRuns, expected);
        assert.ok(task.reservedMs >= expected * 300000);
      });
    });
  }
  test('CLI: 必須修復後の合格とレビュー枠での正常停止はexit 0', () => {
    run('cli', 'repair-success', (child, ledger) => {
      assert.equal(child.status, 0, child.stderr + child.stdout);
      const task = ledger.tasks['fixture-issue-340'];
      assert.equal(task.state, 'artifacts-ready');
      assert.equal(task.attempts, 2);
      assert.deepEqual(task.receipts.map(r => r.passed), [false, true]);
      assert.equal(task.head, 'a'.repeat(40));
    });
  });
  for (const variant of ['cancel-before-create', 'unknown-create']) {
    test(`runtime: ${variant}の実行枠・再開可否を区別`, () => {
      run('runtime', variant, child => assert.equal(child.status, 0, child.stderr + child.stdout));
    });
  }
}
