// Trusted publisher: no candidate commands, tokens, issue instructions or merge API.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { repository, transaction } from './state.mjs';
import { command } from './runtime.mjs';
import { isCode, validateCodeDiff } from './code-profile.mjs';
const limits = new AsyncLocalStorage();
export function remaining(maximum = 20000) {
  const left = (limits.getStore()?.deadline ?? Date.now() + maximum) - Date.now();
  if (left <= 0) { throw new Error('operation-time-budget'); }
  return Math.min(maximum, left);
}
export function accounted(directory, id, milliseconds, action, reconciliation = false) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) { throw new Error('invalid-operation-budget'); }
  const started = Date.now();
  transaction(directory, s => {
    const t = s.tasks[id], b = s.batches[t.batchId];
    if (![t.reservedMs, b.reservedMs, t.actualMs].every(n => Number.isSafeInteger(n) && n >= 0)) { throw new Error('invalid-ledger-budget'); }
    if (!reconciliation && (started + milliseconds > b.expiresAt || t.reservedMs + milliseconds > b.contract.taskMs || b.reservedMs + milliseconds > b.contract.batchMs)) { throw new Error('operation-budget'); }
    t.reservedMs += milliseconds; b.reservedMs += milliseconds;
  });
  try { return limits.run({ deadline: started + milliseconds }, action); }
  finally {
    transaction(directory, s => { const t = s.tasks[id], b = s.batches[t.batchId], elapsed = Date.now() - started;
      t.actualMs += elapsed; t.reservedMs += Math.max(0, elapsed - milliseconds); b.reservedMs += Math.max(0, elapsed - milliseconds);
      s.events.push({ event: 'external-operation', id, at: started, reservedMs: milliseconds, actualMs: elapsed }); });
  }
}

