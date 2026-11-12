import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authClient } from '../src/auth/client.ts';
import { PrivateCacheGuard } from '../src/api/session-cache.ts';
import { goalsHttp } from '../src/api/goals-http.ts';
import { todayHttp } from '../src/api/today-http.ts';
import { GoalCreatePage, GoalEditPage } from '../src/features/goals/GoalFormPage.tsx';
import { GoalListPage } from '../src/features/goals/GoalListPage.tsx';
import { TodayPage } from '../src/features/today/TodayPage.tsx';
import { AppShell } from '../src/routes/AppShell.tsx';
import { ApiError } from '../src/api/client.ts';
import '@fontsource/zen-maru-gothic/400.css';
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/700.css';
import '../src/styles.css';

// HTTP応答だけを合成する。製品のform/hook/cache/layoutとnative入力を使う。
const session = { data: { user: { id: 'synthetic-244', email: 'qa@example.invalid' } }, isPending: false, isRefetching: false, error: null, refetch: async () => {} };
authClient.useSession = () => session as never;
authClient.getSession = async () => ({ data: session.data, error: null }) as never;
const date = new Date().toISOString().slice(0, 10);
const shift = (n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const base = { id: 'qa-goal', title: '英語学習の積み上げ', unit: 'minutes', totalRequired: 12000, sessionAmount: 30,
  initialProgress: 0, timezone: 'UTC', recordStartDate: shift(-28), hasLogs: true, unitLocked: true,
  goalSettingsRevision: 0, answerRevision: 0, historyRevision: '0', today: date, targetDate: null, questionPrior: { a: null, b: null }, schemaVersion: 'r11-v1' };
let logs: { localDate: string; status: string; amount: number | null }[] = [];
let failure: 'offline' | '409' | null = null;
let puts: unknown[] = [];
let creates: unknown[] = [];
let patches: unknown[] = [];
let hold = false;
const held: (() => void)[] = [];
let achievedVisible = true;
let historyFailure: string | null = null;
let historyHold = false;
const heldHistory: (() => void)[] = [];
const achievedLogs = [{ localDate: shift(-10), status: 'DONE', amount: 10 }];
const goal = () => ({ ...base, todayStatus: logs.find(l => l.localDate === date)?.status ?? 'UNRECORDED',
  progressDone: logs.reduce((n, l) => n + (l.status === 'DONE' ? l.amount ?? 0 : 0), base.initialProgress) });
const today = () => {
  const g = goal(), todayLog = logs.find(l => l.localDate === date) ?? null;
  return { schemaVersion: 'r11-v1', today: date, yesterday: shift(-1), todayLog,
    yesterdayMissing: !logs.some(l => l.localDate === shift(-1)),
    prediction: { modelVersion: 'm1-question-prior-v1', today: date, todayStatus: g.todayStatus,
      progress: { done: g.progressDone, total: g.totalRequired, completed: g.progressDone >= g.totalRequired },
      observations: { nDD: 6, nDS: 7, nSD: 7, nSS: 7, effectiveTransitions: 27, observedDays: 28, recordedDays: 28 },
      posterior: { a: { alpha: 8, beta: 9 }, b: { alpha: 9, beta: 9 } }, coreMetric: { status: 'available', g50: 2, g80: 4 },
      completion: { status: 'available', scenario: todayLog ? 'CURRENT_STATE' : 'TODAY_DONE', p50Days: 300, p80Days: 450 },
      config: { samples: 200, horizonDays: 1095, seed: 244 } },
    context: { recordStartDate: g.recordStartDate, unit: g.unit, sessionAmount: g.sessionAmount,
      goalSettingsRevision: g.goalSettingsRevision, answerRevision: g.answerRevision, historyRevision: g.historyRevision, unitLocked: g.unitLocked },
    provenance: { a: 'RECORDS', b: 'RECORDS' }, plan: null };
};
goalsHttp.getGoal = async () => structuredClone(goal()) as never;
goalsHttp.listGoals = async () => [goal(), ...(achievedVisible ? [{ ...goal(), id: 'achieved', title: '読み終えた本', unit: 'sessions', totalRequired: 10, initialProgress: 2, progressDone: 12, todayStatus: 'UNRECORDED' }] : [])] as never;
goalsHttp.createGoal = async (...args: unknown[]) => { creates.push(structuredClone(args)); return goal() as never; };
goalsHttp.updateGoal = async (...args: unknown[]) => { patches.push(structuredClone(args)); return goal() as never; };
todayHttp.getToday = async () => structuredClone(today()) as never;
todayHttp.listLogs = async id => {
  if (id === historyFailure) throw new TypeError('synthetic history offline');
  if (id === base.id && historyHold) await new Promise<void>(resolve => heldHistory.push(resolve));
  return structuredClone(id === 'achieved' ? achievedLogs : logs) as never;
};
todayHttp.putLog = async (_id, localDate, body) => {
  puts.push(structuredClone({ localDate, body }));
  if (hold) await new Promise<void>(resolve => held.push(resolve));
  if (failure === 'offline') throw new TypeError('synthetic offline');
  if (failure === '409') throw new ApiError(409, { error: { code: 'GOAL_SETTINGS_CONFLICT', message: 'synthetic 409' } });
  const saved = { localDate, status: body.status, amount: body.status === 'DONE' ? body.amount : null };
  const previous = logs.find(l => l.localDate === localDate);
  const previousAmount = previous?.status === 'DONE' ? previous.amount ?? 0 : 0;
  if (!previous || previous.status !== saved.status || previous.amount !== saved.amount) base.historyRevision = String(BigInt(base.historyRevision) + 1n);
  logs = [...logs.filter(l => l.localDate !== localDate), saved];
  return structuredClone({ ...saved, change: { goalId: base.id, previousAmount,
    amountDelta: (saved.amount ?? 0) - previousAmount, totalRequired: base.totalRequired, unit: base.unit,
    goalSettingsRevision: base.goalSettingsRevision, historyRevision: base.historyRevision } }) as never;
};
globalThis.fetch = async () => Response.json({ enabled: false, policyVersion: 'self-evaluation-v1', retentionDays: 90, maxSnapshots: 90, observationDays: 30 });
const root = createRoot(document.getElementById('app')!);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let visit = 0;
function mount(mode: string) {
  failure = null;
  hold = false;
  puts = [];
  creates = [];
  patches = [];
  achievedVisible = true;
  historyFailure = null;
  historyHold = mode === 'list-loading';
  base.unit = 'minutes';
  base.totalRequired = 12000;
  base.sessionAmount = 30;
  base.goalSettingsRevision = 0;
  base.answerRevision = 0;
  base.historyRevision = '0';
  logs = Array.from({ length: 28 }, (_, i) => ({ localDate: shift(i - 28), status: i % 2 ? 'DONE' : 'SKIPPED', amount: i % 2 ? 30 : null }));
  if (mode === 'today-small' || mode === 'list-small') {
    base.totalRequired = 18000;
    base.sessionAmount = 120;
    logs = [{ localDate: shift(-1), status: 'DONE', amount: 120 }];
  }
  if (mode === 'today-counts') {
    base.unit = 'sessions';
    base.totalRequired = 4;
    base.sessionAmount = 1;
    logs = [{ localDate: date, status: 'DONE', amount: 3 }];
  }
  if (mode === 'today-empty') logs = [];
  if (mode === 'today-stale') logs = [{ localDate: date, status: 'DONE', amount: 20 }];
  if (mode === 'edit') base.initialProgress = 1240; else base.initialProgress = 0;
  base.hasLogs = mode !== 'edit';
  base.unitLocked = mode !== 'today-empty';
  if (mode === 'today-empty') base.hasLogs = false;
  client.clear();
  (window as unknown as { __fePage: () => ReactNode }).__fePage = () => mode === 'create' ? <GoalCreatePage /> : mode === 'edit' ? <GoalEditPage goalId={base.id} /> : mode.startsWith('list') ? <GoalListPage /> : <TodayPage goalId={base.id} />;
  root.render(<QueryClientProvider client={client}><PrivateCacheGuard /><AppShell key={++visit} /></QueryClientProvider>);
}
(window as unknown as { __goalQA: unknown }).__goalQA = { mount, date,
  failure: (value: typeof failure) => { failure = value; },
  hold: () => { hold = true; },
  release: () => { hold = false; held.splice(0).forEach(resolve => resolve()); },
  otherDeviceSave: (amount: number) => { logs = [...logs.filter(l => l.localDate !== date), { localDate: date, status: 'DONE', amount }]; base.historyRevision = String(BigInt(base.historyRevision) + 1n); },
  configure: (settings: Partial<typeof base>) => { Object.assign(base, settings); void client.invalidateQueries({ queryKey: ['goals'] }); },
  historyOffline: (id: string | null, refresh = true) => { historyFailure = id; if (refresh) void client.invalidateQueries({ queryKey: ['goals'] }); },
  releaseHistory: () => { historyHold = false; heldHistory.splice(0).forEach(resolve => resolve()); },
  removeAchieved: () => { achievedVisible = false; void client.invalidateQueries({ queryKey: ['goals'] }); },
  state: () => ({ puts, creates, patches, logs, text: document.getElementById('app')?.textContent,
    feedback: document.querySelector('.fr-save-feedback')?.textContent, active: document.activeElement?.id,
    preview: document.querySelector('.fr-draft-preview:not(.fr-draft-preview--compact)')?.textContent ?? '',
    percent: document.querySelector('.fr-progress__percent')?.textContent, cumulative: document.querySelector('.fr-progress__amount')?.textContent,
    footprint: document.querySelector('.fr-footprint')?.textContent }),
};
mount('today');
