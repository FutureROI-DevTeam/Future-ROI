// 本番CD（Issue #275）の判定器。配備してよいかの判断だけを行い、Secretや接続値は扱わない。
// 使い方:
//   node .github/scripts/deploy-gate.mjs gate     ロック取得後の最新mainのCI成功・CD有効を確認しsha/deploy/reasonを書く
//   node .github/scripts/deploy-gate.mjs head     対象SHAが今もmainの先頭かだけを確認する（promote直前）
//   node .github/scripts/deploy-gate.mjs schema FILE EXIT   db:checkの出力を ok / pending / stop に分類する
//   node .github/scripts/deploy-gate.mjs deployment FILE    Vercel deploymentのJSONが対象SHAの本番buildか確認する
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Application / Foundation の必須job名（required check名と同じ）。名前を変えたらここも更新する。
export const REQUIRED_JOBS = Object.freeze({
  Application: ['Production install and Vercel bundle smoke', 'Install, typecheck, test, build', 'Container build and smoke test'],
  Foundation: ['Repository checks'],
});

const SHA = /^[0-9a-f]{40}$/;

// runs: GitHub APIのworkflow run（name, head_sha, head_branch, event, status, conclusion, id, run_attempt）
// jobsByRunId: run idごとのjob一覧（name, conclusion）
export function decideGate({ enabled, targetSha, mainSha, runs, jobsByRunId, blockedBySwitch = false }) {
  if (!enabled) return { deploy: false, reason: 'cd-disabled' };
  if (blockedBySwitch) return { deploy: false, reason: 'previous-switch-needs-review' };
  if (!SHA.test(targetSha ?? '') || !SHA.test(mainSha ?? '')) return { deploy: false, reason: 'invalid-sha' };
  if (targetSha !== mainSha) return { deploy: false, reason: 'not-main-head' };
  for (const [workflow, jobNames] of Object.entries(REQUIRED_JOBS)) {
    const candidates = runs.filter(run => run.name === workflow && run.head_sha === targetSha
      && run.event === 'push' && run.head_branch === 'main');
    if (candidates.length === 0) return { deploy: false, reason: `waiting:${workflow}` };
    // 同じSHAの再実行があれば最新のrunだけを見る。古い成功で新しい失敗を上書きしない。
    const latest = candidates.reduce((a, b) => (b.id > a.id || (b.id === a.id && b.run_attempt > a.run_attempt) ? b : a));
    if (latest.status !== 'completed') return { deploy: false, reason: `waiting:${workflow}` };
    if (latest.conclusion !== 'success') return { deploy: false, reason: `ci-failed:${workflow}` };
    const jobs = jobsByRunId[latest.id] ?? [];
    for (const name of jobNames) {
      const job = jobs.filter(j => j.name === name);
      if (job.length !== 1) return { deploy: false, reason: `job-missing:${name}` };
      if (job[0].conclusion !== 'success') return { deploy: false, reason: `job-not-success:${name}` };
    }
  }
  return { deploy: true, reason: 'ci-passed' };
}

// db:checkの結果を分類する。pendingは「アプリの追加migrationだけが未適用」の場合に限る。
// 空DB・認証schemaの差・checksum不一致・不明な履歴・判定不能はすべてstop（人が確認する）。
export function classifySchema(report, exitCode) {
  if (exitCode === 0 && report?.status === 'ok') return 'ok';
  if (exitCode !== 1 || report?.status !== 'drift') return 'stop';
  const app = report.app;
  if (!app || app.historyTable !== 'present' || app.pending.length === 0) return 'stop';
  if (app.checksumMismatch.length || app.unknownHistory.length) return 'stop';
  if (!report.findings.every(f => f.code === 'pending_migration')) return 'stop';
  return 'pending';
}

// db:checkの標準出力から結果JSON（1行）を取り出す。npmのbannerや警告は無視する。
export function parseSchemaReport(text) {
  const line = text.split(/\r?\n/).reverse().find(l => l.startsWith('{"version":'));
  return line ? JSON.parse(line) : null;
}

