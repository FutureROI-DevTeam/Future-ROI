import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withResponseInterception } from './response-interception.mjs';

const patterns = [{ urlPattern: 'http://127.0.0.1/api/goals*', requestStage: 'Response' }];
function fixture({ enableError, disableError, latePause = false } = {}) {
  const listeners = new Set(), calls = [];
  let enabled = false;
  const pause = requestId => {
    for (const listener of listeners) listener({ data: JSON.stringify({ method: 'Fetch.requestPaused', params: { requestId } }) });
  };
  const cdp = {
    socket: {
      addEventListener: (_, listener) => listeners.add(listener),
      removeEventListener: (_, listener) => listeners.delete(listener),
    },
    async send(method, params) {
      calls.push([method, params?.requestId]);
      if (method === 'Fetch.enable') {
        enabled = true;
        if (enableError) throw enableError;
      } else if (method === 'Fetch.disable') {
        enabled = false;
        // A pause already in transit arrives before disable's acknowledgement.
        if (latePause) pause('late');
        await Promise.resolve();
        if (disableError) throw disableError;
      } else if (!enabled) throw new Error('Fetch domain is not enabled');
    },
  };
  const onPaused = paused => cdp.send('Fetch.continueRequest', { requestId: paused.requestId });
  return { cdp, pause, calls, listeners, onPaused };
}

test('a late pause during disable cannot send a command to the disabled domain', async () => {
  const f = fixture({ latePause: true });
  assert.equal(await withResponseInterception(f.cdp, { patterns, onPaused: f.onPaused }, async () => 'done'), 'done');
  assert.deepEqual(f.calls.map(([method]) => method), ['Fetch.enable', 'Fetch.disable']);
  assert.equal(f.listeners.size, 0);
});

test('shutdown drains every started handler before disabling, even when one fails', async () => {
  const f = fixture(), gate = Promise.withResolvers(), started = Promise.withResolvers();
  const failure = new Error('handler assertion');
  let count = 0;
  const operation = withResponseInterception(f.cdp, { patterns, onPaused: async paused => {
    if (++count === 2) started.resolve();
    if (paused.requestId === 'bad') throw failure;
    await gate.promise;
    await f.onPaused(paused);
  } }, async () => { f.pause('bad'); f.pause('slow'); });
  const rejected = assert.rejects(operation, error => error.errors.includes(failure));
  await started.promise;
  await Promise.resolve();
  assert.equal(f.calls.some(([method]) => method === 'Fetch.disable'), false);
  gate.resolve();
  await rejected;
  assert.deepEqual(f.calls.map(([method]) => method), ['Fetch.enable', 'Fetch.continueRequest', 'Fetch.disable']);
  assert.equal(f.listeners.size, 0);
});

test('a final handler failure is reported without a subsequent UI evaluation', async () => {
  const f = fixture(), failure = new Error('final PUT assertion'), observed = [];
  await assert.rejects(withResponseInterception(f.cdp, { patterns,
    onPaused: () => { throw failure; }, onError: error => observed.push(error),
  }, async () => { f.pause('last'); }), error => error.errors.includes(failure));
  assert.deepEqual(observed, [failure]);
  assert.equal(f.listeners.size, 0);
});

for (const phase of ['enable', 'run', 'disable']) {
  test(`${phase} failure still removes the listener and reports the failure`, async () => {
    const failure = new Error(phase), f = fixture({ [phase + 'Error']: failure });
    let ran = false;
    await assert.rejects(withResponseInterception(f.cdp, { patterns, onPaused: f.onPaused }, async () => {
      ran = true;
      if (phase === 'run') throw failure;
    }), error => error.errors.includes(failure));
    assert.equal(ran, phase !== 'enable');
    assert.equal(f.listeners.size, 0);
    assert.equal(f.calls.at(-1)[0], 'Fetch.disable');
  });
}
