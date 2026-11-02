import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '../src/router.tsx';
import { authClient } from '../src/auth/client.ts';
import { PrivateCacheGuard, privateDataReady, usePrivateEpoch } from '../src/api/session-cache.ts';
import { goalsHttp } from '../src/api/goals-http.ts';
import { todayHttp } from '../src/api/today-http.ts';
import { ApiError } from '../src/api/client.ts';

// Actual hooks/Router/Better Auth; only API transport, visibility events and wall clock are synthetic.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const transport = (globalThis as any).__sessionTransport;
const host = document.getElementById('app')!;
const root = createRoot(host);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const goal = (id = 'goal') => ({ id, title: `${transport.owner}-PRIVATE-GOAL`, unit: 'minutes', totalRequired: 100,
  sessionAmount: 10, initialProgress: 0, progressDone: 0, today: '2026-10-10', todayStatus: 'UNRECORDED', timezone: 'UTC',
  recordStartDate: '2026-09-01', hasLogs: false, questionPrior: { a: null, b: null }, answerRevision: 1, goalSettingsRevision: 1 });
let saveError: unknown, getError: unknown;
let fresh: Record<string, unknown> = {};
let holdSave = false, rejectSave: ((error: unknown) => void) | undefined;
const savedResponse = async () => {
  if (holdSave) await new Promise((_resolve, reject) => { rejectSave = reject; });
  if (saveError) throw saveError;
  return { ...goal(), ...fresh };
};
const writes: { mode: string; body: unknown; key?: string; owner?: string }[] = [];
goalsHttp.listGoals = async () => [goal()];
// 履歴はこの保存失敗fixtureの対象外。足跡を未確認にし、auth/private write検出を緩めない。
todayHttp.listLogs = async () => { throw new TypeError('synthetic history unavailable in Goal failure fixture'); };
goalsHttp.getGoal = async id => { if (getError) throw getError; return { ...goal(id), ...fresh }; };
goalsHttp.updateGoal = async (_id, body) => { writes.push({ mode: 'edit', body }); return savedResponse(); };
goalsHttp.createGoal = async (body, key, owner) => { writes.push({ mode: 'create', body, key, owner }); return savedResponse(); };
let current: any;
const captures: { checking: boolean; privateDom: boolean }[] = [];
function Diagnostic() {
  const session = authClient.useSession(); const epoch = usePrivateEpoch();
  current = { owner: session.data?.user.id, checking: session.isPending || session.isRefetching || !!session.error, epoch };
  useLayoutEffect(() => { captures.push({ checking: current.checking,
    privateDom: Boolean(host.querySelector('#goal-title')) || Boolean(host.textContent?.includes('-PRIVATE')) }); });
  return null;
}
const ensure = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const settle = async () => { for (let i = 0; i < 15; i++) await act(tick); };
const input = () => host.querySelector<HTMLInputElement>('#goal-title');
// 初期質問は必須（#259）。両問で「回答しない」を選ぶ（押せない間は何もしない）
const choosePrior = async () => act(async () => {
  host.querySelectorAll<HTMLInputElement>('.r11-qp fieldset input[value=""]').forEach(radio => radio.click());
  await tick();
});
const submit = () => host.querySelector<HTMLButtonElement>('button[type="submit"]');
const totalMinutes = () => {
  const h = host.querySelector<HTMLInputElement>('#goal-totalRequired'), m = host.querySelector<HTMLInputElement>('#goal-totalRequired-minutes');
  return m ? String(Number(h?.value) * 60 + Number(m.value)) : h?.value;
};
const view = () => ({ title: input()?.value, total: totalMinutes(),
  amount: host.querySelector<HTMLInputElement>('#goal-sessionAmount')?.value,
  invalid: input()?.getAttribute('aria-invalid'), disabled: input()?.disabled, submitDisabled: submit()?.disabled,
  submitText: submit()?.textContent, conflict: host.textContent?.includes('ほかの画面で内容が変わりました') ?? false,
  // 保存失敗の案内。編集の結果が分からないとき（通信・5xx）は「保存を確認できません」（R5、#146）
  failed: (host.textContent?.includes('保存できませんでした') || host.textContent?.includes('保存を確認できません')) ?? false,
  saveUnknown: host.textContent?.includes('保存を確認できません') ?? false,
  unknown: host.textContent?.includes('作成結果を確認できませんでした') ?? false,
  recoveryBlockedNotice: host.textContent?.includes('作成の回復情報を確認できません') ?? false,
  totalInvalid: host.querySelector('#goal-totalRequired')?.getAttribute('aria-invalid'),
  unitInvalid: host.querySelector('[aria-labelledby="goal-unit-label"]')?.getAttribute('aria-invalid'),
  initialDisabled: host.querySelector<HTMLInputElement>('#goal-initialProgress')?.disabled });
const navigate = async (to: string) => { await act(async () => { void router.navigate({ to }); await tick(); }); await settle(); };
const set = async (selector: string, value: string) => act(async () => {
  const parts = selector === '#goal-totalRequired' && host.querySelector<HTMLInputElement>(selector + '-minutes');
  for (const [id, raw] of parts ? [[selector, String(Math.floor(Number(value) / 60))], [selector + '-minutes', String(Number(value) % 60)]] : [[selector, value]]) {
    const target = host.querySelector<HTMLInputElement>(id!)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, raw);
    target.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  }
});
const clickSave = async () => { await act(async () => { submit()!.click(); await tick(); }); await settle(); };
const realNow = Date.now; let advance = 0, visibility = 'visible';
Date.now = () => realNow() + advance;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
const startVisibility = () => {
  advance += 6000;
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
};
const visible = async () => act(async () => { startVisibility(); await tick(); });
const release = async () => {
  transport.hold = false;
  transport.held.splice(0).forEach((resolve: () => void) => resolve());
  await settle();
};
const api = (status: number, code: string) => new ApiError(status, { error: { code, message: 'synthetic rejection',
  ...(status === 422 ? { fields: [{ path: 'body/title', message: 'synthetic invalid title' }] } : {}) } });
