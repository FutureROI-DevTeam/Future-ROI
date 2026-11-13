import { readFileSync } from 'node:fs';
import { initialize, transaction, enroll, nextTask, requestCancel, resumeCancelled, authorizeRepair, acceptFixture, acknowledgeReview, recordMetrics } from './state.mjs';
import { runOne, recover } from './runtime.mjs';
import { runDocument } from './docs-runtime.mjs';
import { publishDraft, observeCI } from './github.mjs';

const [action, directory, target, input] = process.argv.slice(2);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
try {
  if (!directory) { throw new Error('usage: cli.mjs init|enroll|status|run|cancel|recover|resume|repair|accept-fixture STATE_DIR [TARGET] [INPUT]'); }
  let result;
  switch (action) {
    case 'init': initialize(directory); result = { state: 'initialized' }; break;
    case 'enroll': transaction(directory, s => enroll(s, json(target))); result = { state: 'enrolled' }; break;
    case 'status': result = transaction(directory, s => s); break;
    case 'measure': transaction(directory, s => recordMetrics(s, json(target))); result = { state: 'metrics-recorded' }; break;
    case 'cancel': transaction(directory, s => requestCancel(s, target)); result = { state: 'cancel-requested' }; break;
    case 'recover': recover(directory, target); result = { state: 'stopped; awaiting-decision' }; break;
    case 'resume': transaction(directory, s => resumeCancelled(s, target)); result = { state: 'resume-authorized' }; break;
    case 'repair': transaction(directory, s => authorizeRepair(s, target, json(input))); result = { state: 'repair-authorized' }; break;
    case 'accept-fixture': transaction(directory, s => acceptFixture(s, target)); result = { state: 'local-fixture-accepted; no-issue-close' }; break;
    case 'acknowledge-review': transaction(directory, s => acknowledgeReview(s, target, json(input))); result = { state: 'artifact-review-acknowledged; no-issue-close' }; break;
    case 'publish': result = publishDraft(directory, target); break;
    case 'ci': result = observeCI(directory, target); break;
    case 'prepare-issue': result = await runDocument(directory, target); if (result.state !== 'artifacts-ready') { process.exitCode = 1; } break;
    case 'run-issues': {
      const results = [];
      for (;;) {
        const next = transaction(directory, s => nextTask(s, target));
        if (!next.id) { results.push(next); break; }
        const outcome = await runDocument(directory, target); results.push(outcome);
        if (outcome.state !== 'artifacts-ready') { process.exitCode = 1; break; }
        results.push(publishDraft(directory, next.id)); results.push(observeCI(directory, next.id));
      }
      result = results; break;
    }
    case 'run-codex':
    case 'run': {
      // Reusable finite serial loop. No scheduler, discovery of extra work, or per-Issue question.
      const proposals = action === 'run' ? json(input) : null;
      const results = [];
      for (;;) {
        const next = transaction(directory, s => nextTask(s, target));
        if (!next.id) { results.push(next); break; }
        if (proposals && !proposals[next.id]) { results.push({ reason: 'proposal-required', id: next.id }); break; }
        const outcome = await runOne(directory, target, proposals?.[next.id]);
        results.push(outcome);
        if (outcome.state !== 'artifacts-ready') {
          // Only mandatory local output failures justify autonomous repair. Auth, quota,
          // unknown termination and optional suggestions do not authorize another call.
          const repaired = action === 'run-codex' && transaction(directory, s => {
            const t = s.tasks[next.id];
            if (t.active || t.cancelRequested || t.state !== 'awaiting-decision' ||
                !['behavior-failed', 'forbidden-proposal'].includes(t.receipts.at(-1)?.diagnostic)) { return false; }
            authorizeRepair(s, next.id, { kind: 'mandatory-local-failure', head: t.head,
              reference: `attempt-${t.attempts}-fixed-acceptance-failed` });
            return true;
          });
          if (repaired) { continue; }
          process.exitCode = 1; break;
        }
      }
      result = results;
      break;
    }
    default: throw new Error('unsupported-action; publisher-disabled');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Commands are operator-facing. Do not echo raw OS errors containing candidate text/paths.
  console.error(JSON.stringify({ error: /^[a-z0-9; :|_\-[\]]+$/.test(error.message) ? error.message : 'operation-failed; inspect-trusted-state' }));
  process.exitCode = 1;
}
