import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import { countProblems, parseCounts, renderSummary, safeRecord } from './ci-report.mjs';

const counters = (tests = 2, skipped = 0) => ({ tests, pass: tests - skipped, fail: 0, cancelled: 0, skipped, todo: 0 });
const totals = counts => Object.entries(counts).map(([key, value]) => '# ' + key + ' ' + value).join('\n');
const workspaceOutput = ['prediction', 'api', 'web'].map(name => '> @futureroi/' + name + '@0.0.0 test\n' + totals(counters())).join('\n');

test('動的件数で欠落・zero・CI skip・重複・未完了を検出する', () => {
  assert.deepEqual(countProblems(parseCounts(workspaceOutput, true), true, true), []);
  assert.ok(countProblems(parseCounts(workspaceOutput.replace('> @futureroi/api', '> @other/api'), true), true, true).length);
  assert.deepEqual(countProblems({ tests: counters(0) }, false, true), ['tests:zero-tests']);
  assert.deepEqual(countProblems({ tests: counters(2, 1) }, false, true), ['tests:ci-skip']);
  assert.deepEqual(countProblems({ tests: counters(2, 1) }, false, false), []);
  assert.ok(countProblems(parseCounts(totals(counters()) + '\n# tests 2'), false, true).length);
  assert.ok(countProblems({ tests: { ...counters(), pass: 1 } }, false, true).length);
  assert.ok(countProblems({ tests: { ...counters(), pass: 1, cancelled: 1 } }, false, true).length);
  assert.deepEqual(parseCounts(totals(counters()).replaceAll('#', 'ℹ')), { tests: counters() });
});

test('allowlistだけ保存しSHAの区別と未実行を表示する', () => {
  const record = safeRecord({ layer: 'test', checkoutSha: 'a'.repeat(40), sourceSha: 'b'.repeat(40),
    status: 'passed', exitCode: 0, durationMs: 1000, scope: 'workspace-tests', counts: { web: counters(2, 1) },
    diagnostic: 'none', raw: 'private-cookie', token: 'private-cookie' });
  assert.equal(JSON.stringify(record).includes('private-cookie'), false);
  assert.equal(record.unrun, 1);
  assert.equal(safeRecord({ layer: 'test', counts: { api: { ...counters(), cancelled: 1, todo: 1 } } }).unrun, 2);
  const summary = renderSummary('application', [record]);
  assert.ok(summary.includes('a'.repeat(40)) && summary.includes('b'.repeat(40)));
  assert.ok(summary.includes('web: 2 / 1 / 0 / 1 / 1'));
  assert.ok(summary.includes('| typecheck | not-run | not-run |'));
  assert.throws(() => safeRecord({ layer: '../../private' }), /Unknown/);
  assert.ok(renderSummary('foundation', [], { checkoutSha: 'a'.repeat(40), sourceSha: 'b'.repeat(40) }).includes('a'.repeat(40)));
});

test('失敗codeを保持しrawログや秘密をartifactへ保存しない', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-report-test-'));
  const script = fileURLToPath(new URL('./ci-report.mjs', import.meta.url));
  try {
    await assert.rejects(promisify(execFile)(process.execPath, [script, 'run', 'typecheck', '--', process.execPath,
      '-e', 'console.error("private-cookie");process.exit(7)'],
    { env: { ...process.env, CI_REPORT_DIR: directory }, windowsHide: true }), (error) => error.code === 7);
    assert.deepEqual(readdirSync(directory).sort(), ['typecheck.json', 'typecheck.log']);
    for (const path of readdirSync(directory)) {
      assert.equal(readFileSync(join(directory, path), 'utf8').includes('private-cookie'), false);
    }
    const record = JSON.parse(readFileSync(join(directory, 'typecheck.json'), 'utf8'));
    assert.equal(record.exitCode, 7);
    assert.equal(record.status, 'failed');
  } finally {
    for (const path of readdirSync(directory)) rmSync(join(directory, path));
    rmdirSync(directory);
  }
});

