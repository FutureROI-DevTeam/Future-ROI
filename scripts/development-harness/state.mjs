import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, fsyncSync } from 'node:fs';
import { join } from 'node:path';

export const repository = 'FutureROI-DevTeam/Future-ROI';
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const insist = (condition, message) => { if (!condition) { throw new Error(message); } };
const positive = value => Number.isSafeInteger(value) && value > 0;
export const reviewStates = ['artifacts-ready', 'draft-created', 'ci-wait', 'review-ready'];

// Only the measured fixture profile is enabled. A new scope needs a reviewed adapter,
// not instructions from an issue, candidate, log, or arbitrary command in JSON.
export function validateContract(c) {
  insist(c?.version === 1 && c.repository === repository && /^[a-z0-9-]{1,48}$/.test(c.batchId), 'invalid-contract');
  insist(c.mode === 'local-fixture' && c.publish === false, 'live-execution-disabled');
  insist(c.workers === 1 && c.reviewLimit === 1 && c.maxRepairs === 3, 'unsupported-capacity');
  insist(positive(c.attemptMs) && c.attemptMs > 15000 && c.attemptMs <= 60000 && positive(c.batchMs) && positive(c.taskMs), 'invalid-time-budget');
  insist(positive(c.lifetimeMs) && c.lifetimeMs <= 86400000, 'invalid-lifetime');
  insist(c.maxCostCents === 0, 'billable-execution-disabled');
  insist(Array.isArray(c.tasks) && c.tasks.length > 0 && c.tasks.length <= 10, 'finite-batch-required');
  const ids = new Set();
  for (const t of c.tasks) {
    insist(/^fixture-[a-z0-9-]{1,32}$/.test(t.id) && !ids.has(t.id), 'invalid-or-duplicate-task');
    ids.add(t.id);
    insist(typeof t.purpose === 'string' && t.purpose.length > 0 && t.purpose.length <= 300, 'purpose-required');
    insist(t.revision === 1 && t.profile === 'integer-addition-v1', 'unsupported-revision-or-profile');
    insist(JSON.stringify(t.allowedFiles) === JSON.stringify(['experiments/development-harness-fixture/answer.mjs']), 'forbidden-scope');
    insist(Array.isArray(t.dependencies) && t.dependencies.every(id => ids.has(id) && id !== t.id), 'dependency-order-or-cycle');
    insist(JSON.stringify(t.operations) === JSON.stringify(['apply-proposal', 'verify', 'prepare-draft']), 'forbidden-operation');
    insist(t.acceptance === 'integer-addition-v1; ci-report-regressions; sandbox-probe', 'acceptance-required');
    insist(t.exclusions === 'product,ci,harness,policy,auth,tests,publish,merge,deploy', 'exclusions-required');
  }
  return c;
}

export function emptyLedger() {
  return { version: 1, repository, tasks: {}, batches: {}, events: [], metrics: {
    humanSetupMinutes: null, humanOperationMinutes: null, humanReviewMinutes: null, humanRecoveryMinutes: null,
    totalCostCents: null, falseCompletionCount: null, acceptedValue: null,
  } };
}

export function enroll(s, c, now = Date.now()) {
  validateContract(c);
  const fingerprint = digest(c);
  if (s.batches[c.batchId]) {
    insist(s.batches[c.batchId].fingerprint === fingerprint, 'batch-contract-changed');
    return;
  }
  // Stable identity excludes revision and batch. Existing work must be reconciled, never reset.
  insist(c.tasks.every(t => !s.tasks[t.id]), 'existing-task-reconcile-first');
  s.batches[c.batchId] = { fingerprint, contract: c, reservedMs: 0, createdAt: now, expiresAt: now + c.lifetimeMs };
  for (const t of c.tasks) {
    s.tasks[t.id] = { batchId: c.batchId, revision: t.revision, state: 'eligible', attempts: 0,
      reservedMs: 0, actualMs: 0, active: null, cancelRequested: false, writeIntent: null,
      head: null, receipts: [], repair: null, resumeReason: null };
  }
}

export function nextTask(s, batchId, now = Date.now()) {
  const b = s.batches[batchId];
  insist(b, 'unknown-batch');
  if (Object.values(s.tasks).some(t => t.active)) { return { reason: 'worker-stop-unconfirmed' }; }
  if (now >= b.expiresAt) { return { reason: 'lifetime-budget' }; }
  for (const spec of b.contract.tasks) {
    const t = s.tasks[spec.id];
    if (!['eligible', 'repair-authorized'].includes(t.state) || t.cancelRequested || t.writeIntent) { continue; }
    if (spec.dependencies.some(id => s.tasks[id]?.state !== 'accepted')) { continue; }
    if (t.attempts >= 4 || t.reservedMs + b.contract.attemptMs > b.contract.taskMs ||
        b.reservedMs + b.contract.attemptMs > b.contract.batchMs) { continue; }
    const waiting = Object.entries(s.tasks).filter(([id, other]) => id !== spec.id && (reviewStates.includes(other.state) || other.repair));
    if (waiting.length >= b.contract.reviewLimit) { return { reason: 'review-capacity' }; }
    return { id: spec.id };
  }
  return { reason: 'no-authorized-work-or-budget' };
}

export function reserve(s, id, container, now = Date.now()) {
  const t = s.tasks[id];
  insist(t && nextTask(s, t.batchId, now).id === id, 'not-runnable');
  const b = s.batches[t.batchId];
  t.attempts += 1;
  t.reservedMs += b.contract.attemptMs;
  b.reservedMs += b.contract.attemptMs;
  t.active = { container, startedAt: now, attempt: t.attempts };
  t.state = 'implementing';
  t.resumeReason = null;
  s.events.push({ event: 'reserved', id, attempt: t.attempts, at: now });
}

