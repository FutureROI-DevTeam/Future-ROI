import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Goal, GoalR11, Log, TodayR11 } from '@contracts';
import { goalKeys, goalsHttp } from '../../api/goals-http.ts';
import { todayHttp, todayKeys } from '../../api/today-http.ts';
import { getPrivateEpoch, privateDataReady, usePrivateEpoch } from '../../api/session-cache.ts';
import { getDraftGeneration, isDraftOwner } from '../../api/session-draft.ts';
import { authClient } from '../../auth/client.ts';
import { classifySaveError, TodayDateChangedError, toLogPut, type RecordChoice } from './record-log.ts';
import { confirmedSaveFeedback, createSavePeerGuard, type FeedbackSnapshot, type SaveFeedback } from './save-feedback.ts';

export type RecordContext = Pick<GoalR11, 'id' | 'unit' | 'timezone' | 'goalSettingsRevision' | 'historyRevision'>;
export type SaveVars = {
  goalId: string;
  localDate: string;
  choice: RecordChoice;
  expectedGoalSettingsRevision: number;
  expectedHistoryRevision?: string;
  unit: Goal['unit'];
  timezone: string;
};
export const saveLogKey = (goalId: string) => ['putLog', goalId] as const;
export const isSaveFor = (localDate: string, vars: unknown) => (vars as SaveVars | undefined)?.localDate === localDate;
/** 保存結果の通知（「保存前の表示との差」）を出しておく時間。 */
const FEEDBACK_VISIBLE_MS = 6000;
let feedbackSequence = 0;

// 再試行では現画面の既定量を参照しない。利用者が押した時点の意味と値を保存操作へ固定する。
export function captureSave(context: RecordContext, localDate: string, choice: RecordChoice): SaveVars {
  return {
    goalId: context.id,
    localDate,
    choice: { ...choice },
    expectedGoalSettingsRevision: context.goalSettingsRevision,
    ...(context.historyRevision === undefined ? {} : { expectedHistoryRevision: context.historyRevision }),
    unit: context.unit,
    timezone: context.timezone,
  };
}
export function rebaseSave(vars: SaveVars, latest: RecordContext): SaveVars | null {
  if (latest.id !== vars.goalId || latest.unit !== vars.unit || latest.timezone !== vars.timezone) {
    return null;
  }
  return { ...vars, expectedGoalSettingsRevision: latest.goalSettingsRevision, ...(latest.historyRevision === undefined ? {} : { expectedHistoryRevision: latest.historyRevision }) };
}

