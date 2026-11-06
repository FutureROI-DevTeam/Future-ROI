import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const jobLayers = {
  application: ['install', 'diagnostic-tests', 'typecheck', 'test', 'build', 'browser-e2e', 'migration-tests', 'migrate'],
  container: ['compose-config', 'smoke-script-tests', 'container-build', 'container-smoke', 'compose-smoke'],
  foundation: ['foundation'],
};
const allowedLayers = Object.values(jobLayers).flat();
const workspaces = ['prediction', 'api', 'web'];
const fields = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];

export function parseCounts(output, workspaceMode = false) {
  const results = {};
  let current = workspaceMode ? null : 'tests';
  for (const line of output.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const workspace = /^> @futureroi\/(prediction|api|web)@\S+ test$/.exec(line.trim());
    if (workspace) {
      current = workspace[1];
      continue;
    }

    const match = /^(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/.exec(line.trim());
    if (current && match) {
      // Multiple reporter totals for one suite are ambiguous; never silently take the last.
      results[current] ??= {};
      if (Object.hasOwn(results[current], match[1])) {
        results[current].ambiguous = true;
      }
      results[current][match[1]] = Number(match[2]);
    }
  }
  return results;
}

export function countProblems(counts, workspaceMode, ci) {
  const problems = [];
  for (const name of workspaceMode ? workspaces : ['tests']) {
    const count = counts[name];
    if (
      !count ||
      fields.some(field => !Number.isSafeInteger(count[field]) || count[field] < 0) ||
      count.ambiguous
    ) {
      problems.push(name + ':missing-or-ambiguous-counts');
      continue;
    }
    if (count.tests === 0) {
      problems.push(name + ':zero-tests');
    }
    if (count.pass + count.fail + count.cancelled + count.skipped + count.todo !== count.tests) {
      problems.push(name + ':inconsistent-counts');
    }
    if (count.fail || count.cancelled || count.todo) {
      problems.push(name + ':unfinished-or-failed');
    }
    if (ci && count.skipped) {
      problems.push(name + ':ci-skip');
    }
  }
  return problems;
}

// Output persisted to disk is an allowlist: never command arguments, raw logs, test names,
// exception messages, environment values, URLs, payloads, cookies or browser storage.
export function safeRecord(input) {
  if (!allowedLayers.includes(input.layer)) {
    throw new Error('Unknown CI layer');
  }

  const counts = {};
  for (const name of [...workspaces, 'tests']) {
    if (!input.counts?.[name]) {
      continue;
    }
    counts[name] = Object.fromEntries(
      fields
        .filter(key => Number.isSafeInteger(input.counts[name][key]) && input.counts[name][key] >= 0)
        .map(key => [key, input.counts[name][key]]),
    );
  }

  const sha = value => /^[a-f0-9]{40}$/.test(value ?? '') ? value : 'unavailable';
  return {
    layer: input.layer,
    checkoutSha: sha(input.checkoutSha),
    sourceSha: sha(input.sourceSha),
    exitCode: Number.isInteger(input.exitCode) ? input.exitCode : null,
    status: ['passed', 'failed', 'not-run'].includes(input.status) ? input.status : 'failed',
    durationMs: Number.isFinite(input.durationMs) && input.durationMs >= 0 ? Math.round(input.durationMs) : 0,
    scope: input.scope === 'workspace-tests' ? 'workspace-tests' : input.scope === 'node-tests' ? 'node-tests' : 'command',
    counts,
    unrun: Object.values(counts).reduce(
      (sum, count) => sum + (count.skipped ?? 0) + (count.cancelled ?? 0) + (count.todo ?? 0),
      0,
    ),
    diagnostic: ['none', 'count-gate', 'command-failure', 'spawn-failure'].includes(input.diagnostic) ? input.diagnostic : 'command-failure',
  };
}

export function renderSummary(job, records, metadata = {}) {
  if (!jobLayers[job]) {
    throw new Error('Unknown CI job');
  }

  const lines = [
    '## ' + job + ' verification',
    '',
    '| Layer | Result | Tests / pass / fail / skip / unrun | Duration (s) |',
    '| --- | --- | --- | --- |',
  ];
  for (const layer of jobLayers[job]) {
    const record = records.find(item => item.layer === layer);
    if (!record) {
      lines.push('| ' + layer + ' | not-run | not-run | — |');
      continue;
    }

    const expected = record.scope === 'workspace-tests' ? workspaces : record.scope === 'node-tests' ? ['tests'] : [];
    const display = expected.length ? expected.map(name => {
      const count = record.counts[name];
      // Reporter totals may be absent even when the command ran; never imply N/A or zero.
      if (!count || fields.some(field => !Number.isSafeInteger(count[field]) || count[field] < 0)) {
        return name + ': 集計不明／未到達';
      }
      return name + ': ' + [
        count.tests,
        count.pass,
        count.fail,
        count.skipped,
        count.skipped + count.cancelled + count.todo,
      ].join(' / ');
    }).join('<br>') : 'N/A (command check)';
    lines.push('| ' + layer + ' | ' + record.status + ' (' + record.diagnostic + ') | ' + display + ' | ' + (record.durationMs / 1000).toFixed(3) + ' |');
  }
  for (const [name, sha] of [
    ['Checkout SHA', records[0]?.checkoutSha ?? metadata.checkoutSha],
    ['Source HEAD SHA', records[0]?.sourceSha ?? metadata.sourceSha],
  ]) {
    lines.push('', name + ': ' + (sha ?? 'unavailable'));
  }
  lines.push('', 'Skipped/cancelled/todo tests are unrun. Local Web browser tests may be explicitly skipped; CI permits no skips. Command checks have no Node test count. Absence is not-run, never a zero-test PASS.');
  return lines.join('\n') + '\n';
}

function reportDirectory() {
  if (process.env.CI_REPORT_DIR) {
    return process.env.CI_REPORT_DIR;
  }
  if (process.env.RUNNER_TEMP) {
    return join(process.env.RUNNER_TEMP, 'ci-report');
  }
  throw new Error('CI_REPORT_DIR or RUNNER_TEMP is required');
}

async function runLayer(layer, command, args) {
  if (!allowedLayers.includes(layer) || !command) {
    throw new Error('Invalid CI command');
  }

  const directory = reportDirectory();
  mkdirSync(directory, { recursive: true });
  const start = performance.now();
  const workspaceMode = layer === 'test';
  const nodeTests = workspaceMode || ['diagnostic-tests', 'migration-tests', 'browser-e2e'].includes(layer);
  let output = '';
  // Both console streams remain visible in the job log. Only numeric summaries are retained.
  const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'] });
  for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      destination.write(chunk);
      output += chunk;
    });
  }
  const outcome = await new Promise(resolve => {
    child.once('error', () => resolve({ code: null, spawnFailed: true }));
    child.once('close', code => resolve({ code, spawnFailed: false }));
  });
  const counts = nodeTests ? parseCounts(output, workspaceMode) : {};
  const problems = nodeTests ? countProblems(counts, workspaceMode, process.env.GITHUB_ACTIONS === 'true') : [];
  let checkoutSha = 'unavailable';
  try {
    checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}

  const failed = outcome.code !== 0 || problems.length > 0;
  const record = safeRecord({
    layer,
    checkoutSha,
    sourceSha: process.env.CI_SOURCE_SHA,
    exitCode: outcome.code,
    status: failed ? 'failed' : 'passed',
    durationMs: performance.now() - start,
    scope: workspaceMode ? 'workspace-tests' : nodeTests ? 'node-tests' : 'command',
    counts,
    diagnostic: outcome.spawnFailed ? 'spawn-failure' : outcome.code !== 0 ? 'command-failure' : problems.length ? 'count-gate' : 'none',
  });
  writeFileSync(join(directory, layer + '.json'), JSON.stringify(record, null, 2) + '\n');
  writeFileSync(join(directory, layer + '.log'), [
    record.layer,
    record.status,
    record.diagnostic,
    'exit=' + record.exitCode,
    'durationMs=' + record.durationMs,
    JSON.stringify(record.counts),
  ].join('\n') + '\n');
  if (problems.length) {
    console.error('CI count gate: ' + problems.join(', '));
  }
  process.exitCode = outcome.code && outcome.code > 0 ? outcome.code : failed ? 1 : 0;
}

function summarize(job) {
  if (!jobLayers[job]) {
    throw new Error('Unknown CI job');
  }

  const directory = reportDirectory();
  const records = jobLayers[job].flatMap(layer => {
    const path = join(directory, layer + '.json');
    return existsSync(path) ? [safeRecord(JSON.parse(readFileSync(path, 'utf8')))] : [];
  });
  let checkoutSha = 'unavailable';
  try {
    checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}

  const metadata = safeRecord({ layer: jobLayers[job][0], checkoutSha, sourceSha: process.env.CI_SOURCE_SHA });
  const summary = renderSummary(job, records, metadata);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } else {
    process.stdout.write(summary);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, layer, separator, command, ...args] = process.argv.slice(2);
  if (mode === 'run' && separator === '--') {
    await runLayer(layer, command, args);
  } else if (mode === 'summary') {
    summarize(layer);
  } else {
    throw new Error('Use run LAYER -- COMMAND [ARGS] or summary JOB');
  }
}
