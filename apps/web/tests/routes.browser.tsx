import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { router } from '../src/router.tsx';
import { goalsHttp } from '../src/api/goals-http.ts';
import { PrivateCacheGuard } from '../src/api/session-cache.ts';
import { appCopy } from '../src/copy/app.ts';
import { NotFoundPage, RouteErrorPage } from '../src/routes/RouteStates.tsx';
import { MainLandmark } from '../src/routes/MainLandmark.tsx';
import { PASSWORD_RESET_UNAVAILABLE_MESSAGE } from '../../api/src/auth/password-reset-policy.ts';

// ルートの移動と既定の画面（#146 完了条件②）を、実router・実SDKで検査する。
// ログインの確認（/api/auth/get-session）とGoal一覧の取得だけを合成し、実DB/Cookieの受入とは区別する。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const transport = (globalThis as any).__sessionTransport;
const host = document.getElementById('app')!;
const root = createRoot(host);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let listCalls = 0;
goalsHttp.listGoals = async () => { listCalls++; return []; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const settle = async () => { for (let i = 0; i < 20; i++) await act(tick); };
const ensure = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const path = () => router.state.location.pathname;
const text = () => host.textContent ?? '';
// 読み込みの完了を待つ（ルーターの確認・読込中の表示を挟むため、条件が満たされるまで最大3秒）
const until = async (done: () => boolean) => { for (let i = 0; i < 600 && !done(); i++) await act(tick); };
const go = async (to: string) => { await act(async () => { void router.navigate({ to } as never); await tick(); }); await settle(); };
const results: string[] = [];
// 本文の目印（<main>）は1画面に1つだけ（#237）。
const oneMain = (where: string) => ensure(host.querySelectorAll('main').length === 1, where + ': expected exactly one <main>, got ' + host.querySelectorAll('main').length);
const c = appCopy;

async function run() {
  // 未ログイン（get-session が session なしを返す）
  transport.allowSignOut = true;
  transport.owner = null;
  await act(async () => { root.render(<QueryClientProvider client={client}><PrivateCacheGuard /><RouterProvider router={router} /></QueryClientProvider>); await tick(); });
  await settle();
  ensure(path() === '/', 'public top did not render without login');
  oneMain('public top');
  await go('/goals/goal-123/history');
  ensure(path() === '/login', 'signed-out user reached a private route: ' + path());
  ensure((router.state.location.search as { redirect?: string }).redirect === '/goals/goal-123/history', 'login did not keep the original URL as the return target');
  ensure(listCalls === 0, 'private data was requested before login');
  ensure(text().includes(PASSWORD_RESET_UNAVAILABLE_MESSAGE), 'login does not explain the reset pause');
  ensure(!host.querySelector('a[href^="/forgot-password"]'), 'login still offers reset while paused');
  results.push('signed-out: private route redirects to login with the original URL and fetches nothing');

  // ログイン済みで /login を開くと、戻り先へ移り、履歴を置き換える（「戻る」でログイン画面へ戻らない）
  transport.owner = 'A';
  await go('/');
  await act(async () => { void router.navigate({ to: '/login', search: { redirect: '/goals' } } as never); await tick(); }); await settle();
  ensure(path() === '/goals', 'signed-in user stayed on login: ' + path());
  ensure(listCalls > 0, 'goal list did not load after redirect');
  oneMain('goal list');
  await act(async () => { router.history.back(); await tick(); }); await settle();
  ensure(path() === '/', 'back after the login redirect returned to the login page: ' + path());
  results.push('signed-in: /login redirects to the return target with replace (back skips login)');

  // #264: URLのqueryを通した戻り先も、routerのbeforeLoad前にアプリ内の既定先へ戻す。
  for (const target of ['/\\example.test', '/\\']) {
    transport.owner = null;
    await go('/login?redirect=' + encodeURIComponent(target));
    ensure(path() === '/login', '#264: signed-out user did not stay on login');
    ensure((router.state.matches.at(-1)?.search as { redirect?: string }).redirect === '/goals', '#264: validated return target was kept');
    transport.owner = 'A';
    await go('/');
    await go('/login?redirect=' + encodeURIComponent(target));
    ensure(path() === '/goals', '#264: signed-in invalid return target reached ' + path());
    ensure(!text().includes(c.error.title), '#264: invalid return target showed the error screen');
  }
  results.push('#264: slash-backslash return targets fall back to the Goal list before and after session confirmation');

  // 直URL・旧メールリンクはログインの有無に関係なく案内だけを出し、入力も送信もできない。
  for (const owner of ['A', null]) {
    transport.owner = owner;
    for (const target of ['/forgot-password', '/reset-password?token=synthetic-reset-token', '/reset-password?error=INVALID_TOKEN', '/reset-password']) {
      const writesBefore = transport.writes;
      await go(target);
      ensure(text().includes(PASSWORD_RESET_UNAVAILABLE_MESSAGE), 'reset pause message missing: ' + target);
      ensure(!host.querySelector('input, form, button[type="submit"]'), 'reset input still available: ' + target);
      ensure(host.querySelector('a[href^="/login"]'), 'reset pause has no way back to login');
      ensure(transport.writes === writesBefore, 'reset page issued a request: ' + target);
      oneMain('reset pause');
    }
  }
  transport.owner = 'A';
  results.push('signed-in/out: reset URLs and old/invalid links show the pause with no input or reset requests');
  await go('/');

  // 通信の失敗（例外・503）は未ログインと取り違えず、「接続できませんでした」を出してログインへ送らない
  for (const failure of ['network', '503']) {
    transport.failure = failure;
    await go('/goals/new');
    ensure(path() === '/goals/new', failure + ': unreachable session moved to ' + path());
    ensure(text().includes(c.error.unreachableTitle) && text().includes(c.error.unreachable), failure + ': unreachable message missing');
    ensure(!text().includes(c.error.title), failure + ': generic error shown instead of unreachable');
    oneMain(failure + ' unreachable');
    // 回復したら「再読み込み」でログインの確認からやり直し、画面が出る
    transport.failure = null;
    const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(c.error.retry));
    ensure(retry, failure + ': retry button missing');
    await act(async () => { retry!.click(); await tick(); });
    await until(() => !text().includes(c.error.unreachableTitle) && !host.querySelector('[role="status"]'));
    ensure(path() === '/goals/new' && !text().includes(c.error.unreachableTitle), failure + ': retry did not recover: ' + path() + ' | reads=' + transport.reads + ' | ' + text().slice(0, 120));
    await go('/');
  }
  results.push('unreachable (network/503): stays on the URL with the connection message and recovers by retry');

  // ログイン後の画面で、ウィンドウへ戻ったときの再確認（固定版の visibilitychange 再取得）が失敗したら、
  // 「読み込み中」のまま止めず「接続できませんでした」を出し、ログインへ送らず、「再読み込み」で回復する（#279）
  await go('/goals');
  ensure(path() === '/goals', 'goal list did not open before the recheck failure: ' + path());
  const realNow = Date.now;
  let clockAdvance = 0;
  Date.now = () => realNow() + clockAdvance;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  // テスト時計だけを進め、固定版の5秒 focus throttle を越える。製品の設定は変更しない。
  const focus = async () => { const before = transport.reads; clockAdvance += 6000; await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await tick(); }); await settle(); ensure(transport.reads > before, 'visibilitychange did not request a session refetch'); };
  for (const failure of ['network', '503']) {
    const listBefore = listCalls;
    transport.failure = failure; await focus();
    ensure(path() === '/goals', failure + ': recheck failure moved to ' + path());
    ensure(text().includes(c.error.unreachableTitle) && text().includes(c.error.unreachable), failure + ': recheck failure message missing');
    ensure(!text().includes(c.error.title), failure + ': generic error shown for a recheck failure');
    ensure(!host.querySelector('.fr-goals__row:not(.fr-goals__row--skeleton)'), failure + ': private list stayed visible after the recheck failure');
    oneMain(failure + ' recheck failure');
    const retry = [...host.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent?.includes(c.error.retry));
    ensure(retry, failure + ': recheck retry button missing');
    // 失敗が続く間は案内が残り、ログインへも送らない
    await act(async () => { retry!.click(); await tick(); }); await settle();
    ensure(path() === '/goals' && text().includes(c.error.unreachableTitle), failure + ': retry while still failing hid the message or moved: ' + path());
    transport.failure = null;
    const retryAgain = [...host.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent?.includes(c.error.retry));
    await act(async () => { retryAgain!.click(); await tick(); });
    await until(() => !text().includes(c.error.unreachableTitle) && listCalls > listBefore);
    ensure(!text().includes(c.error.unreachableTitle) && listCalls > listBefore && path() === '/goals', failure + ': recheck retry did not recover: reads=' + transport.reads + ' list=' + listCalls + ' | ' + text().slice(0, 120));
  }
  Date.now = realNow;
  results.push('signed-in recheck failure (network/503): connection message in place of loading, no login redirect, retry recovers');
  await go('/');

  // 定義していないURLは日本語の404（英語の Not Found を出さない）
  await go('/no-such-page');
  ensure(text().includes(c.notFound.title) && text().includes(c.notFound.body), '404 page missing');
  ensure(!/Not Found/.test(text()), 'English Not Found was shown');
  ensure(host.querySelector('a[href="/goals"]'), '404 has no way back to the goal list');
  oneMain('404');
  results.push('unknown URL: Japanese 404 with a link back to the goal list');

  // ルーター全体の既定の画面が、この404・エラーの部品になっている
  ensure(router.options.defaultNotFoundComponent === NotFoundPage && router.options.defaultErrorComponent === RouteErrorPage, 'router defaults are not the app route states');
  // 一般のエラー（ログイン確認以外の失敗）は「接続できませんでした」と区別して表示する
  await act(async () => root.unmount());
  const failing = createRouter({
    routeTree: createRootRoute({ component: () => { throw new Error('synthetic render failure'); } }),
    defaultErrorComponent: RouteErrorPage,
  });
  const root2 = createRoot(host);
  await act(async () => { root2.render(<QueryClientProvider client={client}><RouterProvider router={failing} /></QueryClientProvider>); await tick(); }); await settle();
  ensure(text().includes(c.error.title) && text().includes(c.error.body), 'generic error page missing');
  ensure(!text().includes(c.error.unreachable), 'generic error was shown as unreachable');
  oneMain('generic error');
  results.push('generic route error: RouteErrorPage shows the general error, distinct from unreachable');
  results.push('landmark: exactly one <main> on the public top, goal list, unreachable, 404 and generic error (#237)');
  await act(async () => root2.unmount());
  // ログイン後の外枠（<main>）の中で画面が失敗しても、<main> は二重にならない
  const shellRoot = createRootRoute({ component: () => <MainLandmark><Outlet /></MainLandmark> });
  const nested = createRouter({
    routeTree: shellRoot.addChildren([createRoute({ getParentRoute: () => shellRoot, path: '/', component: () => { throw new Error('synthetic nested failure'); } })]),
    defaultErrorComponent: RouteErrorPage,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const root3 = createRoot(host);
  await act(async () => { root3.render(<QueryClientProvider client={client}><RouterProvider router={nested} /></QueryClientProvider>); await tick(); }); await settle();
  ensure(text().includes(c.error.title), 'nested error page missing');
  oneMain('error inside the app shell');
  results.push('landmark: an error inside the app shell keeps a single <main> (#237)');
  await act(async () => root3.unmount()); client.clear();
  return { results, reads: transport.reads, writes: transport.writes, listCalls };
}
run().then((result) => { document.getElementById('result')!.textContent = JSON.stringify({ ok: true, ...result }); }).catch((error) => {
  document.getElementById('result')!.textContent = JSON.stringify({ ok: false, error: String(error.stack ?? error) });
});
