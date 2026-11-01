import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { GoalR11, Log } from '@contracts';
import { PrivateCacheGuard, privateDataReady, usePrivateEpoch } from '../src/api/session-cache.ts';
import { goalKeys, goalsHttp } from '../src/api/goals-http.ts';
import { todayHttp, todayKeys } from '../src/api/today-http.ts';
import { HistoryPage } from '../src/features/history/HistoryPage.tsx';

// Real session SDK, history components and query cache; only HTTP and the focus clock are controlled.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const transport = (globalThis as any).__sessionTransport;
const records: Record<string, Log[]> = { A: [], B: [] };
let reads = 0, saves = 0;
const goal = (): GoalR11 => ({
  id: 'goal', title: `${transport.owner}-PRIVATE-GOAL`, unit: 'minutes', totalRequired: 1000,
  sessionAmount: 10, initialProgress: 0, progressDone: records[transport.owner]!.reduce((sum, log) => sum + (log.amount ?? 0), 0),
  today: '2026-10-09', todayStatus: 'UNRECORDED', timezone: 'UTC', recordStartDate: '2026-09-01',
  hasLogs: records[transport.owner]!.length > 0, unitLocked: true, targetDate: null,
  questionPrior: { a: null, b: null }, answerRevision: 1, goalSettingsRevision: 0, schemaVersion: 'r11-v1',
  historyRevision: String(records[transport.owner]!.length),
  historyFingerprint: JSON.stringify(records[transport.owner]!.map(log => [log.localDate, log.status, log.amount])),
});
goalsHttp.getGoal = async () => { reads++; return goal(); };
todayHttp.listLogs = async () => [...records[transport.owner]!];
const sessionFetch = globalThis.fetch;
let completeSave: (() => void) | undefined;
globalThis.fetch = async (request, init) => {
  const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
  if (new URL(url, location.href).pathname.startsWith('/api/goals/goal/logs/') && init?.method === 'PATCH') {
    saves++;
    const owner = transport.owner;
    const body = JSON.parse(String(init.body));
    const localDate = new URL(url, location.href).pathname.split('/').at(-1)!;
    await new Promise<void>(resolve => { completeSave = resolve; });
    records[owner] = [{ localDate, status: body.status, amount: body.amount }];
    return Response.json({ historyRevision: '1', log: records[owner]![0] });
  }
  return sessionFetch(request, init);
};

const host = document.getElementById('app')!;
const root = createRoot(host);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let screen = 'history', entry = '2026-10-09';
function Readback() {
  const current = usePrivateEpoch();
  const result = useQuery({ queryKey: goalKeys.detail('goal'), queryFn: () => goalsHttp.getGoal('goal'), enabled: privateDataReady(current) });
  useQuery({ queryKey: todayKeys.logs('goal'), queryFn: () => todayHttp.listLogs('goal'), enabled: privateDataReady(current) });
  return privateDataReady(current) && result.data ? <output>{result.data.title}:{result.data.progressDone}</output> : null;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const settle = async () => { for (let i = 0; i < 15; i++) await act(tick); };
const ensure = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const render = async () => {
  await act(async () => { root.render(<QueryClientProvider client={client}><PrivateCacheGuard />{screen === 'history' ? <HistoryPage goalId="goal" initialDate={entry} /> : <Readback />}</QueryClientProvider>); await tick(); });
  await settle();
};
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text)!;
const click = async (target: HTMLButtonElement) => act(async () => { ensure(target && !target.disabled, 'button unavailable'); target.click(); await tick(); });
const input = () => host.querySelector<HTMLInputElement>('.fr-history-editor__amount input');
const amount = async (value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input()!, value);
  input()!.dispatchEvent(new Event('input', { bubbles: true })); await tick();
});
const realNow = Date.now;
let advance = 0, visibility = 'visible';
Date.now = () => realNow() + advance;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
const recheck = async () => {
  const before = transport.reads;
  transport.hold = true;
  advance += 6000;
  await act(async () => {
    visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await tick();
  });
  await settle();
  ensure(transport.reads > before, 'real session recheck did not start');
  ensure(!input() && !host.textContent?.includes('-PRIVATE-GOAL'), 'private DOM remained during confirmation');
  transport.hold = false;
  await act(async () => { transport.held.splice(0).forEach((resolve: () => void) => resolve()); await tick(); });
  await settle();
};
async function run() {
  const results: string[] = [];
  await render();
  await click(host.querySelector<HTMLButtonElement>('button[aria-label="前の月"]')!);
  await click(host.querySelector<HTMLButtonElement>('button[aria-label="9月30日 未記録"]')!);
  await click(button('この日の記録を編集'));
  await amount('777');
  await recheck();
  ensure(input()?.value === '777' && host.querySelector('.fr-history-editor h2')?.textContent?.includes('9月30日') && host.querySelector('h1')?.textContent?.includes('9月'), 'same-owner confirmation lost the later selected month/date/draft behind URL date');
  results.push('same-owner confirmation preserves selected month, day and input behind a different URL entry day');

  entry = '2026-10-07'; await render();
  ensure(!input() && host.querySelector('.fr-history-selection h2')?.textContent?.includes('10月7日'), 'a true URL entry change reused another day draft');
  results.push('a new URL entry chooses its own day and discards the preceding visit draft');

  await click(button('この日の記録を編集')); await amount('20');
  await click(button('記録を保存')); ensure(completeSave && saves === 1, 'save was not held');
  screen = 'readback'; await render();
  ensure(host.querySelector('output')?.textContent === 'A-PRIVATE-GOAL:0', 'readback did not initially read pre-commit data');
  const before = reads;
  await act(async () => { completeSave!(); await tick(); }); await settle();
  ensure(reads > before && host.querySelector('output')?.textContent === 'A-PRIVATE-GOAL:20', 'confirmed write after leaving history failed to refresh active Goal cache');
  results.push('a confirmed save after unmount refreshes active same-owner Goal/log reads');

  screen = 'history'; entry = '2026-10-06'; await render();
  await click(button('この日の記録を編集')); await amount('30');
  await click(button('記録を保存')); ensure(saves === 2, 'second save was not held');
  transport.owner = 'B'; await recheck();
  screen = 'readback'; await render();
  ensure(host.querySelector('output')?.textContent === 'B-PRIVATE-GOAL:0', 'B did not get fresh own data');
  const beforeB = reads;
  await act(async () => { completeSave!(); await tick(); }); await settle();
  ensure(reads === beforeB && host.querySelector('output')?.textContent === 'B-PRIVATE-GOAL:0', 'late A save touched B cache');
  results.push('a late save cannot refresh or render a different owner cache');
  ensure(transport.writes === 0, 'unexpected transport write');
  await act(async () => root.unmount()); client.clear(); Date.now = realNow;
  return { results, saves, writes: transport.writes };
}
run().then(result => { document.getElementById('result')!.textContent = JSON.stringify({ ok: true, ...result }); }).catch(error => {
  document.getElementById('result')!.textContent = JSON.stringify({ ok: false, error: error.stack ?? String(error) });
});