// Vercelのdeployment（/v13/deployments）が、対象SHAで作った本番向けbuildかを確認する。
export function checkDeployment(deployment, targetSha) {
  if (!deployment) return 'missing';
  if (deployment.readyState !== 'READY') return `not-ready:${deployment.readyState}`;
  if (deployment.target !== 'production') return `not-production:${deployment.target}`;
  if (deployment.meta?.cdSha !== targetSha) return 'sha-mismatch';
  return 'ok';
}

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitHub API ${path.split('?')[0]} -> ${response.status}`);
  return response.json();
}

const mainHead = async () => (await github('/git/ref/heads/main')).object.sha;

// gate-only/skip runs must not hide a switch that failed or was force-cancelled.
// The operator inspects it and re-runs that entire run; never automatically unblock it.
export function switchBlocks(jobs) {
  const job = jobs.find(j => j.name === 'Reconcile production switch');
  return job && job.conclusion !== 'skipped' ? job.conclusion !== 'success' : null;
}

// Newest switch result in a run's attempts, from fromAttempt down to 1.
// A whole-run retry can skip switch (e.g. CI still waiting, or production already
// runs the SHA). That must not erase an earlier unresolved switch of the same run.
async function newestSwitch(api, runId, fromAttempt) {
  for (let attempt = fromAttempt; attempt >= 1; attempt--) {
    const { jobs } = await api(`/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`);
    const blocked = switchBlocks(jobs);
    if (blocked !== null) return { attempt, blocked };
  }
  return null;
}

// The newest switch outside the current run decides. Returns the run/attempt that
// still needs review, or null.
async function previousSwitchBlocks(api, currentRunId) {
  for (let page = 1; ; page++) {
    const { workflow_runs: runs } = await api(`/actions/workflows/deploy-production.yml/runs?branch=main&per_page=100&page=${page}`);
    for (const run of runs) {
      if (String(run.id) === currentRunId) continue;
      const newest = await newestSwitch(api, run.id, run.run_attempt ?? 1);
      if (newest) return newest.blocked ? { run: run.id, attempt: newest.attempt } : null;
    }
    if (runs.length < 100) return null;
  }
}

export async function evaluateCurrentMain({ enabled, api, currentRunId, currentAttempt = 1 }) {
  // Even with CD disabled, a no-op retry must not look like recovery. Read only
  // this run's history before returning; ordinary disabled runs need no API calls.
  const retry = {};
  if (currentRunId && currentAttempt > 1 && (await newestSwitch(api, currentRunId, currentAttempt - 1))?.blocked) {
    retry.retry_of_failed_switch = 'true';
  }
  if (!enabled) return { deploy: false, reason: 'cd-disabled', ...retry };
  const mainSha = (await api('/git/ref/heads/main')).object.sha;
  const { workflow_runs: runs } = await api(`/actions/runs?head_sha=${mainSha}&event=push&branch=main&per_page=100`);
  const jobsByRunId = {};
  for (const run of runs.filter(r => Object.hasOwn(REQUIRED_JOBS, r.name) && r.status === 'completed')) {
    jobsByRunId[run.id] = (await api(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)).jobs;
  }
  const blocker = await previousSwitchBlocks(api, currentRunId);
  const result = { sha: mainSha, ...retry, ...decideGate({ enabled, targetSha: mainSha, mainSha, runs, jobsByRunId,
    blockedBySwitch: blocker !== null }) };
  if (blocker) result.blocked_by = `${blocker.run}/attempts/${blocker.attempt}`;
  return result;
}

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  for (const line of lines) console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
}

async function main([mode, ...args]) {
  const targetSha = process.env.TARGET_SHA;
  if (mode === 'gate') {
    const enabled = process.env.CD_ENABLED === 'true';
    // workflow_run is a wake-up, not the target. This runs AFTER the workflow lock:
    // if stale A replaces pending B, A still reconciles the current deployable main B.
    output(await evaluateCurrentMain({ enabled, api: github, currentRunId: process.env.GITHUB_RUN_ID,
      currentAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1) }));
  } else if (mode === 'head') {
    const mainSha = await mainHead();
    if (mainSha !== targetSha) { output({ head: 'false' }); process.exitCode = 1; return; }
    output({ head: 'true' });
  } else if (mode === 'schema') {
    const report = parseSchemaReport(readFileSync(args[0], 'utf8'));
    output({ schema: classifySchema(report, Number(args[1])) });
  } else if (mode === 'deployment') {
    const result = checkDeployment(JSON.parse(readFileSync(args[0], 'utf8')), targetSha);
    output({ deployment: result });
    if (result !== 'ok') process.exitCode = 1;
  } else {
    console.error('usage: deploy-gate.mjs gate|head|schema FILE EXIT|deployment FILE');
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2));