async function run() {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><PrivateCacheGuard /><Diagnostic /><RouterProvider router={router} /></QueryClientProvider>);
    await tick();
  });
  await settle();
  const results = [], failures: string[] = [];
  const cases = [
    { label: 'edit409', mode: 'edit', error: api(409, 'GOAL_SETTINGS_CONFLICT') },
    { label: 'edit409/get503', mode: 'edit', error: api(409, 'GOAL_SETTINGS_CONFLICT'), getFails: true },
    { label: 'edit503', mode: 'edit', error: api(503, 'UNAVAILABLE') },
    { label: 'editNetwork', mode: 'edit', error: new TypeError('synthetic network failure') },
    { label: 'edit422', mode: 'edit', error: api(422, 'VALIDATION_ERROR') },
    { label: 'create422', mode: 'create', error: api(422, 'VALIDATION_ERROR') },
    { label: 'create503', mode: 'create', error: api(503, 'UNAVAILABLE') },
  ];
  for (const scenario of cases) {
    saveError = null;
    getError = null;
    await navigate('/');
    await navigate(scenario.mode === 'create' ? '/goals/new' : '/goals/goal/edit');
    await visible();
    await settle();
    ensure(input(), scenario.label + ': initial form absent');
    await set('#goal-title', 'A-PRIVATE-185-DRAFT');
    await set('#goal-totalRequired', '123');
    await set('#goal-sessionAmount', '17');
    await choosePrior();
    saveError = scenario.error;
    await clickSave();
    const before = view(), count = writes.length;
    ensure(before.title === 'A-PRIVATE-185-DRAFT', scenario.label + ': input was lost before session check');
    ensure(before.invalid === 'true' || before.failed || before.conflict, scenario.label + ': initial failure absent');
    // 結果が分からない編集の失敗は言い切らない。はっきり断られた失敗（409・422）は従来どおり
    if (scenario.label === 'edit503' || scenario.label === 'editNetwork') ensure(before.saveUnknown && !host.textContent?.includes('まだ保存されていません'), scenario.label + ': unknown result was stated as not saved');
    else ensure(!before.saveUnknown, scenario.label + ': definite failure was shown as unknown');
    const raw = sessionStorage.getItem('future-roi:create-attempt:A');
    transport.hold = true;
    const reads = transport.reads;
    await visible();
    await settle();
    ensure(transport.reads > reads && current.checking && !input() && !host.textContent?.includes('-PRIVATE'), scenario.label + ': checking did not remove private DOM');
    if (scenario.getFails) getError = api(503, 'UNAVAILABLE');
    await release(); const after = view();
    ensure(current.owner === 'A' && !current.checking && privateDataReady(current.epoch), scenario.label + ': healthy A confirmation did not complete');
    ensure(writes.length === count, scenario.label + ': automatic resend');
    ensure(location.pathname === (scenario.mode === 'create' ? '/goals/new' : '/goals/goal/edit'), scenario.label + ': unexpected navigation');
    if (raw) ensure(sessionStorage.getItem('future-roi:create-attempt:A') === raw, scenario.label + ': raw attempt changed during check');
    // A failed fresh GET may safely keep the form hidden. Test recovery before concluding its input was lost.
    let afterRecovery: ReturnType<typeof view> | undefined;
    if (scenario.getFails) {
      ensure(submit()?.disabled !== false, scenario.label + ': save allowed before latest GET recovery');
      getError = null;
      const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button =>
        ['再読み込み', '最新の内容を読み込む'].includes(button.textContent?.trim() ?? ''));
      ensure(retry, scenario.label + ': explicit GET recovery action absent');
      await act(async () => { retry!.click(); await tick(); }); await settle();
      afterRecovery = view();
      ensure(writes.length === count, scenario.label + ': reload automatically saved');
    }
    const recovered = afterRecovery ?? after;
    const preserved = recovered.title === before.title && recovered.total === before.total && recovered.amount === before.amount
      && recovered.invalid === before.invalid && recovered.disabled === before.disabled
      && (scenario.getFails ? recovered.conflict || Boolean(host.textContent?.includes('最新の設定・回答を読み込みました'))
        : recovered.conflict === before.conflict && recovered.failed === before.failed && recovered.unknown === before.unknown
          && recovered.submitDisabled === before.submitDisabled && recovered.submitText === before.submitText);
    if (!preserved) failures.push(scenario.label);
    results.push({ label: scenario.label, owner: current.owner, before, after, ...(afterRecovery ? { afterRecovery } : {}), preserved, writesDuringCheck: writes.length - count,
      rawAttemptUnchanged: raw ? sessionStorage.getItem('future-roi:create-attempt:A') === raw : null, privateDomRemoved: true });
    // End a result-unknown create only through explicit same key/body confirmation, without resetting storage.
    if (raw) {
      saveError = null;
      getError = null;
      const previous = writes.at(-1)!;
      await clickSave();
      ensure(writes.length === count + 1, 'explicit create recovery did not send exactly once');
      ensure(JSON.stringify(writes.at(-1)) === JSON.stringify(previous), 'explicit recovery changed owner/key/body');
      ensure(sessionStorage.getItem('future-roi:create-attempt:A') === null && location.pathname === '/goals', 'explicit recovery did not end attempt');
    }
  }
  const hidden = (label: string) => ensure(!input() && !host.textContent?.includes('-PRIVATE'), label + ': private DOM exposed');
  const check = async () => { await visible(); await settle(); };
  const atom = authClient.$store.atoms.session;
  let knownSession = atom.get().data!;
  const atomOwner = (owner: string | null) => {
    const previous = atom.get();
    if (previous.data) knownSession = previous.data;
    atom.set({ ...previous, data: owner === null ? null : { ...knownSession, user: { ...knownSession.user, id: owner } },
      error: null, isPending: false, isRefetching: false });
  };
  const reset = async (mode = 'edit') => {
    saveError = getError = null;
    fresh = {};
    holdSave = false;
    rejectSave = undefined;
    transport.hold = false;
    transport.failure = null;
    transport.owner = 'A';
    await navigate('/'); await check();
    await navigate(mode === 'create' ? '/goals/new' : '/goals/goal/edit');
    ensure(input(), 'reset form missing');
    await set('#goal-title', 'A-PRIVATE-185-DRAFT');
    await set('#goal-totalRequired', '123');
    await set('#goal-sessionAmount', '17');
    await choosePrior();
  };
  const failed = async (error = api(503, 'UNAVAILABLE')) => { saveError = error; await clickSave(); };
  const record = (label: string, extra: Record<string, unknown> = {}) => results.push({ label, preserved: true, owner: current.owner, after: view(), ...extra } as any);
  const absentOldFailure = (label: string) => ensure(!view().failed && !view().conflict && view().invalid !== 'true'
    && view().title !== 'A-PRIVATE-185-DRAFT', label + ': old failure/draft resurrected');
  const formSubmit = async () => {
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await tick();
    });
    await settle();
  };
  const reload = async () => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '最新の内容を読み込む');
    ensure(button, 'explicit latest GET action missing');
    await act(async () => { button!.click(); await tick(); });
    await settle();
  };
  for (const failure of ['503', '429', 'network']) {
    await reset();
    await failed();
    const count = writes.length;
    transport.failure = failure;
    await check();
    hidden('session/' + failure);
    transport.failure = null;
    await check();
    absentOldFailure('session/' + failure);
    ensure(writes.length === count, 'session failure automatic resend'); record('session/' + failure + '/A', { writesDuringCheck: 0 });
  }
  for (const boundary of ['owner', 'batchedOwner', 'batchedLogout', 'signal', 'storage', 'goal', 'public', 'pendingGoal']) {
    await reset();
    await failed();
    const count = writes.length;
    if (boundary === 'owner') {
      transport.owner = 'B';
      await check();
      transport.owner = 'A';
      await check();
    }
    else if (boundary === 'batchedOwner' || boundary === 'batchedLogout') {
      await act(async () => {
        atomOwner(boundary === 'batchedOwner' ? 'B' : null);
        atomOwner('A');
        await tick();
      }); await settle();
    } else if (boundary === 'signal') {
      await act(async () => {
        const signal = authClient.$store.atoms.$sessionSignal;
        signal.set(!signal.get());
        await tick();
      });
      await settle();
      await check();
    } else if (boundary === 'storage') {
      await act(async () => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'better-auth.message', newValue: JSON.stringify({ event: 'session' }) }));
        await tick();
      });
      await settle();
      await check();
    } else if (boundary === 'goal') { await navigate('/goals/goal2/edit'); await navigate('/goals/goal/edit'); }
    else if (boundary === 'public') { await navigate('/'); await navigate('/goals/goal/edit'); }
    else {
      await act(async () => {
        void router.navigate({ to: '/goals/goal2/edit' });
        void router.navigate({ to: '/goals/goal/edit' });
        await tick();
      });
      await settle();
    }
    ensure(input(), boundary + ': fresh form missing'); absentOldFailure(boundary);
    ensure(writes.length === count, boundary + ': automatic resend'); record('departure/' + boundary, { writesDuringCheck: 0 });
  }
  // A restored failure belongs to its visit; it must never become an ordinary
  // idle draft merely because its new mutation observer has isError=false.
  for (const restored of [false, true]) {
    for (const scenario of cases.filter(c => c.mode === 'edit' && !c.getFails)) {
      const label = `${restored ? 'normal-check-restored' : 'direct-control'}/${scenario.label}`;
      await reset();
      await failed(scenario.error);
      const count = writes.length;
      if (restored) {
        transport.hold = true;
        await visible();
        await settle();
        hidden(label + '/checking');
        ensure(current.checking, label + ': normal owner check did not start');
        await release();
      }
      const beforeNavigation = view();
      ensure(current.owner === 'A' && !current.checking && privateDataReady(current.epoch), label + ': A not confirmed');
      ensure(beforeNavigation.title === 'A-PRIVATE-185-DRAFT' && beforeNavigation.total === '123' && beforeNavigation.amount === '17', label + ': initial/restored failure input absent');
      ensure(scenario.label === 'edit409' ? beforeNavigation.conflict && beforeNavigation.submitDisabled
        : scenario.label === 'edit422' ? beforeNavigation.invalid === 'true' : beforeNavigation.failed,
      label + ': initial/restored failure semantics absent');
      await act(async () => {
        void router.navigate({ to: '/goals/goal2/edit' });
        ensure(router.state.matches.at(-1)?.params.goalId === 'goal', label + ': Goal2 unexpectedly committed before return');
        void router.navigate({ to: '/goals/goal/edit' }); await tick();
      }); await settle();
      const afterNavigation = view();
      const discarded = afterNavigation.title === 'A-PRIVATE-GOAL' && afterNavigation.total === '100' && afterNavigation.amount === '10'
        && !afterNavigation.conflict && !afterNavigation.failed && afterNavigation.invalid !== 'true';
      ensure(current.owner === 'A' && writes.length === count, label + ': owner changed or automatic resend');
      if (!discarded) failures.push(label);
      results.push({ label, preserved: discarded, owner: current.owner, beforeNavigation, afterNavigation,
        privateDomRemoved: restored ? true : null, writesDuringNavigation: writes.length - count } as any);
    }
  }
  for (const mode of ['edit', 'create']) {
    await reset(mode);
    await failed(api(422, 'VALIDATION_ERROR'));
    await set('#goal-title', 'A-PRIVATE-CORRECTED');
    const count = writes.length; await check();
    ensure(view().title === 'A-PRIVATE-CORRECTED' && view().invalid !== 'true' && !view().failed && !view().disabled, mode + ': correction lost');
    ensure(writes.length === count && sessionStorage.getItem('future-roi:create-attempt:A') === null, '422 correction sent/generated attempt');
    record(mode + '/422-correct-check');
  }
  await reset(); await failed(new ApiError(422, { error: { code: 'VALIDATION_ERROR', message: 'synthetic multiple fields',
    fields: [{ path: 'body/title', message: 'synthetic title' }, { path: 'body/totalRequired', message: 'synthetic total' }] } }));
  const multipleCount = writes.length;
  await set('#goal-sessionAmount', '18'); await check();
  ensure(view().invalid === 'true' && view().totalInvalid === 'true' && view().amount === '18', 'unrelated edit cleared field failures');
  await set('#goal-title', 'A-PRIVATE-CORRECTED'); await check();
  ensure(view().invalid !== 'true' && view().totalInvalid === 'true' && view().title === 'A-PRIVATE-CORRECTED', 'partial correction lost remaining failure');
  await set('#goal-totalRequired', '124'); await check();
  ensure(view().invalid !== 'true' && view().totalInvalid !== 'true' && view().total === '124' && view().amount === '18', 'complete correction resurrected failures');
  ensure(writes.length === multipleCount, 'partial correction resent'); record('edit/422-multiple-partial-check');
  try {
  await reset();
    await failed(api(409, 'GOAL_SETTINGS_CONFLICT'));
    const conflictCount = writes.length;
  fresh = { unit: 'sessions', unitLocked: true, hasLogs: true, answerRevision: 8, goalSettingsRevision: 9, totalRequired: 150,
    sessionAmount: 20, initialProgress: 5, targetDate: '2099-01-01' };
  await check();
  ensure(view().title === 'A-PRIVATE-185-DRAFT' && view().total === '123' && view().amount === '17', 'fresh GET replaced conflicted input: ' + JSON.stringify(view()));
  ensure(view().submitDisabled, 'fresh GET cleared conflict lock: ' + JSON.stringify(view()));
  ensure(!view().initialDisabled && host.querySelector<HTMLSelectElement>('#goal-timezone')?.disabled, 'fresh timezone lock or initial correction eligibility missing');
  await formSubmit(); ensure(writes.length === conflictCount, 'programmatic conflict submit sent');
  await reload(); ensure(!view().conflict && view().title === 'A-PRIVATE-185-DRAFT' && view().total === '123', 'explicit rebase lost edited input');
  await check(); ensure(!view().conflict && view().title === 'A-PRIVATE-185-DRAFT', 'check resurrected old409');
  const lockedRadios = [...host.querySelectorAll<HTMLInputElement>('input[name="goal-unit"]')];
  ensure(lockedRadios.length === 2 && lockedRadios.every(b => b.matches(':disabled')), 'fresh unitLocked missing');
  await set('#goal-targetDate', '2020-01-01'); await formSubmit();
  ensure(host.querySelector('#goal-targetDate')?.getAttribute('aria-invalid') === 'true' && writes.length === conflictCount, 'fresh date validation missing');
  await set('#goal-targetDate', '2099-01-02');
    saveError = api(503, 'UNAVAILABLE');
    await formSubmit();
  ensure(writes.length === conflictCount + 1 && (writes.at(-1)!.body as any).expectedGoalSettingsRevision === 9, 'explicit rebase did not use latest revision');
  record('edit/409-fresh-lock-rebase-validation', { freshRevision: 9 });
  } catch (error) {
    failures.push('edit/409-fresh-lock-rebase-validation');
    results.push({ label: 'edit/409-fresh-lock-rebase-validation', preserved: false, error: String(error), view: view() } as any);
  }
  await reset();
  await act(async () => { host.querySelector<HTMLInputElement>('input[name="goal-unit"][value="sessions"]')!.click(); await tick(); }); await settle();
  await failed(api(409, 'GOAL_SETTINGS_CONFLICT')); const editedUnitCount = writes.length;
  fresh = { unit: 'minutes', unitLocked: true, hasLogs: true, goalSettingsRevision: 10 };
  await check(); ensure(view().submitDisabled, 'fresh unit lock cleared conflict');
  await reload(); await check();
  await formSubmit(); ensure(writes.length === editedUnitCount, 'edited incompatible unit sent after rebase');
  const restoreUnit = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('保存済みの単位'));
  ensure(restoreUnit, 'edited unit was lost instead of retaining/validating it');
  await act(async () => { restoreUnit!.click(); await tick(); }); await settle();
  saveError = api(503, 'UNAVAILABLE'); await formSubmit();
  ensure(writes.length === editedUnitCount + 1 && (writes.at(-1)!.body as any).expectedGoalSettingsRevision === 10, 'restored unit did not use explicit latest revision');
  record('edit/409-edited-unit-locked-rebase');
  for (const scenario of cases.filter(c => !c.getFails)) {
    await reset(scenario.mode);
    holdSave = true;
    await clickSave();
    ensure(rejectSave, scenario.label + ': pending write not reached');
    const count = writes.length, raw = sessionStorage.getItem('future-roi:create-attempt:A');
    transport.hold = true;
    await visible();
    await settle();
    hidden(scenario.label);
    await act(async () => { rejectSave!(scenario.error); await tick(); });
    await settle();
    hidden(scenario.label + '/rejected');
    ensure(current.checking, 'pending rejection ended session check');
    await release();
    const restored = view();
    ensure(restored.title === 'A-PRIVATE-185-DRAFT' && (restored.invalid === 'true' || restored.failed || restored.conflict), scenario.label + ': pending failure lost');
    ensure(writes.length === count, scenario.label + ': pending rejection resent');
    if (scenario.mode === 'create') {
      if (scenario.label === 'create422') ensure(!restored.disabled && sessionStorage.getItem('future-roi:create-attempt:A') === null, 'pending422 attempt not ended/editable');
      else {
        ensure(restored.disabled && sessionStorage.getItem('future-roi:create-attempt:A') === raw, 'pending503 raw not frozen');
        const prior = writes.at(-1);
        holdSave = false;
        saveError = null;
        await clickSave();
        ensure(JSON.stringify(writes.at(-1)) === JSON.stringify(prior) && writes.length === count + 1, 'pending503 recovery changed operation');
      }
    }
    record('pending-check/' + scenario.label, { privateDomRemoved: true, automaticResend: false });
  }
  await reset('create');
  holdSave = true;
  await clickSave();
  const k1 = JSON.parse(sessionStorage.getItem('future-roi:create-attempt:A')!);
  const k2 = JSON.stringify({ ...k1, key: '22222222-2222-4222-8222-222222222222', body: { ...k1.body, title: 'A-PRIVATE-K2' } });
  const bRaw = JSON.stringify({ ...k1, owner: 'B', key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', body: { ...k1.body, title: 'B-PRIVATE-RAW' } });
  sessionStorage.setItem('future-roi:create-attempt:A', k2); sessionStorage.setItem('future-roi:create-attempt:B', bRaw);
  transport.hold = true;
  await visible();
  await settle();
  await act(async () => { rejectSave!(api(422, 'VALIDATION_ERROR')); await tick(); });
  await settle();
  hidden('K1/422');
  await release(); ensure(view().title === 'A-PRIVATE-K2' && view().disabled && view().invalid !== 'true', 'K1 field error contaminated K2');
  ensure(sessionStorage.getItem('future-roi:create-attempt:A') === k2 && sessionStorage.getItem('future-roi:create-attempt:B') === bRaw, 'late422 changed raw');
  const k2Count = writes.length;
  holdSave = false;
  saveError = null;
  await clickSave();
  ensure(writes.length === k2Count + 1 && writes.at(-1)!.key === JSON.parse(k2).key && sessionStorage.getItem('future-roi:create-attempt:B') === bRaw, 'explicit K2 did not preserve B raw');
  record('create/late-K1-422-K2-B-raw');
  for (const boundary of ['public', 'goal', 'pendingGoal', 'owner']) {
    await reset();
    holdSave = true;
    await clickSave();
    const rejectOld = rejectSave!;
    if (boundary === 'owner') {
      transport.owner = 'B';
      await check();
      transport.owner = 'A';
      await check();
    }
    else if (boundary === 'public') { await navigate('/'); await navigate('/goals/goal/edit'); }
    else if (boundary === 'goal') { await navigate('/goals/goal2/edit'); await navigate('/goals/goal/edit'); }
    else {
      await act(async () => {
        void router.navigate({ to: '/goals/goal2/edit' });
        void router.navigate({ to: '/goals/goal/edit' });
        await tick();
      });
      await settle();
    }
    const count = writes.length;
    await act(async () => { rejectOld(api(409, 'GOAL_SETTINGS_CONFLICT')); await tick(); });
    await settle();
    ensure(input(), boundary + ': form blocked after stale result'); absentOldFailure('late409/' + boundary);
    ensure(writes.length === count, 'stale409 automatic resend'); record('late409/departure/' + boundary);
  }
  for (const boundary of ['healthy', 'healthy-batched', 'owner', 'visit']) {
    const label = 'create/prepare-quota/' + boundary;
    await reset('create'); const count = writes.length;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') throw new DOMException('synthetic quota exceeded', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
    let before: ReturnType<typeof view>, after: ReturnType<typeof view>, preserved: boolean;
    try {
      if (boundary === 'healthy-batched') {
        before = view(); transport.hold = true;
        await act(async () => {
          submit()!.click();
          startVisibility();
          await tick();
        }); await settle();
        hidden(label); ensure(current.checking, label + ': same-batch check not started');
        ensure(writes.length === count && sessionStorage.getItem('future-roi:create-attempt:A') === null, label + ': same-batch POST/raw before prepare');
        await release(); after = view();
        preserved = after.title === before.title && after.total === before.total && after.amount === before.amount
          && after.failed && after.submitText === 'もう一度保存' && !after.disabled && !after.submitDisabled;
      } else {
      await clickSave(); before = view();
      ensure(before.title === 'A-PRIVATE-185-DRAFT' && before.failed && before.submitText === 'もう一度保存', label + ': preparation failure absent');
      ensure(writes.length === count && sessionStorage.getItem('future-roi:create-attempt:A') === null, label + ': POST/raw before durable prepare');
      if (boundary === 'healthy') {
        transport.hold = true;
        await visible();
        await settle();
        hidden(label);
        await release();
        after = view();
        preserved = after.title === before.title && after.total === before.total && after.amount === before.amount
          && after.failed && after.submitText === 'もう一度保存' && !after.disabled && !after.submitDisabled;
      } else {
        if (boundary === 'owner') {
          transport.owner = 'B';
          await check();
          transport.owner = 'A';
          await check();
        }
        else { await navigate('/'); await navigate('/goals/new'); }
        after = view();
        preserved = after.title === '' && !after.failed && !after.recoveryBlockedNotice && !after.disabled && !after.submitDisabled;
      }
      }
      ensure(current.owner === 'A' && writes.length === count, label + ': wrong owner/automatic POST');
    } finally { Storage.prototype.setItem = originalSet; }
    if (!preserved!) failures.push(label);
    results.push({ label, preserved: preserved!, owner: current.owner, before: before!, after: after!,
      writesBeforeExplicitRetry: writes.length - count, rawBeforeExplicitRetry: sessionStorage.getItem('future-roi:create-attempt:A') } as any);
    if (boundary === 'healthy' || boundary === 'healthy-batched') {
      saveError = null; await clickSave();
      ensure(writes.length === count + 1 && location.pathname === '/goals' && sessionStorage.getItem('future-roi:create-attempt:A') === null,
        label + ': explicit retry after available storage did not complete once');
    }
  }
  {
    const label = 'create/422-restored-corrected-next-prepare-quota';
    await reset('create'); await failed(api(422, 'VALIDATION_ERROR'));
    const rejectedKey = writes.at(-1)!.key; await check();
    ensure(view().invalid === 'true' && !view().disabled && sessionStorage.getItem('future-roi:create-attempt:A') === null,
      label + ': rejected operation not ended/restored');
    await set('#goal-title', 'A-PRIVATE-CORRECTED-NEXT');
    ensure(view().invalid !== 'true', label + ': definitive field correction absent');
    const count = writes.length, originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') throw new DOMException('synthetic next quota exceeded', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
    let before: ReturnType<typeof view>, after: ReturnType<typeof view>, preserved: boolean;
    try {
      await clickSave(); before = view();
      ensure(before.failed && before.title === 'A-PRIVATE-CORRECTED-NEXT', label + ': next preparation failure absent');
      transport.hold = true;
      await visible();
      await settle();
      hidden(label);
      await release();
      after = view();
      preserved = after.title === before.title && after.total === before.total && after.amount === before.amount
        && after.failed && after.submitText === 'もう一度保存' && !after.disabled && !after.submitDisabled && after.invalid !== 'true';
      ensure(writes.length === count && sessionStorage.getItem('future-roi:create-attempt:A') === null, label + ': POST/raw before explicit retry');
    } finally { Storage.prototype.setItem = originalSet; }
    if (!preserved!) failures.push(label);
    results.push({ label, preserved: preserved!, before: before!, after: after!, writesBeforeExplicitRetry: writes.length - count } as any);
    saveError = null; await clickSave();
    ensure(writes.length === count + 1 && writes.at(-1)!.key !== rejectedKey
      && (writes.at(-1)!.body as any).title === 'A-PRIVATE-CORRECTED-NEXT'
      && sessionStorage.getItem('future-roi:create-attempt:A') === null && location.pathname === '/goals',
    label + ': explicit retry reused rejected K1 or lost corrected body');
  }
  {
    const label = 'create/422-cleanup-removeItem-gate';
    await reset('create'); const count = writes.length;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') throw new Error('synthetic cleanup storage unavailable');
      return originalRemove.call(this, key);
    };
    let before: ReturnType<typeof view>, after: ReturnType<typeof view>, raw: string, sent: typeof writes[number], preserved: boolean;
    try {
      await failed(api(422, 'VALIDATION_ERROR')); before = view();
      raw = sessionStorage.getItem('future-roi:create-attempt:A')!; sent = writes.at(-1)!;
      ensure(raw && writes.length === count + 1 && before.invalid === 'true' && before.recoveryBlockedNotice && before.disabled && before.submitDisabled,
        label + ': cleanup failure did not block recovery');
      transport.hold = true;
      await visible();
      await settle();
      hidden(label);
      await release();
      after = view();
      preserved = after.invalid === 'true' && after.recoveryBlockedNotice && after.disabled === true && after.submitDisabled === true
        && after.title === 'A-PRIVATE-185-DRAFT' && sessionStorage.getItem('future-roi:create-attempt:A') === raw;
      ensure(writes.length === count + 1, label + ': automatic resend');
    } finally { Storage.prototype.removeItem = originalRemove; }
    if (!preserved!) failures.push(label);
    results.push({ label, preserved: preserved!, before: before!, after: after!, rawUnchanged: sessionStorage.getItem('future-roi:create-attempt:A') === raw!, automaticResend: false } as any);
    // Leaving through the recovery list and reopening is explicit; the old raw
    // remains frozen until its matching key/body receives a confirmed result.
    await navigate('/goals'); await navigate('/goals/new');
    ensure(view().disabled && !view().submitDisabled && sessionStorage.getItem('future-roi:create-attempt:A') === raw!, label + ': explicit recovery lost operation');
    saveError = null; await clickSave();
    ensure(writes.length === count + 2 && JSON.stringify(writes.at(-1)) === JSON.stringify(sent!)
      && sessionStorage.getItem('future-roi:create-attempt:A') === null && location.pathname === '/goals', label + ': explicit recovery changed operation or did not finish');
  }
  {
    const label = 'create/410-restart-cleanup-samebatch-gate';
    await reset('create'); await failed(api(410, 'CREATE_RESULT_DELETED'));
    const count = writes.length, raw = sessionStorage.getItem('future-roi:create-attempt:A')!, sent = writes.at(-1)!;
    const restart = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '新しいGoalとして作成');
    ensure(raw && restart() && view().disabled && view().submitDisabled, label + ': deleted result/restart absent');
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') throw new Error('synthetic restart cleanup unavailable');
      return originalRemove.call(this, key);
    };
    let after: ReturnType<typeof view>, preserved: boolean;
    try {
      transport.hold = true;
      await act(async () => {
        restart()!.click();
        startVisibility();
        await tick();
      }); await settle();
      hidden(label); ensure(current.checking, label + ': same-batch check absent');
      await release(); after = view();
      preserved = after.recoveryBlockedNotice && after.disabled === true && after.submitDisabled === true
        && after.title === 'A-PRIVATE-185-DRAFT' && sessionStorage.getItem('future-roi:create-attempt:A') === raw;
      ensure(writes.length === count, label + ': restart/check automatically posted');
    } finally { Storage.prototype.removeItem = originalRemove; }
    if (!preserved!) failures.push(label);
    results.push({ label, preserved: preserved!, after: after!, rawUnchanged: sessionStorage.getItem('future-roi:create-attempt:A') === raw, writesDuringCheck: writes.length - count } as any);
    // Recover the stored operation explicitly, then only the visible restart
    // may end this deleted result and permit a new operation.
    await navigate('/goals');
    await navigate('/goals/new');
    await clickSave();
    ensure(writes.length === count + 1 && JSON.stringify(writes.at(-1)) === JSON.stringify(sent) && restart(), label + ': explicit deleted confirmation changed operation');
    await act(async () => { restart()!.click(); await tick(); }); await settle();
    ensure(sessionStorage.getItem('future-roi:create-attempt:A') === null && !view().disabled && !view().submitDisabled
      && writes.length === count + 1, label + ': available-storage restart did not end matching raw or posted a new operation');
  }
  const resumeCorrection = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '入力の訂正を再開');
  const nulTitle = 'A-PRIVATE-NUL\u0000TITLE';
  const clickResume = async () => {
    ensure(resumeCorrection(), 'explicit correction cleanup action absent');
    await act(async () => { resumeCorrection()!.click(); await tick(); }); await settle();
  };
  {
    const label = 'create/NUL422-cleanup-explicit-correction';
    await reset('create');
    await set('#goal-title', nulTitle);
    ensure(input()?.value === nulTitle, label + ': actual DOM NUL absent');
    const count = writes.length, originalRemove = Storage.prototype.removeItem; let removeThrows = 0;
    Storage.prototype.removeItem = function(key: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') { removeThrows++; throw new Error('synthetic NUL cleanup unavailable'); }
      return originalRemove.call(this, key);
    };
    let raw: string, oldKey: string, before: ReturnType<typeof view>, after: ReturnType<typeof view>;
    try {
      await failed(api(422, 'VALIDATION_ERROR'));
      raw = sessionStorage.getItem('future-roi:create-attempt:A')!;
      oldKey = writes.at(-1)!.key!;
      before = view();
      ensure((writes.at(-1)!.body as any).title === nulTitle && before.title === nulTitle && before.invalid === 'true'
        && before.disabled && before.submitDisabled && before.recoveryBlockedNotice, label + ': initial NUL rejection/gate absent');
      transport.hold = true;
      await visible();
      await settle();
      hidden(label);
      await release();
      after = view();
      ensure(after.title === nulTitle && after.total === '123' && after.amount === '17' && after.invalid === 'true'
        && after.disabled && after.submitDisabled && after.recoveryBlockedNotice && resumeCorrection(), label + ': NUL failure lost after confirmation');
      const throwsBefore = removeThrows; await clickResume();
      ensure(removeThrows === throwsBefore + 1 && writes.length === count + 1 && sessionStorage.getItem('future-roi:create-attempt:A') === raw
        && view().title === nulTitle && view().invalid === 'true' && view().recoveryBlockedNotice && view().submitDisabled,
      label + ': failed explicit cleanup changed raw, errors or posted');
    } finally { Storage.prototype.removeItem = originalRemove; }
    transport.hold = true;
    await act(async () => {
      resumeCorrection()!.click();
      startVisibility();
      await tick();
    });
    await settle();
    hidden(label + '/cleanup-confirmation');
    ensure(sessionStorage.getItem('future-roi:create-attempt:A') === null && writes.length === count + 1, label + ': successful cleanup batch did not end raw or posted');
    await release();
    ensure(sessionStorage.getItem('future-roi:create-attempt:A') === null && view().title === nulTitle && view().invalid === 'true'
      && !view().disabled && !view().submitDisabled && !view().recoveryBlockedNotice && writes.length === count + 1,
    label + ': available-storage cleanup lost field error or resent');
    await check(); ensure(view().title === nulTitle && view().invalid === 'true' && !view().disabled, label + ': editable field error not retained');
    await set('#goal-title', 'A-PRIVATE-NUL-CORRECTED');
    saveError = null;
    await clickSave();
    ensure(writes.length === count + 2 && writes.at(-1)!.key !== oldKey! && (writes.at(-1)!.body as any).title === 'A-PRIVATE-NUL-CORRECTED'
      && (writes.at(-1)!.body as any).totalRequired === 123 && (writes.at(-1)!.body as any).sessionAmount === 17
      && sessionStorage.getItem('future-roi:create-attempt:A') === null && location.pathname === '/goals', label + ': corrected explicit POST changed fields or reused rejected key');
    record(label, { before: before!, afterConfirmation: after!, actualNUL: true, originalRawRetainedUntilExplicitCleanup: true,
      postsBeforeExplicitCorrectedSave: 1, correctedExplicitPosts: 1, removeThrows, newKey: true });
  }
  {
    const label = 'create/NUL422-late-checking-cleanup-failure';
    await reset('create');
    await set('#goal-title', nulTitle);
    const count = writes.length;
    holdSave = true;
    await clickSave();
    ensure(rejectSave, label + ': held save absent');
    const raw = sessionStorage.getItem('future-roi:create-attempt:A')!, oldKey = writes.at(-1)!.key!;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') throw new Error('synthetic late NUL cleanup unavailable');
      return originalRemove.call(this, key);
    };
    let after: ReturnType<typeof view>;
    try {
      transport.hold = true;
      await visible();
      await settle();
      hidden(label);
      await act(async () => { rejectSave!(api(422, 'VALIDATION_ERROR')); await tick(); });
      await settle();
      hidden(label + '/late-rejection');
      await release(); after = view();
      ensure(after.title === nulTitle && after.total === '123' && after.amount === '17' && after.invalid === 'true'
        && after.recoveryBlockedNotice && after.disabled && after.submitDisabled && resumeCorrection()
        && sessionStorage.getItem('future-roi:create-attempt:A') === raw && writes.length === count + 1,
      label + ': deferred cleanup gate hid known NUL field context');
    } finally { Storage.prototype.removeItem = originalRemove; }
    await clickResume();
    ensure(view().invalid === 'true' && !view().disabled && sessionStorage.getItem('future-roi:create-attempt:A') === null && writes.length === count + 1,
      label + ': late rejection explicit cleanup lost fields or posted');
    await set('#goal-title', 'A-PRIVATE-LATE-NUL-CORRECTED');
    holdSave = false;
    saveError = null;
    await clickSave();
    ensure(writes.length === count + 2 && writes.at(-1)!.key !== oldKey && (writes.at(-1)!.body as any).title === 'A-PRIVATE-LATE-NUL-CORRECTED'
      && location.pathname === '/goals' && sessionStorage.getItem('future-roi:create-attempt:A') === null, label + ': corrected late failure reused key or did not finish');
    record(label, { afterConfirmation: after!, rawUnchangedUntilExplicitCleanup: true, automaticPosts: 0, newKey: true });
  }
  for (const boundary of ['owner', 'visit', 'same-key-body', 'K2']) {
    const label = 'create/NUL422-boundary/' + boundary;
    await reset('create'); await set('#goal-title', nulTitle);
    const count = writes.length, originalRemove = Storage.prototype.removeItem; let raw: string, replacement: string | undefined;
    Storage.prototype.removeItem = function(key: string) {
      if (this === sessionStorage && key === 'future-roi:create-attempt:A') throw new Error('synthetic boundary cleanup unavailable');
      return originalRemove.call(this, key);
    };
    try { await failed(api(422, 'VALIDATION_ERROR')); raw = sessionStorage.getItem('future-roi:create-attempt:A')!; }
    finally { Storage.prototype.removeItem = originalRemove; }
    if (boundary === 'owner') {
      const oldAction = resumeCorrection(); ensure(oldAction, label + ': live cleanup action absent');
      await act(async () => {
        atomOwner('B');
        oldAction!.click();
        atomOwner('A');
        await tick();
      }); await settle();
      ensure(sessionStorage.getItem('future-roi:create-attempt:A') === raw!, label + ': stale owner click cleared raw');
      transport.owner = 'B';
      await check();
      transport.owner = 'A';
      await check();
    }
    else if (boundary === 'visit') {
      const oldAction = resumeCorrection(); ensure(oldAction, label + ': live cleanup action absent');
      await act(async () => {
        void router.navigate({ to: '/' });
        oldAction!.click();
        await tick();
      }); await settle();
      ensure(sessionStorage.getItem('future-roi:create-attempt:A') === raw!, label + ': stale visit click cleared raw');
      await navigate('/goals/new');
    }
    else {
      const previous = JSON.parse(raw!);
      replacement = JSON.stringify({ ...previous, ...(boundary === 'K2' ? { key: '66666666-6666-4666-8666-666666666666' } : {}),
        body: { ...previous.body, title: 'A-PRIVATE-REPLACEMENT-' + boundary } });
      sessionStorage.setItem('future-roi:create-attempt:A', replacement); await check();
    }
    const after = view();
    ensure(writes.length === count + 1 && after.title !== nulTitle && after.invalid !== 'true' && !resumeCorrection(), label + ': old memory adopted/cleanup offered/automatic POST');
    ensure(sessionStorage.getItem('future-roi:create-attempt:A') === (replacement ?? raw!), label + ': boundary altered stored raw');
    if (!replacement) ensure(after.recoveryBlockedNotice && after.disabled && after.submitDisabled && after.title === '', label + ': strict initial-load gate missing');
    else ensure(after.title === JSON.parse(replacement).body.title && after.disabled && !after.recoveryBlockedNotice, label + ': replacement operation not loaded independently');
    record(label, { after, oldNULMemoryRejected: true, rawUnchanged: true, automaticPosts: 0,
      staleCleanupClickRejected: boundary === 'owner' || boundary === 'visit' ? true : null });
    if (replacement) {
      saveError = null;
      await clickSave();
      const replay = writes.at(-1)!;
      ensure(writes.length === count + 2 && replay.key === JSON.parse(replacement).key && JSON.stringify(replay.body) === JSON.stringify(JSON.parse(replacement).body)
        && sessionStorage.getItem('future-roi:create-attempt:A') === null, label + ': explicit replacement confirmation altered operation');
    } else {
      // Test-only seed disposal follows the no-clear/no-trust assertions; these
      // invalid operations intentionally have no product cleanup authority.
      originalRemove.call(sessionStorage, 'future-roi:create-attempt:A');
    }
  }
  {
    const label = 'create/corrupt-raw-initial-load-no-trust';
    const variations = [];
    for (const raw of ['{synthetic invalid JSON', JSON.stringify({ owner: 'A', key: '77777777-7777-4777-8777-777777777777',
      body: { title: nulTitle, unit: 'minutes', totalRequired: 123, sessionAmount: 17, initialProgress: 0, timezone: 'UTC', questionPrior: { a: null, b: null } } })]) {
      await reset('create');
        await navigate('/');
        const count = writes.length;
      sessionStorage.setItem('future-roi:create-attempt:A', raw);
        await navigate('/goals/new');
        await check();
      const after = view();
      ensure(after.title === '' && after.invalid !== 'true' && after.recoveryBlockedNotice && after.disabled && after.submitDisabled && !resumeCorrection(), label + ': untrusted raw accepted/correction offered');
      await formSubmit();
        ensure(writes.length === count && sessionStorage.getItem('future-roi:create-attempt:A') === raw, label + ': untrusted raw cleared or posted');
      variations.push({ schema: raw.startsWith('{synthetic') ? 'invalid-json' : 'NUL-invalid-schema', after, rawUnchanged: true, posts: 0 });
      // Remove only this artificial fixture seed after proving product refusal.
      sessionStorage.removeItem('future-roi:create-attempt:A');
    }
    record(label, { variations });
  }
  ensure(!captures.some(c => c.checking && c.privateDom), 'private DOM was observed during session check');
  ensure(transport.writes === 0, 'unexpected auth/private transport writes');
  await act(async () => root.unmount());
  client.clear();
  Date.now = realNow;
  return { results, failures, authWrites: transport.writes, writes: writes.length, observations: captures.length };
}
run().then(result => { document.getElementById('result')!.textContent = JSON.stringify({ ok: true, ...result }); })
  .catch(error => { document.getElementById('result')!.textContent = JSON.stringify({ ok: false, error: error.stack ?? String(error) }); });