function request(path, body, raw = false) {
  if (!path.startsWith(`repos/${repository}/`)) { throw new Error('foreign-repository'); }
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
    .filter(k => process.env[k]).map(k => [k, process.env[k]]));
  const result = execFileSync('gh', ['api', '--method', body ? 'POST' : 'GET', path, ...(raw ? ['--allow-escape-sequences'] : []), ...(body ? ['--input', '-'] : [])],
    { env, encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, timeout: remaining(), maxBuffer: 16777216, windowsHide: true });
  return raw ? result : JSON.parse(result);
}
export const api = (path, body) => request(path, body);
const endpoint = path => `repos/${repository}/${path}`;
export function pages(path, field, read = api) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    remaining();
    const data = read(endpoint(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`));
    const rows = field ? data[field] : data;
    if (!Array.isArray(rows)) { throw new Error('incomplete-github-observation'); }
    all.push(...rows); if (rows.length < 100) { return all; }
  }
  throw new Error('incomplete-github-observation');
}
export function classifyWork(spec, task, refs, prs, localRefs = []) {
  const branchRef = new RegExp(`(?:^|[/_-])${spec.issue}(?:$|[/_-])`);
  const relevant = prs.filter(p => p.head?.ref === spec.branch || branchRef.test(p.head?.ref ?? '') || p.scopeOverlap ||
    (p.body ?? '').includes(`<!-- future-roi-harness:issue-${spec.issue} -->`));
  if (relevant.some(p => p.head?.ref !== spec.branch || p.base?.ref !== 'main' || p.head?.repo?.full_name !== repository ||
      p.state !== 'open' || !p.draft || ![task.head, ...(task.pr ? [task.pushedHead] : [])].includes(p.head.sha) || (task.pr && p.number !== task.pr))) { throw new Error('existing-pr-conflict'); }
  if (relevant.length > 1 || (task.pr && relevant.length !== 1)) { throw new Error('ambiguous-existing-pr'); }
  for (const ref of [...refs, ...localRefs]) {
    if (branchRef.test(ref.branch) && (ref.branch !== spec.branch || ![task.head, ...(task.pr ? [task.pushedHead] : [])].includes(ref.sha) || !task.head)) { throw new Error('existing-branch-conflict'); }
  }
  return { pr: relevant[0] ?? null, remote: refs.find(r => r.branch === spec.branch) ?? null };
}
export function observeWork(spec, task, read = api) {
  const branches = pages('branches', null, read).map(b => ({ branch: b.name, sha: b.commit.sha }));
  const prs = pages('pulls?state=all', null, read);
  // A mention in the implementation PR is not a second execution of the demonstration.
  // Inspect the referenced PR's actual paths; do not ignore an overlap under another branch.
  const issueRef = new RegExp(`(?:#|issues/)${spec.issue}(?![0-9])`);
  const issueDocument = new RegExp(`^docs/changes/issue-${spec.issue}-[a-z0-9-]+\\.md$`);
  for (const pr of prs.filter(p => p.state === 'open' || issueRef.test(p.body ?? ''))) {
    pr.scopeOverlap = pages(`pulls/${pr.number}/files`, null, read).some(f => [f.filename, f.previous_filename].filter(Boolean).some(path =>
      spec.allowedFiles.includes(path) || issueDocument.test(path)));
  }
  const local = command('git', ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads']).trim().split(/\r?\n/).filter(Boolean)
    .map(line => { const [branch, sha] = line.split(' '); return { branch, sha }; });
  return classifyWork(spec, task, branches, prs, local);
}
export function verifyCandidate(contract, spec, head) {
  const diff = command('git', ['diff', '--raw', '--no-abbrev', contract.baseSha, head]).trim().split(/\r?\n/);
  if (isCode(contract)) {
    validateCodeDiff(diff);
  } else if (diff.length !== 1 || !diff[0].startsWith(':000000 100644 ') || !diff[0].endsWith(` A\t${spec.allowedFiles[0]}`)) { throw new Error('candidate-diff-forbidden'); }
  command('git', ['merge-base', '--is-ancestor', contract.baseSha, head]);
}
export function publishDraft(directory, id, io) {
  const t = transaction(directory, s => {
    const task = s.tasks[id], c = s.batches[task?.batchId]?.contract;
    if (!task || !(c?.mode === 'codex-issue-docs' || c && isCode(c)) || c.publish !== true) { throw new Error('publish-not-authorized'); }
    if (isCode(c) && (task.codeReview?.head !== task.head || task.codeReview?.blocking !== 0)) { throw new Error('code-review-evidence-required'); }
    return { task, budget: c.publishMs };
  });
  return accounted(directory, id, t.budget, () => publish(directory, id, io), !!t.task.writeIntent);
}
function publish(directory, id, io = { read: api, observe: observeWork, push: (head, branch) => command('git', ['push', `https://github.com/${repository}.git`, `${head}:refs/heads/${branch}`], { timeout: remaining(60000) }) }) {
  const snapshot = () => transaction(directory, s => {
    const t = s.tasks[id], c = s.batches[t?.batchId]?.contract;
    if (!t || !(c.mode === 'codex-issue-docs' || isCode(c)) || !c.publish || t.active) { throw new Error('publish-not-authorized'); }
    if (isCode(c) && (t.codeReview?.head !== t.head || t.codeReview?.blocking !== 0)) { throw new Error('code-review-evidence-required'); }
    return { task: t, contract: c, spec: c.tasks.find(x => x.id === id) };
  });
  let { task, contract, spec } = snapshot();
  (io.verify ?? verifyCandidate)(contract, spec, task.head);
  let observed = io.observe(spec, task, io.read);
  // A lost response only permits observation. Absence is not permission to retry a write.
  if (task.writeIntent) {
    const i = task.writeIntent;
    const reconcile = update => transaction(directory, s => {
      const current = s.tasks[id];
      if (JSON.stringify(current.writeIntent) !== JSON.stringify(i) || current.head !== task.head || current.active) { throw new Error('write-intent-changed'); }
      update(current);
    });
    if (i.head !== task.head || i.branch !== spec.branch) { throw new Error('write-intent-mismatch'); }
    if (i.operation === 'push' && observed.remote?.sha === task.head) {
      reconcile(t => { t.writeIntent = null; t.state = 'artifacts-ready'; t.pushedHead = task.head; });
    } else if (i.operation === 'draft' && observed.pr) {
      reconcile(t => { t.writeIntent = null; t.pr = observed.pr.number; t.state = 'draft-created'; });
      return { pr: observed.pr.number, state: 'draft-created', reconciled: true };
    } else { throw new Error('write-still-unknown'); }
    ({ task } = snapshot());
  }
  if (task.cancelRequested) { return { state: 'cancelled; reconciled-only', pr: task.pr ?? null }; }
  if (observed.pr && observed.pr.head.sha === task.head && observed.remote?.sha === task.head) {
    if (!task.pr || task.pr !== observed.pr.number) { throw new Error('unowned-existing-pr'); }
    const state = transaction(directory, s => { if (s.tasks[id].state === 'artifacts-ready') { s.tasks[id].state = 'draft-created'; s.tasks[id].ci = null; } return s.tasks[id].state; });
    return { pr: task.pr, state };
  }
  if (!['artifacts-ready'].includes(task.state)) { throw new Error('not-publishable'); }
  // Reserve the entire bounded publisher operation before any write; never refund/reset it.
  const intent = operation => transaction(directory, s => {
    const t = s.tasks[id], b = s.batches[t.batchId];
    remaining();
    if (t.active || t.cancelRequested || t.writeIntent || t.head !== task.head || t.state !== task.state || t.pr !== task.pr || Date.now() > b.expiresAt ||
        t.reservedMs > contract.taskMs || b.reservedMs > contract.batchMs) { throw new Error('publish-budget-or-state'); }
    t.writeIntent = { id: randomUUID(), operation, head: task.head, branch: spec.branch, at: Date.now() }; t.state = 'write-unknown';
  });
  if (!observed.remote || observed.remote.sha !== task.head) {
    if (observed.remote) {
      if (!task.pr || observed.remote.sha !== task.pushedHead || observed.pr?.number !== task.pr) { throw new Error('unowned-existing-branch'); }
      (io.ancestor ?? ((oldHead, newHead) => command('git', ['merge-base', '--is-ancestor', oldHead, newHead])))(observed.remote.sha, task.head);
    }
    intent('push');
    io.push(task.head, spec.branch);
    // Even a successful response must be independently observed before the next operation.
    return publish(directory, id, io);
  }
  if (observed.remote.sha !== task.head || task.pushedHead !== task.head) { throw new Error('unowned-existing-branch'); }
  intent('draft');
  io.read(endpoint('pulls'), { head: spec.branch, base: 'main', draft: true,
    title: isCode(contract) ? `fix: #${spec.issue} の増減表示で整数部の桁落ちを防ぐ` : `docs: #${spec.issue} の比較資料を追加する`,
    body: `<!-- future-roi-harness:issue-${spec.issue} -->\n## 変更\n\n${spec.purpose}\n\nRefs #${spec.issue}\n\nハーネス #340 による実Issue成果物。採択・依存更新・Issue完了は含みません。\n\n## 検証\n\n固定main ${contract.baseSha} の検査を無認証のread-only環境で実行。候補head ${task.head}。PR後CIは確認待ち。総費用・人の時間は未計測。\n` });
  return publish(directory, id, io);
}

export const requiredJobs = {
  'Repository checks': '.github/workflows/foundation.yml',
  'Install, typecheck, test, build': '.github/workflows/application.yml',
  'Container build and smoke test': '.github/workflows/application.yml',
  'Production install and Vercel bundle smoke': '.github/workflows/application.yml',
};
export const requiredSteps = {
  'Repository checks': ['Check text encoding, local links, environment examples and diff whitespace', 'Check diagram synchronization regressions', 'Summarize verification'],
  'Install, typecheck, test, build': ['Install locked workspace dependencies', 'Test CI diagnostics and the production deploy gate', 'Typecheck', 'Test', 'Build', 'Test browser operations through the real API and isolated database', 'Test filesystem migration result checks', 'Run db:migrate on the empty service database, then again (must be a no-op)', 'Summarize verification'],
  'Container build and smoke test': ['Validate compose file', 'Verify Compose smoke midnight retry and missing-secret isolation', 'Build the single SPA/API container', 'Start, probe routes and stop with SIGTERM', 'Verify default Compose startup, restart, failure gates and volume retention', 'Summarize verification'],
  'Production install and Vercel bundle smoke': ['Install with the actual Vercel configuration', 'Build the self-contained Function without secrets or a database', 'Verify structure and source copy boundaries without full HTTP asset probing'],
};
export function checkoutEvidence(log) {
  const lines = log.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/);
  const shas = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (/\[command\].*git log -1 --format=%H\s*$/.test(lines[i])) {
      const match = /(?:^|\s)([a-f0-9]{40})\s*$/.exec(lines[i + 1]); if (match) { shas.push(match[1]); }
    }
  }
  const sources = [...log.matchAll(/CI_SOURCE_SHA:\s*([a-f0-9]{40})/g)].map(m => m[1]);
  return { checkout: shas.length === 1 ? shas[0] : null, source: sources.length && new Set(sources).size === 1 ? sources[0] : null };
}
export function validateChecks(head, checks, runs, jobs, checkout) {
  if (!/^[a-f0-9]{40}$/.test(checkout ?? '')) { return false; }
  return Object.entries(requiredJobs).every(([name, path]) => {
    const matching = checks.filter(c => c.name === name && c.head_sha === head && c.app?.id === 15368);
    if (matching.length !== 1) { return false; }
    const check = matching[0];
    const run = runs.find(r => r.check_suite_id === check.check_suite?.id && r.head_sha === head && r.path === path && r.event === 'pull_request');
    const job = jobs.find(j => j.id === check.id && j.run_id === run?.id && j.run_attempt === run?.run_attempt);
    return check.status === 'completed' && check.conclusion === 'success' && run?.status === 'completed' && run.conclusion === 'success' &&
      job?.conclusion === 'success' && job.checkoutEvidence?.checkout === checkout && job.checkoutEvidence?.source === head && job.steps.some(s => s.name === 'Set up job' && s.conclusion === 'success') &&
      requiredSteps[name].every(name => job.steps.filter(s => s.name === name && s.conclusion === 'success').length === 1) &&
      job.steps.every(s => s.conclusion === 'success' || (s.conclusion === 'skipped' && /Retain safe failure diagnostics|Upload Playwright/.test(s.name)));
  });
}
export function observeCI(directory, id, inspect = observeChecks) {
  const t = transaction(directory, s => {
      const task = s.tasks[id];
      if (!task?.pr || task.active || task.writeIntent || !['draft-created', 'ci-wait', 'review-ready'].includes(task.state)) { throw new Error('ci-not-published'); }
      task.state = 'ci-wait'; task.ciObservation = randomUUID();
      if (task.ci) { task.ci.passed = false; }
      task.resumeReason = 'ci-observation-incomplete; do-not-reuse-previous-success';
      return task;
  });
  return accounted(directory, id, 30000, () => inspect(directory, id, t));
}
export function saveCIObservation(s, id, observed, evidence) {
  const current = s.tasks[id];
  if (current.head !== observed.head || current.ciObservation !== observed.ciObservation || current.state !== 'ci-wait' || current.active || current.writeIntent || current.cancelRequested) { throw new Error('ci-head-or-state-race'); }
  current.ci = evidence; current.state = evidence.passed ? 'review-ready' : 'ci-wait';
  current.resumeReason = evidence.passed ? 'human-artifact-review; head-frozen; no-issue-close-or-adoption' : 'observe-required-ci-for-same-head';
}
function observeChecks(directory, id, t) {
  const pr = api(endpoint(`pulls/${t.pr}`));
  const contract = transaction(directory, s => s.batches[t.batchId].contract);
  if (api(endpoint('branches/main')).commit.sha !== contract.baseSha) { throw new Error('baseline-changed-revalidation-required'); }
  if (pr.head.sha !== t.head || !pr.draft || pr.state !== 'open' || pr.base.ref !== 'main') { throw new Error('published-head-changed'); }
  const checks = pages(`commits/${t.head}/check-runs?filter=latest`, 'check_runs');
  const runs = pages(`actions/runs?head_sha=${t.head}&event=pull_request`, 'workflow_runs');
  const relevant = runs.filter(r => Object.values(requiredJobs).includes(r.path));
  const jobs = relevant.flatMap(r => pages(`actions/runs/${r.id}/attempts/${r.run_attempt}/jobs`, 'jobs').map(j => ({ ...j, run_attempt: r.run_attempt })));
  for (const job of jobs.filter(j => Object.hasOwn(requiredJobs, j.name) && j.status === 'completed')) {
    job.checkoutEvidence = checkoutEvidence(request(endpoint(`actions/jobs/${job.id}/logs`), undefined, true));
  }
  const passed = validateChecks(t.head, checks, relevant, jobs, pr.merge_commit_sha);
  const evidence = { head: t.head, mergeCheckout: pr.merge_commit_sha, observedAt: Date.now(), checks, runs: relevant, jobs, passed };
  transaction(directory, s => saveCIObservation(s, id, t, evidence));
  return { state: passed ? 'review-ready' : 'ci-wait', pr: t.pr, head: t.head };
}