export function useSaveLog(goalId: string, { onSaved, localDate, canSaveDate, isStaleDate, context }: {
  onSaved?: () => void;
  localDate?: string | undefined;
  canSaveDate?: (date: string) => boolean;
  /** 古い日付だと分かっている。省略時は送れない日付をすべて古いとみなす。API の今日がまだ分からない間は false にできる。 */
  isStaleDate?: (date: string) => boolean;
  context?: RecordContext | undefined;
} = {}) {
  const queryClient = useQueryClient();
  const epoch = usePrivateEpoch();
  const session = authClient.useSession();
  const owner = session.isPending || session.error ? undefined : session.data?.user.id;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const alive = useRef(true);
  const reloadRequest = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const canSaveDateRef = useRef(canSaveDate);
  canSaveDateRef.current = canSaveDate;
  const dateAllowed = (date: string) => canSaveDateRef.current?.(date) ?? true;
  const isStaleDateRef = useRef(isStaleDate);
  isStaleDateRef.current = isStaleDate;
  const dateStale = (date: string) => isStaleDateRef.current?.(date) ?? !dateAllowed(date);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [latest, setLatest] = useState<RecordContext | null>(null);
  const [reloadingSettings, setReloadingSettings] = useState(false);
  const [settingsReloadFailed, setSettingsReloadFailed] = useState(false);
  const reloadInFlight = useRef(false);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const peer = useRef<ReturnType<typeof createSavePeerGuard> | null>(null);
  const retries = useRef(new WeakSet<SaveVars>());
  const readFeedbackSnapshot = (): FeedbackSnapshot | null => {
    const current = getPrivateEpoch();
    const keys = [goalKeys.detail(goalId), todayKeys.today(goalId), todayKeys.logs(goalId)] as const;
    // 3つとも取得済み・取得中でない・無効化されていない・いまの利用者のものであるときだけ比較の材料にする
    const isSettled = (key: (typeof keys)[number]) => {
      const state = queryClient.getQueryState(key);
      return !!state && state.status === 'success' && state.fetchStatus === 'idle'
        && !state.isInvalidated && state.dataUpdatedAt > current.clearedAt;
    };
    if (!privateDataReady(current) || !keys.every(isSettled)) {
      return null;
    }
    const goal = queryClient.getQueryData<GoalR11>(keys[0]);
    const today = queryClient.getQueryData<TodayR11>(keys[1]);
    const logs = queryClient.getQueryData<Log[]>(keys[2]);
    return goal && today && logs ? structuredClone({ goal, today, logs }) : null;
  };
  useEffect(() => {
    setFeedback(null);
    const guard = createSavePeerGuard(goalId, () => {
      setFeedback(null);
      void queryClient.invalidateQueries({ queryKey: goalKeys.all });
    });
    peer.current = guard;
    return () => {
      guard.close();
      if (peer.current === guard) peer.current = null;
    };
  }, [goalId, owner, queryClient]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      reloadRequest.current?.abort();
    };
  }, []);
  // 利用者・境界が変わったら、409 の後の最新設定・通知を捨て、進行中の設定の取り直しも中断する
  useEffect(() => {
    setLatest(null);
    setSettingsReloadFailed(false);
    setReloadingSettings(false);
    setFeedback(null);
    return () => {
      reloadRequest.current?.abort();
      reloadRequest.current = null;
      reloadInFlight.current = false;
    };
  }, [epoch, owner]);
  // 設定（版・単位・timezone）や対象日が変わったら、前の保存の通知は出し続けない
  useEffect(() => {
    setFeedback(null);
  }, [context?.goalSettingsRevision, context?.unit, context?.timezone, localDate]);
  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [feedback]);
  const mutation = useMutation({
    mutationKey: saveLogKey(goalId), retry: false,
    onMutate: (vars: SaveVars) => {
      setFeedback(null);
      const guard = peer.current;
      const before = !retries.current.has(vars) && guard?.canCompare ? readFeedbackSnapshot() : null;
      const evidence = { before, guard, version: guard?.version, epoch: getPrivateEpoch(), generation: getDraftGeneration() };
      guard?.start();
      return evidence;
    },
    mutationFn: (vars: SaveVars) => {
      if (!dateAllowed(vars.localDate)) {
        throw new TodayDateChangedError();
      }
      return todayHttp.putLog(vars.goalId, vars.localDate, { ...toLogPut(vars.choice, vars.expectedGoalSettingsRevision), ...(vars.expectedHistoryRevision === undefined ? {} : { expectedHistoryRevision: vars.expectedHistoryRevision }) });
    },
    onSuccess: async (saved, vars, evidence) => {
      await queryClient.invalidateQueries({ queryKey: goalKeys.all });
      setRefreshFailed([todayKeys.today(goalId), todayKeys.logs(goalId)].some(key =>
        queryClient.getQueryState(key)?.status === 'error'));
      const after = readFeedbackSnapshot();
      const before = evidence?.before;
      // 保存の前後で、同じ利用者・同じ画面・別タブの保存なし、のときだけ差を通知する（別の変更を今回の増分に見せない）
      const boundaryUnchanged = alive.current && evidence?.guard?.canCompare === true && evidence.guard.version === evidence.version
        && getPrivateEpoch() === evidence.epoch && getDraftGeneration() === evidence.generation;
      // API が保存した内容が、押した内容そのものか（設定の版も含めて）
      const savedAsRequested = saved.status === vars.choice.status
        && saved.amount === (vars.choice.status === 'DONE' ? vars.choice.amount : null);
      if (after && before && boundaryUnchanged
        && vars.expectedGoalSettingsRevision === before.goal.goalSettingsRevision && savedAsRequested) {
        const confirmed = confirmedSaveFeedback(before, after, saved);
        setFeedback(confirmed ? { ...confirmed, sequence: ++feedbackSequence } : null);
      }
      onSaved?.();
    },
    onError: () => {
      setLatest(null);
      setFeedback(null);
    },
    onSettled: (_saved, _error, _vars, evidence) => {
      inFlight.current = false;
      evidence?.guard?.end();
    },
  });
  const pending = useMutationState({
    filters: { mutationKey: saveLogKey(goalId), status: 'pending' },
    select: entry => entry.state.variables as SaveVars | undefined,
  });
  const pendingForDate = localDate === undefined ? undefined : pending.find(vars => vars?.localDate === localDate);
  const conflict = mutation.isError && classifySaveError(mutation.error) === 'settings';
  const rebased = latest && mutation.variables ? rebaseSave(mutation.variables, latest) : null;
  // 同じ人かの確認中に押された保存（#190）。押した人と入力者の連続性を固定し、確認できたら送る
  const [held, setHeld] = useState<{ vars: SaveVars; owner: string; generation: number } | null>(null);
  const submit = (vars: SaveVars) => {
    if (inFlight.current || reloadInFlight.current) {
      return;
    }
    if (queryClient.isMutating({
      mutationKey: saveLogKey(goalId),
      predicate: entry => isSaveFor(vars.localDate, entry.state.variables),
    }) > 0) {
      return;
    }
    // 押した時点で所有者と API の今日を確かめる。確認中・確認直後の取り直し中は分からないので、送らずに預かる
    if (!privateDataReady(getPrivateEpoch()) || (!dateAllowed(vars.localDate) && !dateStale(vars.localDate))) {
      const who = authClient.$store?.atoms?.session?.get()?.data?.user.id;
      if (who) setHeld({ vars, owner: who, generation: getDraftGeneration() });
      return;
    }
    if (!dateAllowed(vars.localDate)) {
      return;
    }
    inFlight.current = true;
    setRefreshFailed(false);
    mutation.mutate(vars);
  };
  const heldReady = held !== null && privateDataReady(epoch) && dateAllowed(held.vars.localDate);
  const heldStale = held !== null && privateDataReady(epoch) && dateStale(held.vars.localDate);
  useEffect(() => {
    if (!held) {
      return;
    }
    // 未ログイン・古い日付と分かったら送らない
    if (epoch.owner === null || heldStale) {
      setHeld(null);
      return;
    }
    if (!heldReady) {
      return;
    }
    setHeld(null);
    // 別の人・認証操作をまたいだ場合は送らない（押した人の操作として確かめられない）
    if (epoch.owner === held.owner && isDraftOwner(held.owner, held.generation)) submit(held.vars);
  }, [epoch, held, heldReady, heldStale]);
  return {
    save: (vars: { localDate: string; choice: RecordChoice }) => {
      if (conflict || !context) {
        return;
      }
      submit(captureSave(context, vars.localDate, vars.choice));
    },
    canSaveDate: dateAllowed,
    isStaleDate: dateStale,
    retry: () => {
      const vars = conflict ? rebased : mutation.variables;
      if (vars) {
        retries.current.add(vars);
        submit(vars);
      }
    },
    // 409は取得成功まで消さない。意味が変わった場合、成功後に利用者が明示的に選び直す。
    reset: () => {
      if (conflict && !latest) {
        return;
      }
      setHeld(null);
      mutation.reset();
      setLatest(null);
      setSettingsReloadFailed(false);
      setFeedback(null);
    },
    reloadSettings: async () => {
      if (!conflict || reloadInFlight.current || inFlight.current) {
        return;
      }
      const startedEpoch = getPrivateEpoch();
      const startedOwner = ownerRef.current;
      if (!startedOwner || startedEpoch.owner !== startedOwner || !Number.isFinite(startedEpoch.clearedAt)) {
        return;
      }
      const request = new AbortController();
      reloadRequest.current = request;
      // fetchの中断を無視する遅延応答にも、所有者と境界の同一性を要求する。
      const isStillCurrent = () => alive.current && !request.signal.aborted &&
        ownerRef.current === startedOwner && getPrivateEpoch() === startedEpoch;
      reloadInFlight.current = true;
      setReloadingSettings(true);
      setLatest(null);
      try {
        const goal = await goalsHttp.getGoal(goalId, request.signal);
        if (!isStillCurrent()) {
          return;
        }
        setLatest(goal);
        setSettingsReloadFailed(false);
        queryClient.setQueryData(goalKeys.detail(goalId), goal);
        await queryClient.invalidateQueries({ queryKey: goalKeys.all });
      } catch {
        if (isStillCurrent()) setSettingsReloadFailed(true);
      } finally {
        if (reloadRequest.current === request) {
          reloadRequest.current = null;
          reloadInFlight.current = false;
          if (isStillCurrent()) setReloadingSettings(false);
        }
      }
    },
    settingsReady: conflict && latest !== null,
    meaningChanged: conflict && latest !== null && rebased === null,
    reloadingSettings, settingsReloadFailed,
    refreshFailed,
    feedback,
    isSaving: mutation.isPending || pendingForDate !== undefined || held !== null,
    saving: mutation.isPending ? mutation.variables : pendingForDate ?? held?.vars,
    failure: mutation.isError ? { error: mutation.error, vars: mutation.variables } : undefined,
    isSuccess: mutation.isSuccess,
  };
}
