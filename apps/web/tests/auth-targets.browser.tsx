import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '../src/router.tsx';
import { PrivateCacheGuard } from '../src/api/session-cache.ts';
import { goalsHttp } from '../src/api/goals-http.ts';

// 実Router/SDK/AuthPage。合成transportの明示した認証POSTだけを許可し、DB/Cookieの受入とは分ける。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const transport = (globalThis as any).__sessionTransport;
const host = document.getElementById('app')!;
const root = createRoot(host);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const targets = ['/goals/new', '/goals/owned-goal', '/goals/foreign-goal', '/goals/deleted-goal',
  'https://example.invalid', '//example.invalid', '/\\example.invalid', '', '/'];
let goalReads = 0;
goalsHttp.listGoals = async () => [];
goalsHttp.getGoal = async () => { goalReads++; throw new Error('register must not read the target Goal'); };
const ensure = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const settle = async () => { for (let i = 0; i < 20; i++) await act(tick); };
const until = async (condition: () => boolean, label: string) => {
  for (let i = 0; i < 600 && !condition(); i++) await act(tick);
  ensure(condition(), label + ': ' + router.state.location.href);
};
const path = () => router.state.location.pathname;
const go = async (to: string) => {
  await act(async () => { void router.navigate({ to } as never); await tick(); });
  await settle();
};
const submit = async () => {
  const form = host.querySelector<HTMLFormElement>('form')!;
  ensure(form, 'auth form missing');
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  email.value = 'A@example.invalid'; password.value = 'synthetic-password-265';
  await act(async () => { form.requestSubmit(); await tick(); });
};

async function run() {
  transport.allowSignOut = true;
  transport.owner = null;
  await act(async () => {
    root.render(<QueryClientProvider client={client}><PrivateCacheGuard /><RouterProvider router={router} /></QueryClientProvider>);
    await tick();
  });
  await settle();
  for (const target of targets) {
    await go('/register?redirect=' + encodeURIComponent(target));
    ensure(path() === '/register' && !!host.querySelector('form'), 'signed-out register left the form');
  }
  ensure(goalReads === 0 && transport.writes === 0, 'signed-out register read or wrote private data');

  await go('/');
  transport.hold = true;
  const reads = transport.reads;
  await go('/register?redirect=%2Fgoals%2Fforeign-goal');
  await until(() => transport.reads > reads && transport.held.length > 0, 'session read was not held');
  ensure(!host.querySelector('form') && goalReads === 0 && transport.writes === 0, 'pending session exposed the form or private data');
  transport.owner = 'A'; transport.hold = false;
  for (const release of transport.held.splice(0)) release();
  await until(() => path() === '/goals', 'confirmed session did not send register to goals');

  for (const target of targets) {
    await go('/register?redirect=' + encodeURIComponent(target));
    ensure(path() === '/goals', 'signed-in register kept the target ' + target);
    ensure(!host.textContent?.includes('Goalが見つかりません'), 'register rendered Goal not-found');
  }
  ensure(goalReads === 0 && transport.writes === 0, 'signed-in register touched a target Goal');
  await go('/');
  await go('/register?redirect=%2Fgoals%2Fdeleted-goal');
  await act(async () => { router.history.back(); await tick(); }); await settle();
  ensure(path() === '/', 'back returned to register rather than replacing it');
  for (let i = 0; i < 3; i++) await go('/register?redirect=%2Fgoals%2Fforeign-goal');
  ensure(path() === '/goals' && goalReads === 0, 'repeated register used the old target');
  await go('/login?redirect=%2Fgoals%2Fnew');
  ensure(path() === '/goals/new', 'signed-in login lost the valid return target');
  for (const target of ['https://example.invalid', '//example.invalid']) {
    await go('/login?redirect=' + encodeURIComponent(target));
    ensure(path() === '/goals', 'login accepted an external return target');
  }

  transport.owner = null;
  await go('/register?redirect=%2Fgoals%2Fnew&reason=expired');
  const login = host.querySelector<HTMLAnchorElement>('a[href^="/login"]')!;
  await act(async () => { login.click(); await tick(); }); await settle();
  ensure(path() === '/login', 'register did not switch to login');
  const search = router.state.matches.at(-1)?.search as { redirect?: string; reason?: string };
  ensure(search.redirect === '/goals/new' && search.reason === 'expired', 'auth tab switch dropped the return target or reason');

  transport.allowAuthActions = true;
  transport.authCalls = [];
  await go('/register?redirect=%2Fgoals%2Fforeign-goal');
  await submit();
  await until(() => path() === '/goals', 'AuthPage registration success did not open goals');
  ensure(transport.authCalls.length === 1, 'registration issued more than one auth POST');
  transport.owner = null;
  await go('/login?redirect=%2Fgoals%2Fnew');
  await submit();
  await until(() => path() === '/goals/new', 'AuthPage login success lost the return target');
  ensure(goalReads === 0, 'auth success read the foreign target Goal');
  await act(async () => root.unmount()); client.clear();
  return { targets: targets.length, goalReads, authCalls: transport.authCalls, writes: transport.writes };
}
run().then(result => { document.getElementById('result')!.textContent = JSON.stringify({ ok: true, ...result }); }).catch(error => {
  document.getElementById('result')!.textContent = JSON.stringify({ ok: false, error: String(error.stack ?? error) });
});
