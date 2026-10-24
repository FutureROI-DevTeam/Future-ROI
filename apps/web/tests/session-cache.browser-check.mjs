import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

// 既存 Vite/React だけで bundle し、Chromium の実DOMで hook を検査する。新しいテスト依存は不要。
// CI ubuntu-latest の Chrome、Windows の既存 Chrome/Edge、または明示した TEST_BROWSER を使う。
async function browserPath() {
  const candidates = [process.env.TEST_BROWSER,
    ...(process.platform === 'win32' ? [
      join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    ] : process.platform === 'darwin' ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'])].filter(Boolean);
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {}
  }
  throw new Error('Chromium not found: set TEST_BROWSER to an installed Chrome/Edge/Chromium executable (not a skipped PASS)');
}

// Better Auth は client 作成時に fetch を保持するため、bundle 評価前に transport を用意する。
function setupSessionTransport() {
  const state = globalThis.__sessionTransport = { owner: 'A', failure: null, reads: 0, writes: 0, hold: false, held: [], allowSignOut: false, signOutCalls: 0, signOutFailure: false, signOutHold: false, signOutHeld: [] };
  globalThis.fetch = async (request, init) => {
    const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    // GoalList reads the default-OFF capability. It is neither an auth read nor a write.
    if (new URL(url, location.href).pathname === '/api/evaluation' && (!init?.method || init.method === 'GET')) {
      return Response.json({ enabled: false, policyVersion: 'self-evaluation-v1', retentionDays: 90, maxSnapshots: 90, observationDays: 30 });
    }
    const authPath = new URL(url, location.href).pathname;
    if (state.allowAuthActions && init?.method === 'POST' && ['/api/auth/sign-up/email', '/api/auth/sign-in/email'].includes(authPath)) {
      state.writes++;
      state.authCalls.push(authPath);
      state.owner = 'A';
      return Response.json({ token: 'synthetic-test-token', user: { id: 'A', name: 'Synthetic A', email: 'A@example.invalid', emailVerified: true, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' } });
    }
    if (state.allowSignOut && new URL(url, location.href).pathname === '/api/auth/sign-out' && init?.method === 'POST') {
      state.signOutCalls++;
      if (state.signOutHold) await new Promise((resolve) => state.signOutHeld.push(resolve));
      if (state.signOutFailure) return Response.json({ code: 'SIGN_OUT_UNCONFIRMED', message: 'Sign-out could not be confirmed. Please retry.' }, { status: 503 });
      state.owner = null;
      return Response.json({ success: true });
    }
    if (new URL(url, location.href).pathname !== '/api/auth/get-session' || (init?.method && init.method !== 'GET')) {
      state.writes++;
      throw new Error('unexpected request: ' + url);
    }
    state.reads++;
    if (state.hold) await new Promise((resolve) => state.held.push(resolve));
    if (state.failure === 'network') throw new TypeError('synthetic offline');
    if (state.failure === '503') return Response.json({ code: 'SYNTHETIC_UNAVAILABLE', message: 'synthetic 503' }, { status: 503 });
    if (state.failure === '429') return Response.json({ code: 'RATE_LIMITED', message: 'synthetic 429' }, { status: 429 });
    if (state.allowSignOut && state.owner === null) return Response.json(null);
    return Response.json({
      user: { id: state.owner, name: 'Synthetic ' + state.owner, email: state.owner + '@example.invalid', emailVerified: true, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' },
      session: { id: 'synthetic-' + state.owner, userId: state.owner, token: 'synthetic-test-token', expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' },
    });
  };
}

async function runBrowser(t, entry, mockAuth, realRouter = false) {
  const browser = await browserPath();
  const dir = await mkdtemp(join(tmpdir(), 'futureroi-session-test-'));
  t.after(() => {
    if (!dir.startsWith(join(tmpdir(), 'futureroi-session-test-'))) throw new Error('refusing cleanup outside test temp directory');
    return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  const bundle = await build({
    configFile: false, logLevel: 'silent',
    resolve: { alias: { '@contracts': fileURLToPath(new URL('../../api/src/contracts/index.ts', import.meta.url)), ...(!realRouter && { '@tanstack/react-router': 'test:router' }) }, conditions: ['development'] },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [react(), {
      name: 'isolated-test-router',
      enforce: 'pre',
      resolveId: (id) => id === 'test:router' ? '\0test:router' : mockAuth && id.endsWith('/auth/client.ts') ? '\0test:auth' : null,
      load: (id) => id === '\0test:auth' ? 'export const authClient = {}; export const describeAuthError = (_code, fallback) => fallback;' : id === '\0test:router' ? `import {createElement} from 'react';
        export const Link=({to,params,search,children,...props})=>createElement('a',{href:to,...props},children);
        export const useNavigate=()=>()=>{}; export const useRouter=()=>({subscribe:()=>()=>{}}); export const useLocation=()=>({href:'/goals'});` : null,
    }],
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL(entry, import.meta.url)), formats: ['iife'], name: 'SessionTests' } },
  });
  const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((b) => b.output);
  const code = outputs.filter((out) => out.type === 'chunk').map((out) => out.code).join('\n');
  const page = join(dir, 'index.html');
  const prelude = mockAuth ? '' : '(' + setupSessionTransport.toString() + ')();';
  const html = `<meta charset="utf-8"><div id="app"></div><pre id="result">PENDING</pre><script>${prelude}
    onerror=(message)=>{document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(message)});};
    onunhandledrejection=(event)=>{document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(event.reason)});};
    </script><script>${code.replaceAll('</script', '<\\/script')}</script>`;
  await writeFile(page, html);
  const server = createServer((_, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const { port } = server.address();
  const { stdout, stderr } = await promisify(execFile)(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', `--virtual-time-budget=${realRouter ? 60000 : 15000}`, `http://127.0.0.1:${port}/`,
  ], { timeout: realRouter ? 120000 : 45000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const text = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
  assert.ok(text && text !== 'PENDING', `browser did not finish hook regression: ${stderr.slice(-1500)}`);
  const result = JSON.parse(text.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"'));
  assert.equal(result.ok, true, result.error);
  return result;
}

test('session ownership: real React hooks/Goal screens reject old cache and drafts in every DOM commit', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './session-cache.browser.tsx', true);
  assert.equal(result.results.length, 12);
  assert.equal(result.writes, 0);
  t.diagnostic(JSON.stringify(result));
});

test('Better Auth 1.7.7: visibility refetch failure masks draft and successful recovery starts a fresh form', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './session-focus.browser.tsx', false);
  assert.equal(result.results.length, 4);
  assert.equal(result.writes, 0);
  t.diagnostic(JSON.stringify(result));
});

test('#190 Today: same-owner visibility check keeps input, holds saves until confirmed, and discards on B/failure', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './session-today.browser.tsx', false);
  assert.equal(result.results.length, 4);
  assert.equal(result.puts, 1);
  assert.equal(result.writes, 0);
  t.diagnostic(JSON.stringify(result));
});

test('same-owner draft: actual router/hooks preserve idle input only across successful continuous checks', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './session-draft.browser.tsx', false, true);
  assert.equal(result.operations.length, 15);
  assert.equal(result.safety.length, 27);
  assert.equal(result.writes, 29);
  t.diagnostic(JSON.stringify(result));
});

test('#191 Today boundaries: response ordering, cancelled retry, and batched draft invalidation', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './session-today-boundary.browser.tsx', false, true);
  assert.equal(result.results.length, 13);
  assert.equal(result.writes, 0);
  t.diagnostic(JSON.stringify(result));
});