export function requestCancel(s, id) {
  insist(s.tasks[id], 'unknown-task');
  s.tasks[id].cancelRequested = true;
  s.tasks[id].resumeReason = 'confirm-container-stopped-before-resume';
}

export function finish(s, id, receipt, now = Date.now()) {
  const t = s.tasks[id];
  insist(t?.active && receipt.container === t.active.container && receipt.stopped === true, 'stop-unconfirmed');
  t.actualMs += Math.max(0, now - t.active.startedAt);
  t.active = null;
  t.receipts.push(receipt);
  if (receipt.passed && !t.cancelRequested) {
    insist(/^[a-f0-9]{40}$/.test(receipt.head), 'head-required');
    t.head = receipt.head;
    t.state = 'artifacts-ready';
    t.repair = null;
    t.resumeReason = 'human-artifact-review; live-publisher-disabled';
  } else {
    t.state = 'awaiting-decision';
    t.resumeReason = t.cancelRequested ? 'cancelled; explicit-resume-required' : 'mandatory-local-check-failed';
  }
}

export function authorizeRepair(s, id, e) {
  const t = s.tasks[id];
  insist(t && !t.active && !t.writeIntent && !t.cancelRequested, 'reconcile-before-repair');
  insist(['awaiting-decision', ...reviewStates].includes(t.state), 'invalid-repair-state');
  insist(e && ['mandatory-local-failure', 'required-review-change', 'required-ci-failure'].includes(e.kind), 'mandatory-evidence-required');
  insist(e.head === t.head && typeof e.reference === 'string' && e.reference.length > 0, 'repair-head-or-reference');
  if (reviewStates.includes(t.state)) { insist(e.kind !== 'mandatory-local-failure', 'review-head-frozen'); }
  t.repair = e;
  t.state = 'repair-authorized';
}

export function resumeCancelled(s, id) {
  const t = s.tasks[id];
  insist(t?.cancelRequested && !t.active && !t.writeIntent, 'stop-or-write-unconfirmed');
  t.cancelRequested = false;
  t.state = 'repair-authorized';
}

// Protocol tests only; no network writer exists. An ambiguous write always needs reconciliation.
export function beginWrite(s, id, i) {
  const t = s.tasks[id];
  insist(t?.state === 'artifacts-ready' && !t.active && !t.cancelRequested && !t.writeIntent, 'write-not-allowed');
  insist(i.head === t.head && i.repository === repository && i.base === 'main' &&
    i.branch === `harness/${id}` && i.operation === 'draft-pr', 'invalid-write-intent');
  t.writeIntent = i;
  t.state = 'write-unknown';
}

export function reconcileWrite(s, id, observed) {
  const t = s.tasks[id];
  insist(t?.writeIntent, 'no-write-intent');
  const i = t.writeIntent;
  insist(observed?.complete === true && observed.matches?.length === 1, 'write-still-unknown');
  const pr = observed.matches[0];
  insist(pr.head === i.head && pr.repository === i.repository && pr.branch === i.branch && pr.base === i.base &&
    pr.draft === true && positive(pr.number), 'write-mismatch');
  t.pr = pr.number;
  t.writeIntent = null;
  t.state = 'draft-created';
}

export function assessCI(t, evidence, expected) {
  insist(['draft-created', 'ci-wait', 'review-ready'].includes(t.state), 'not-published');
  t.state = 'ci-wait';
  if (!expected.length || !Array.isArray(evidence) || evidence.length !== expected.length) { return false; }
  const valid = expected.every(e => {
    const matches = evidence.filter(r => r.workflow === e.workflow && r.job === e.job && r.producer === e.producer);
    if (matches.length !== 1) { return false; }
    const r = matches[0];
    return r.repository === repository && r.head === t.head && r.checkout === e.checkout &&
      r.run === e.run && r.attempt === e.attempt && positive(r.run) && positive(r.attempt) &&
      /^[a-f0-9]{40}$/.test(r.checkout) && r.conclusion === 'success' && r.status === 'completed' && r.unrun === 0;
  });
  if (valid) { t.state = 'review-ready'; }
  return valid;
}

export function acceptFixture(s, id) {
  const t = s.tasks[id];
  insist(t?.state === 'artifacts-ready' && !t.active && !t.writeIntent && !t.cancelRequested, 'artifact-not-reviewable');
  t.state = 'accepted';
  t.resumeReason = 'local-fixture-accepted; no-real-issue-closed';
}

export function initialize(directory) {
  mkdirSync(directory, { recursive: true });
  const fd = openSync(join(directory, 'ledger.json'), 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(emptyLedger(), null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}

export function transaction(directory, action) {
  const lock = join(directory, 'ledger.lock');
  const fd = openSync(lock, 'wx', 0o600);
  try {
    const s = JSON.parse(readFileSync(join(directory, 'ledger.json'), 'utf8'));
    insist(s.version === 1 && s.repository === repository && s.tasks && s.batches, 'invalid-ledger');
    const result = action(s);
    const out = openSync(join(directory, 'ledger.next'), 'w', 0o600);
    try { writeFileSync(out, JSON.stringify(s, null, 2) + '\n'); fsyncSync(out); } finally { closeSync(out); }
    renameSync(join(directory, 'ledger.next'), join(directory, 'ledger.json'));
    return result;
  } finally { closeSync(fd); unlinkSync(lock); }
}
