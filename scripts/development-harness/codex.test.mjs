import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argumentsFor, decodeResult, invoke } from './codex-client.mjs';
import { emptyLedger, enroll, reserve, finish, authorizeRepair, nextTask } from './state.mjs';

test('Codex出力のsuccess文字列・欠落usage・複数回答を合格にしない', () => {
  const events = [{ type: 'item.completed', item: { type: 'agent_message', text: '{"files":{}}' } },
    { type: 'turn.completed', usage: { input_tokens: 20, output_tokens: 10 } }];
  const result = data => ({ stopped: true, code: 0, overflow: false, out: data.map(e => JSON.stringify(e)).join('\n') });
  assert.deepEqual(decodeResult(result(events)).proposal, { files: {} });
  assert.throws(() => decodeResult({ ...result(events), code: 1 }));
  assert.throws(() => decodeResult(result([events[0], { type: 'turn.completed' }])));
  assert.throws(() => decodeResult(result([...events, events[0]])));
  assert.throws(() => decodeResult(result([...events, { type: 'item.completed', item: { type: 'command_execution' } }])));
  assert.throws(() => decodeResult(result([{ type: 'item.completed', item: { type: 'agent_message', text: 'success' } }, events[1]])));
});

test('Codex契約は既存購読・固定Issue・ゼロ追加課金に限定、再起動後も起動予約4回で停止', () => {
  const c = JSON.parse(readFileSync(new URL('./codex-contract.json', import.meta.url), 'utf8'));
  let s = emptyLedger(); enroll(s, c, 0); const id = c.tasks[0].id;
  for (const changed of [{ auth: 'api-key' }, { maxCostCents: 1 }, { issue: 336 }, { maxModelRuns: 5 }]) {
    assert.throws(() => enroll(emptyLedger(), { ...c, ...changed }, 0));
  }
  assert.throws(() => enroll(emptyLedger(), { ...c, tasks: [{ ...c.tasks[0], id: 'fixture-other-alias' }] }, 0));
  for (let n = 0; n < 4; n++) {
    reserve(s, id, `container-${n}`, n * 1000);
    finish(s, id, { container: `container-${n}`, stopped: true, passed: false }, n * 1000 + 100);
    if (n < 3) { authorizeRepair(s, id, { kind: 'mandatory-local-failure', head: null, reference: 'fixed-check' }); }
    s = JSON.parse(JSON.stringify(s));
  }
  assert.equal(s.batches[c.batchId].modelRuns, 4);
  assert.equal(s.tasks[id].reservedMs, 1200000);
  assert.equal(nextTask(s, c.batchId, 5000).reason, 'model-run-budget');
  assert.throws(() => enroll(s, { ...c, batchId: 'new-batch' }, 5000));
});

test('CLI設定は同じprovider境界を使い、実認証先を契約から変更させない', () => {
  const live = argumentsFor('workspace', 'schema');
  assert.ok(live.includes('--ignore-user-config'));
  assert.ok(live.includes('--ignore-rules'));
  assert.ok(live.includes('agents.enabled=false'));
  assert.ok(live.includes('forced_login_method="chatgpt"'));
  assert.ok(live.includes('model_providers.harness.request_max_retries=0'));
  assert.ok(!live.some(x => x.includes('localhost')));
});

test('ネイティブprocessのtimeout/cancel/登録失敗はcloseを待ち、kill送信を終了証拠にしない', async () => {
  const home = mkdtempSync(join(tmpdir(), 'roi-process-test-'));
  let pid;
  const slow = { bin: process.execPath, args: ['-e', 'setTimeout(()=>{},30000)'], home, prompt: '', timeoutMs: 100,
    onSpawn: value => { pid = value; } };
  const result = await invoke(slow);
  assert.equal(result.stopped, true);
  assert.throws(() => process.kill(pid, 0));
  const cancelled = await invoke({ ...slow, timeoutMs: 5000, cancelled: () => true });
  assert.equal(cancelled.stopped, true);
  await assert.rejects(invoke({ ...slow, onSpawn: value => { pid = value; throw new Error('registration'); } }), /model-registration-failed/);
  assert.throws(() => process.kill(pid, 0));
  await assert.rejects(invoke({ ...slow, cancelled: () => { throw new Error('ledger-lock'); } }), /model-cancellation-unconfirmed/);
  assert.throws(() => process.kill(pid, 0));
});