test('#146 routes: signed-out/signed-in/reset pause/unreachable/404/error move and render correctly with the real router, with one <main> (#237)', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './routes.browser.tsx', false, true);
  assert.equal(result.results.length, 9);
  assert.equal(result.writes, 0);
  t.diagnostic(JSON.stringify(result));
});

test('#265 auth targets: register ignores the target after session confirmation; login and AuthPage success preserve their contracts', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './auth-targets.browser.tsx', false, true);
  assert.equal(result.targets, 9);
  assert.equal(result.goalReads, 0);
  assert.deepEqual(result.authCalls, ['/api/auth/sign-up/email', '/api/auth/sign-in/email']);
  assert.equal(result.writes, 2);
  t.diagnostic(JSON.stringify(result));
});

test('#215 logout: real SDK/AccountMenu/router show 503, release busy, and navigate only after explicit success', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './sign-out.browser.tsx', false, true);
  assert.equal(result.signOutCalls, 2);
  assert.equal(result.writes, 0);
  t.diagnostic(JSON.stringify(result));
});

test('YesterdayPrompt: same-day refetch keeps draft and next-day refetch requires a new amount', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './yesterday-rollover.browser.tsx', true);
  assert.equal(result.results.length, 3);
  assert.equal(result.writes.length, 2);
  t.diagnostic(JSON.stringify(result));
});

test('AmountEditor: contract boundaries, dock entry, keyboard, batched steps and unsaved cancel', { timeout: 180000 }, async (t) => {
  const result = await runBrowser(t, './amount-editor.browser.tsx', true);
  assert.equal(result.results.length, 17);
  assert.deepEqual(result.writes[0].choice, {status: 'SKIPPED', amount: null});
  t.diagnostic(JSON.stringify(result));
});

// Todayの開閉と幅境界をnative入力の実ブラウザで検査する（新依存なし）。
import './responsive-details.browser-check.mjs';
// 同owner確認の失敗表示保全と、owner・訪問・作成操作の破棄境界。
import './issue185-browser-check.mjs';
