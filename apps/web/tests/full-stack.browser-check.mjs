import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createTestDatabase } from '../../api/tests/helpers/database.ts';
import { migrate } from '../../api/src/db/migrate.ts';
import { startStack } from '../../api/tests/helpers/stack.ts';
import { cleanupAll } from '../../api/tests/helpers/cleanup.ts';
import { launchBrowser } from './browser-startup.mjs';
import { selectE2eDatabaseUrl } from './e2e-database.mjs';

// This entry never loads .env. Reject an inherited production URL before opening any DB.
const databaseUrl = selectE2eDatabaseUrl();
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
else delete process.env.DATABASE_URL;

async function browserPath() {
  const candidates = process.env.TEST_BROWSER ? [process.env.TEST_BROWSER] : process.platform === 'win32' ? [
    join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  ] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Try installed browsers only. */ }
  }
  throw new Error('Chromium not found; set TEST_BROWSER (missing browser is not a skipped PASS)');
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

// The same production SPA, auth bridge, route handlers and migrations are used. Only
// clock, synthetic accounts, isolated DB and one lost HTTP response are controlled.
test('built SPA → real HTTP auth/API → isolated PostgreSQL', { timeout: 240_000 }, async t => {
  const started = performance.now();
  const webDist = fileURLToPath(new URL('../dist/', import.meta.url));
  await access(join(webDist, 'index.html'));
  const browser = await browserPath();
  const dir = await mkdtemp(join(tmpdir(), 'futureroi-full-stack-'));
  let db, stack, session, browserExited = false;
  t.after(async () => {
    await cleanupAll([
      async () => { if (session) { await session.stop(); browserExited = true; } },
      async () => { await stack?.close(); },
      async () => { await db?.close(); },
      async () => {
        if (session && !browserExited) {
          t.diagnostic('Browser exit unconfirmed; retaining its owned temporary profile');
          return;
        }
        if (!dir.startsWith(join(tmpdir(), 'futureroi-full-stack-'))) throw new Error('Unexpected browser profile location');
        await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      },
    ]);
    t.diagnostic(JSON.stringify({ layer: 'full-stack-browser', durationMs: Math.round(performance.now() - started) }));
  });
  db = await createTestDatabase();
  await migrate(db.pool);
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  // Freeze domain time for date/CAS determinism. Session expiry continues to use real time.
  const now = new Date();
  stack = await startStack(db, { baseURL: origin, webDist, now: () => now });
  await stack.app.listen({ host: '127.0.0.1', port });
  session = launchBrowser({ browser, profile: join(dir, 'profile'), signal: t.signal,
    args: ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--remote-debugging-port=0', '--user-data-dir=' + join(dir, 'profile'), 'about:blank'],
    // Do not persist CDP payloads, Cookie values, auth responses or browser storage.
    diagnostic: value => t.diagnostic(JSON.stringify({ browser: value.browserStartup ?? value.browserCleanup,
      elapsedMs: Math.round(value.elapsedMs ?? 0) })) });
  const cdp = await session.ready();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
  let interceptionError;
  const evaluate = async expression => {
    if (interceptionError) throw new Error('Controlled response interception failed', { cause: interceptionError });
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    // Exception descriptions can contain evaluated credentials; report a fixed message.
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  const until = async (expression, label) => {
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline) {
      t.signal.throwIfAborted();
      const value = await evaluate(expression);
      if (value) return value;
      await delay(40, undefined, { signal: t.signal });
    }
    throw new Error('UI condition timed out: ' + label);
  };
  const visible = 'e => !!e && e.getClientRects().length > 0 && !e.disabled';
  const element = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const button = text => `[...document.querySelectorAll('button')].find(e => (${visible})(e) && e.textContent.trim() === ${JSON.stringify(text)})`;
  const click = async (expression, label) => {
    await until(`(${visible})(${expression})`, label);
    const point = await evaluate(`(() => { const e=${expression}; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point });
  };
  const clickText = text => click(button(text), text);
  const input = async (selector, value) => {
    await until(`(${visible})(${element(selector)})`, 'input available');
    await evaluate(`(() => {const e=${element(selector)};e.focus();e.select();})()`);
    await cdp.send('Input.insertText', { text: String(value) });
    try {
      await until(`${element(selector)}?.value === ${JSON.stringify(String(value))}`, 'native input applied');
    } catch (error) {
      // Only fixed field identifiers and booleans: never input values, credentials or DOM text.
      const state = await evaluate(`(() => {const e=${element(selector)};return {
        present:!!e,focused:!!e && document.activeElement===e,disabled:e?.disabled===true,
        loginForm:document.querySelector('#auth-title')?.textContent==='ログイン',
        registerForm:document.querySelector('#auth-title')?.textContent==='新規登録'};})()`);
      t.diagnostic(JSON.stringify({ inputState: { field: selector, ...state } }));
      throw error;
    }
  };
  const navigate = async path => {
    await cdp.send('Page.navigate', { url: origin + path });
    await until('document.readyState === "complete"', 'document loaded');
  };
  const api = (method, path, body) => evaluate(`(async () => {
    const response=await fetch(${JSON.stringify(path)}, {method:${JSON.stringify(method)},
      ${body === undefined ? '' : `headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(body))},`}credentials:'same-origin'});
    const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null};
  })()`);
  const read = async path => { const result = await api('GET', path); assert.equal(result.status, 200); return result.body; };
  const credentials = tag => ({ email: `e2e-${tag}-${randomBytes(5).toString('hex')}@example.test`, password: randomBytes(18).toString('base64url') });
  const accountA = credentials('a'), accountB = credentials('b');
  const authenticate = async (mode, account) => {
    const path = await evaluate('location.pathname');
    if (path === '/login' && mode === 'register') {
      await click(element('.fr-auth__seg a[href^="/register"]'), 'in-app register tab');
      await until('location.pathname === "/register"', 'register route');
    } else if (path !== '/' + mode) await navigate('/' + mode);
    // History can show /register while async beforeLoad still retains the login form.
    // Both forms use the same field IDs; wait for the requested form's actual commit.
    const title = mode === 'register' ? '新規登録' : 'ログイン';
    const autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    const authFormReady = `location.pathname === ${JSON.stringify('/' + mode)}
      && document.querySelector('#auth-title')?.textContent === ${JSON.stringify(title)}
      && !!document.querySelector('.fr-auth__seg a[aria-current="page"][href^="/${mode}"]')
      && document.querySelector('#auth-password')?.autocomplete === ${JSON.stringify(autocomplete)}`;
    await until(authFormReady, 'committed auth form');
    await input('#auth-email', account.email);
    await input('#auth-password', account.password);
    await click(element('.fr-auth__form button[type="submit"]'), 'auth submit');
    await until('location.pathname === "/goals" && !!document.querySelector(".fr-goals__heading")', 'authenticated list');
  };
  const fillGoal = async (title, total = 25, initial = 5) => {
    await navigate('/goals/new');
    await input('#goal-title', title);
    for (const [field, amount] of [['totalRequired', total], ['initialProgress', initial]]) {
      await click(`document.querySelectorAll('input[name="goal-${field}-mode"]')[1]`, 'minutes input mode');
      await input('#goal-' + field, amount);
    }
    await input('#goal-sessionAmount', 10);
    for (let i = 0; i < 2; i++) await click(`document.querySelectorAll('.r11-qp input[value="MID"]')[${i}]`, 'answer question');
  };
  const openGoal = async id => {
    await navigate('/goals/' + id);
    await until('!!document.querySelector(".fr-progress__amount")', 'Today progress');
  };
  const assertProgress = async (id, amount) => {
    const goal = await read('/api/goals/' + id + '?view=r11');
    const today = await read('/api/goals/' + id + '/today?view=r11');
    assert.equal(goal.progressDone, amount);
    assert.equal(today.prediction.progress.done, amount);
    const label = `累計 ${Math.floor(amount / 60)}時間${amount % 60}分`;
    await until(`document.querySelector('.fr-progress__amount')?.textContent.startsWith(${JSON.stringify(label)})`, 'exact persisted UI amount');
    return goal;
  };
  const saveAmount = async amount => {
    await clickText('量を変更');
    await input('.fr-amount input', amount);
    await clickText('この量で記録');
    await until('!!document.querySelector("#fr-recorded-title, #fr-achieved-title") && !document.querySelector(".fr-amount")', 'record confirmed');
  };
  const changeRecord = () => clickText('記録を変更');
  const waitForRecord = async (goalId, status, amount) => {
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      t.signal.throwIfAborted();
      const rows = (await db.pool.query('select status, amount from action_log where goal_id=$1', [goalId])).rows;
      if (rows.length === 1 && rows[0].status === status && rows[0].amount === amount) return;
      await delay(40, undefined, { signal: t.signal });
    }
    throw new Error('Browser write did not reach the expected single persisted record');
  };
  const logout = async () => {
    await click(`[...document.querySelectorAll('button[aria-haspopup="dialog"]')].find(${visible})`, 'account menu');
    await clickText('ログアウト');
    await until('location.pathname === "/login" && !!document.querySelector("#auth-email")', 'logout completed');
  };
  let goalA, recoveryGoal;

  await t.test('UI signup/create, independent fixed calculation, record/correct/reload exact DB quantities', async () => {
    await authenticate('register', accountA);
    await fillGoal('E2E owner A private goal');
    await clickText('保存する');
    await until('location.pathname === "/goals"', 'goal created');
    const goals = await read('/api/goals');
    assert.equal(goals.length, 1);
    goalA = goals[0];
    await openGoal(goalA.id);
    const initial = await read(`/api/goals/${goalA.id}/today?view=r11`);
    // MID/MID gives Beta(2,2); one remaining future DONE has survival 1/2,3/10,1/5.
    // These are hand-derived quantiles, not a call back into the production engine.
    assert.deepEqual(initial.prediction.coreMetric, { status: 'available', g50: 1, g80: 3 });
    assert.equal(initial.prediction.completion.p50Days, 1);
    assert.equal(initial.prediction.completion.p80Days, 3);
    assert.deepEqual(initial.provenance, { a: 'QUESTION', b: 'QUESTION' });
    assert.equal(initial.prediction.observations.recordedDays, 0);
    await until('document.querySelector(".fr-core__value")?.textContent === "約1日"', 'calculated core metric reaches UI');
    await saveAmount(7);
    await waitForRecord(goalA.id, 'DONE', 7);
    await openGoal(goalA.id); // A new document must re-read DB, not reuse the in-memory query cache.
    await assertProgress(goalA.id, 12);
    assert.deepEqual((await db.pool.query('select status, amount from action_log where goal_id=$1', [goalA.id])).rows,
      [{ status: 'DONE', amount: 7 }]);
    await changeRecord();
    await click(`[...document.querySelectorAll('.fr-choice')].find(e => (${visible})(e) && e.querySelector('.fr-choice__label')?.textContent === '今日は休む')`, 'SKIPPED choice');
    await waitForRecord(goalA.id, 'SKIPPED', null);
    await openGoal(goalA.id);
    await assertProgress(goalA.id, 5);
    assert.deepEqual((await db.pool.query('select status, amount from action_log where goal_id=$1', [goalA.id])).rows,
      [{ status: 'SKIPPED', amount: null }]);
    await changeRecord();
    await saveAmount(20);
    await waitForRecord(goalA.id, 'DONE', 20);
    await openGoal(goalA.id);
    await assertProgress(goalA.id, 25);
    const completed = await read(`/api/goals/${goalA.id}/today?view=r11`);
    assert.deepEqual(completed.prediction.completion, { status: 'completed' });
    assert.deepEqual(completed.prediction.coreMetric, { status: 'not_applicable', reason: 'COMPLETED' });
    assert.equal(await evaluate('document.querySelector(".fr-core__value") === null && !!document.querySelector("#fr-achieved-title")'), true);
    assert.deepEqual((await db.pool.query('select status, amount from action_log where goal_id=$1', [goalA.id])).rows,
      [{ status: 'DONE', amount: 20 }]);
  });

  await t.test('committed create with lost response is retried once; stale settings never overwrite records', async () => {
    assert.ok(goalA, 'first flow created owner A');
    await fillGoal('E2E uncertain create', 100, 0);
    const attempts = [];
    let lost = false;
    const intercept = event => {
      const message = JSON.parse(String(event.data));
      if (message.method !== 'Fetch.requestPaused') return;
      const paused = message.params;
      void (async () => {
        if (paused.request.method === 'POST' && new URL(paused.request.url).pathname === '/api/goals') {
          attempts.push({ body: paused.request.postData, key: Object.entries(paused.request.headers).find(([key]) => key.toLowerCase() === 'idempotency-key')?.[1] });
          if (!lost) {
            assert.equal(paused.responseStatusCode, 201, 'real API committed before losing response');
            lost = true;
            await cdp.send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Aborted' });
            return;
          }
          assert.equal(paused.responseStatusCode, 200, 'real ledger replay response');
        }
        await cdp.send('Fetch.continueRequest', { requestId: paused.requestId });
      })().catch(error => { interceptionError = error; });
    };
    cdp.socket.addEventListener('message', intercept);
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/goals', requestStage: 'Response' }] });
    try {
      await clickText('保存する');
      await until(`(${visible})(${button('もう一度保存')})`, 'uncertain create recovery');
      assert.equal(lost, true);
      assert.equal(attempts.length, 1, 'no automatic retry');
      assert.equal((await db.pool.query('select count(*)::int n from goal')).rows[0].n, 2);
      await clickText('もう一度保存');
      await until('location.pathname === "/goals"', 'explicit create replay completed');
      assert.equal(attempts.length, 2);
      assert.ok(attempts[0].key);
      assert.deepEqual(attempts[1], attempts[0], 'same operation key and body');
    } finally {
      await cdp.send('Fetch.disable');
      cdp.socket.removeEventListener('message', intercept);
    }
    const goals = await read('/api/goals');
    assert.equal(goals.length, 2, 'lost acknowledgement must not create a duplicate');
    recoveryGoal = goals.find(goal => goal.id !== goalA.id);
    await openGoal(recoveryGoal.id);
    // A real concurrent writer changes the settings after the form read its version.
    assert.equal((await api('PATCH', '/api/goals/' + recoveryGoal.id,
      { expectedGoalSettingsRevision: recoveryGoal.goalSettingsRevision, sessionAmount: 30 })).status, 200);
    await click(`[...document.querySelectorAll('.fr-choice')].find(e => (${visible})(e) && e.textContent.includes('やった'))`, 'save stale amount');
    await until(`document.body.textContent.includes('Goalの設定が変更されました')`, 'real 409 feedback');
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'この量で再保存')?.disabled`), true, 'retry stays disabled before explicit reload');
    assert.equal((await db.pool.query('select count(*)::int n from action_log where goal_id=$1', [recoveryGoal.id])).rows[0].n, 0);
    await clickText('最新の設定を取得');
    await until(`(${visible})(${button('この量で再保存')})`, 'explicit reload enables retry');
    await clickText('この量で再保存');
    await waitForRecord(recoveryGoal.id, 'DONE', 10);
    await until('!!document.querySelector("#fr-recorded-title")', 'conflict recovered');
    await openGoal(recoveryGoal.id);
    await assertProgress(recoveryGoal.id, 10); // Preserve the user's original quantity; never silently use 30.
    assert.deepEqual((await db.pool.query('select status, amount from action_log where goal_id=$1', [recoveryGoal.id])).rows,
      [{ status: 'DONE', amount: 10 }]);
  });

  await t.test('UI logout/account switch, cross-owner reads/writes and owner relogin persistence', async () => {
    assert.ok(goalA && recoveryGoal, 'previous flows completed');
    const before = (await db.pool.query('select id, user_id, title, session_amount from goal order by id')).rows;
    const documentStarted = await evaluate('performance.timeOrigin');
    await logout();
    assert.equal((await api('GET', '/api/goals')).status, 401);
    await authenticate('register', accountB);
    assert.equal(await evaluate('performance.timeOrigin'), documentStarted, 'account switch preserves SPA document to exercise private cache clearing');
    assert.deepEqual(await read('/api/goals'), []);
    assert.equal(await evaluate('document.body.textContent.includes("E2E owner A private goal")'), false);
    for (const path of [`/api/goals/${goalA.id}?view=r11`, `/api/goals/${goalA.id}/today?view=r11`, `/api/goals/${goalA.id}/logs`]) {
      assert.equal((await api('GET', path)).status, 404);
    }
    assert.equal((await api('PATCH', '/api/goals/' + goalA.id, { expectedGoalSettingsRevision: 0, title: 'not owner' })).status, 404);
    assert.equal((await api('DELETE', '/api/goals/' + goalA.id)).status, 404);
    assert.equal((await api('PUT', `/api/goals/${goalA.id}/logs/${goalA.today}`,
      { status: 'DONE', amount: 99, expectedGoalSettingsRevision: 0 })).status, 404);
    await navigate('/goals/' + goalA.id);
    await until('document.body.textContent.includes("このGoalは開けません") && !document.querySelector(".fr-progress__amount")', 'foreign goal rejected by UI');
    assert.equal(await evaluate('document.body.textContent.includes("E2E owner A private goal")'), false);
    assert.deepEqual((await db.pool.query('select id, user_id, title, session_amount from goal order by id')).rows, before);
    assert.deepEqual((await db.pool.query('select status, amount from action_log where goal_id=$1', [goalA.id])).rows,
      [{ status: 'DONE', amount: 20 }]);
    await navigate('/goals');
    await until('!!document.querySelector(".fr-goals__heading")', 'B list');
    await logout();
    await authenticate('login', accountA);
    assert.equal((await read('/api/goals')).length, 2);
    await openGoal(goalA.id);
    await assertProgress(goalA.id, 25);
    await openGoal(recoveryGoal.id);
    await assertProgress(recoveryGoal.id, 10);
  });
});
