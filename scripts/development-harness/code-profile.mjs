// Operator-reviewed scope. Issue text and contract JSON cannot add arbitrary paths/commands.
export const codeFiles = ['apps/web/src/features/logs/SaveFeedback.tsx', 'apps/web/src/features/today/DraftProgressPreview.tsx'];
export const codeProfile = 'issue-253-points-v1';
export function isCode(c) { return c.mode === 'codex-issue-code'; }
export function verifyBaselineChanges(paths, previous, next) {
  // This inspected main update merged #345's unrelated full-stack interception fix.
  // No general exemption for tests: loaders, imports, config and future changes fail closed.
  const inspected = previous === '7beba614697ecc3098cde122e2f0305842962812' && next === '40ddc510919d85884160d512009abe4e345a1a8f';
  const known = ['apps/web/tests/full-stack.browser-check.mjs','apps/web/tests/response-interception.mjs','apps/web/tests/response-interception.test.mjs'];
  if (paths.some(p => !p.endsWith('.md') && !p.startsWith('docs/') && !(inspected && known.includes(p)))) throw new Error('baseline-scope-or-checks-changed');
}
export function validateCodeDiff(lines) {
  if (lines.length !== codeFiles.length || codeFiles.some(path => lines.filter(line => /^:100644 100644 [a-f0-9]{40} [a-f0-9]{40} M\t/.test(line) && line.endsWith(` M\t${path}`)).length !== 1)) {
    throw new Error('candidate-diff-forbidden');
  }
}
export function validateCode(proposal) {
  if (Object.keys(proposal ?? {}).join() !== 'files' || JSON.stringify(Object.keys(proposal.files ?? {}).sort()) !== JSON.stringify([...codeFiles].sort()) ||
      codeFiles.some(p => typeof proposal.files[p] !== 'string' || Buffer.byteLength(proposal.files[p]) > 16384 || !proposal.files[p].endsWith('\n') || proposal.files[p].includes('\0'))) {
    throw new Error('forbidden-proposal');
  }
  return proposal.files;
}
export function recordCodeReview(s, id, evidence) {
  const t = s.tasks[id], c = s.batches[t?.batchId]?.contract;
  if (!c || !isCode(c) || t.state !== 'artifacts-ready' || t.active || t.writeIntent || t.cancelRequested ||
      evidence?.head !== t.head || evidence?.blocking !== 0 || typeof evidence.reference !== 'string' || !evidence.reference.trim()) {
    throw new Error('code-review-evidence-required');
  }
  t.codeReview = evidence;
}
// Only the trusted operator's checked baseline/image may move. Identity, scope,
// lifetime, attempts, history and all accumulated budgets remain unchanged.
export function refreshCodeContract(s, batchId, next, fingerprint) {
  const b = s.batches[batchId];
  if (!b || !isCode(b.contract) || !isCode(next) || JSON.stringify({ ...next, baseSha:b.contract.baseSha,validatorImage:b.contract.validatorImage }) !== JSON.stringify(b.contract) ||
      b.contract.tasks.some(spec=>{const t=s.tasks[spec.id];return t.active||t.writeIntent||t.head||t.pr||t.pushedHead||t.cancelRequested||!['eligible','repair-authorized','awaiting-decision'].includes(t.state);})) throw new Error('baseline-refresh-not-authorized');
  s.events.push({event:'code-baseline-refresh',at:Date.now(),batchId,previousFingerprint:b.fingerprint,previousBase:b.contract.baseSha,previousImage:b.contract.validatorImage,nextBase:next.baseSha,nextImage:next.validatorImage});
  b.contract = next; b.fingerprint = fingerprint;
}