test('spawn失敗と不完全なtest出力も失敗記録を残す', async () => {
  const script = fileURLToPath(new URL('./ci-report.mjs', import.meta.url));
  for (const [layer, command, args, diagnostic] of [
    ['build', '__ci_command_does_not_exist__', [], 'spawn-failure'],
    ['migration-tests', process.execPath, ['-e', 'console.log("# tests 0")'], 'count-gate'],
    ['browser-e2e', process.execPath, ['-e', 'console.log("# tests 0")'], 'count-gate'],
    ['browser-e2e', process.execPath, ['-e', 'console.log(' + JSON.stringify(totals(counters(2, 1))) + ')'], 'count-gate'],
  ]) {
    const directory = mkdtempSync(join(tmpdir(), 'ci-report-test-'));
    try {
      await assert.rejects(promisify(execFile)(process.execPath, [script, 'run', layer, '--', command, ...args],
        { env: { ...process.env, CI_REPORT_DIR: directory, GITHUB_ACTIONS: 'true' }, windowsHide: true }));
      assert.equal(JSON.parse(readFileSync(join(directory, layer + '.json'), 'utf8')).diagnostic, diagnostic);
    } finally {
      for (const path of readdirSync(directory)) rmSync(join(directory, path));
      rmdirSync(directory);
    }
  }
});

test('scopeごとの期待集計を表示し、欠落workspaceや不完全件数をcommandのN/Aにしない', () => {
  const record = counts => safeRecord({ layer: 'test', scope: 'workspace-tests', counts,
    status: 'failed', exitCode: 7, durationMs: 1000, diagnostic: 'command-failure' });
  const empty = renderSummary('application', [record({})]);
  for (const name of ['prediction', 'api', 'web']) assert.ok(empty.includes(name + ': 集計不明／未到達'));
  assert.equal(empty.includes('N/A (command check)'), false);

  const partial = renderSummary('application', [record({ prediction: counters() })]);
  assert.ok(partial.includes('prediction: 2 / 2 / 0 / 0 / 0'));
  for (const name of ['api', 'web']) assert.ok(partial.includes(name + ': 集計不明／未到達'));
  const incomplete = renderSummary('application', [
    safeRecord({ layer: 'migration-tests', scope: 'node-tests', counts: { tests: { tests: 2 } } }),
  ]);
  assert.ok(incomplete.includes('tests: 集計不明／未到達'));
  assert.equal(incomplete.includes('N/A (command check)'), false);

  const complete = renderSummary('application', [record(parseCounts(workspaceOutput, true))]);
  for (const name of ['prediction', 'api', 'web']) assert.ok(complete.includes(name + ': 2 / 2 / 0 / 0 / 0'));
  assert.equal(complete.includes('集計不明／未到達'), false);
  assert.ok(renderSummary('application', [
    safeRecord({ layer: 'build', scope: 'command', counts: {} }),
  ]).includes('N/A (command check)'));
});

test('workspace集計前・途中のexit 7を保持し、保存record経由のCLI summaryにも欠落を示す', async () => {
  const script = fileURLToPath(new URL('./ci-report.mjs', import.meta.url));
  const predictionOutput = '> @futureroi/prediction@0.0.0 test\n' + totals(counters());
  for (const output of ['', predictionOutput]) {
    const directory = mkdtempSync(join(tmpdir(), 'ci-report-test-'));
    const env = { ...process.env, CI_REPORT_DIR: directory, GITHUB_STEP_SUMMARY: '' };
    try {
      await assert.rejects(promisify(execFile)(process.execPath, [script, 'run', 'test', '--', process.execPath,
        '-e', 'process.stdout.write(' + JSON.stringify(output) + ');process.exit(7)'],
      { env, windowsHide: true }), error => error.code === 7);
      const record = JSON.parse(readFileSync(join(directory, 'test.json'), 'utf8'));
      assert.equal(record.exitCode, 7);
      assert.equal(record.status, 'failed');
      assert.equal(record.diagnostic, 'command-failure');
      assert.equal(record.scope, 'workspace-tests');
      const { stdout } = await promisify(execFile)(process.execPath, [script, 'summary', 'application'], { env, windowsHide: true });
      for (const name of output ? ['api', 'web'] : ['prediction', 'api', 'web']) {
        assert.ok(stdout.includes(name + ': 集計不明／未到達'));
      }
      if (output) assert.ok(stdout.includes('prediction: 2 / 2 / 0 / 0 / 0'));
      assert.equal(stdout.includes('N/A (command check)'), false);
    } finally {
      for (const path of readdirSync(directory)) rmSync(join(directory, path));
      rmdirSync(directory);
    }
  }
});
