// Operator-reviewed scope. Issue text and contract JSON cannot add arbitrary paths/commands.
export const codeFiles = ['apps/web/src/features/logs/SaveFeedback.tsx', 'apps/web/src/features/today/DraftProgressPreview.tsx'];
export const codeProfile = 'issue-253-points-v1';
export function isCode(c) { return c.mode === 'codex-issue-code'; }
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
