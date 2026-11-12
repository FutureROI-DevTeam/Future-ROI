import { readFileSync } from 'node:fs';
import { initialize, transaction, enroll, nextTask, requestCancel, resumeCancelled, authorizeRepair, acceptFixture } from './state.mjs';
import { runOne, recover } from './runtime.mjs';

const [action, directory, target, input] = process.argv.slice(2);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
try {
  if (!directory) { throw new Error('usage: cli.mjs init|enroll|status|run|cancel|recover|resume|repair|accept-fixture STATE_DIR [TARGET] [INPUT]'); }
  let result;
  switch (action) {
    case 'init': initialize(directory); result = { state: 'initialized' }; break;
    case 'enroll': transaction(directory, s => enroll(s, json(target))); result = { state: 'enrolled' }; break;
    case 'status': result = transaction(directory, s => s); break;
    case 'cancel': transaction(directory, s => requestCancel(s, target)); result = { state: 'cancel-requested' }; break;
    case 'recover': recover(directory, target); result = { state: 'stopped; awaiting-decision' }; break;
    case 'resume': transaction(directory, s => resumeCancelled(s, target)); result = { state: 'resume-authorized' }; break;
    case 'repair': transaction(directory, s => authorizeRepair(s, target, json(input))); result = { state: 'repair-authorized' }; break;
    case 'accept-fixture': transaction(directory, s => acceptFixture(s, target)); result = { state: 'local-fixture-accepted; no-issue-close' }; break;
    case 'run': {
      // Reusable finite serial loop. No scheduler, discovery of extra work, or per-Issue question.
      const proposals = json(input);
      const results = [];
      for (;;) {
        const next = transaction(directory, s => nextTask(s, target));
        if (!next.id) { results.push(next); break; }
        if (!proposals[next.id]) { results.push({ reason: 'proposal-required', id: next.id }); break; }
        const outcome = runOne(directory, target, proposals[next.id]);
        results.push(outcome);
        if (outcome.state !== 'artifacts-ready') { break; }
      }
      result = results;
      break;
    }
    default: throw new Error('unsupported-action; publish-and-live-workers-disabled');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Commands are operator-facing. Do not echo raw OS errors containing candidate text/paths.
  console.error(JSON.stringify({ error: /^[a-z0-9; :|_\-[\]]+$/.test(error.message) ? error.message : 'operation-failed; inspect-trusted-state' }));
  process.exitCode = 1;
}
