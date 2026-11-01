import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Goal } from '@contracts';
import { authClient } from '../../auth/client.ts';
import { browserTimezone } from '../../calendar.ts';
import {
  clearCreateAttempt,
  prepareCreateAttempt,
  CreateRecoveryError,
  createFailureKind,
  type CreateAttempt,
} from './create-attempt.ts';
import { ApiError } from '../../api/client.ts';
import { goalKeys, goalsHttp } from '../../api/goals-http.ts';
import { isNotFound, isUnauthenticated } from '../../api/http.ts';
import { getPrivateEpoch, privateDataReady, usePrivateEpoch } from '../../api/session-cache.ts';
import { useMemoryDraft } from '../../api/session-draft.ts';
import { goalsCopy } from '../../copy/goals.ts';
import { GoalFormFields } from './form/GoalFormFields.tsx';
import {
  CloseLink,
  FormIntro,
  FormLoading,
  FormShell,
  GoalCrumb,
  ListCrumb,
  RefreshFailed,
  SaveFailure,
} from './form/GoalFormPresentation.tsx';
import {
  isCreateBlocked,
  isCreateResultDeleted,
  isEditConflict,
  loadRecovery,
  rejectedCreateOperation,
  restoreFormDraft,
  type FormDraft,
  type FormFailure,
} from './form/form-recovery.ts';
import { useConfirmedGoalSave } from './navigation/useConfirmedGoalSave.ts';
import { useGoalFormFailure } from './navigation/useGoalFormFailure.ts';
import { AppBar } from '../../ui/components/AppBar.tsx';
import { DeskHeader } from '../../ui/components/DeskHeader.tsx';
import { PageTitle } from '../../ui/components/PageTitle.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { ConfirmDialog } from '../../ui/components/ConfirmDialog.tsx';
import { ErrorPanel } from '../../ui/components/Notice.tsx';
import { StickyActionBar } from '../../ui/components/StickyActionBar.tsx';
import { fetchPolicy } from '../today/fetch-policy.ts';
import '../prior/question-prior.css';
import {
  ALL_CHOSEN,
  answersLockReason,
  emptyValues,
  errorCount,
  FIELD_ORDER,
  initialPriorChosen,
  priorChoiceError,
  type PriorChosen,
  fieldErrorsFromApi,
  rebaseValues,
  reloadLatestGoal,
  toCreateBody,
  toPatchBody,
  validateGoalForm,
  valuesFromGoal,
  valuesFromCreateBody,
  type FieldErrors,
  type FieldName,
  type GoalWithAnswers,
  NO_ANSWERS,
  type FormValues,
} from './goal-form.ts';
import { GoalNotFoundPanel, LoadErrorPanel, SignedOutPanel } from './GoalStates.tsx';
import '../../ui/tokens.css';
import '../../ui/page.css';
import './goals.css';

const c = goalsCopy;
const f = goalsCopy.form;

function useInterruptedOperation(ready: boolean, operationKey: readonly unknown[]) {
  const pending = useIsMutating({ mutationKey: operationKey }) > 0;
  const interrupted = useRef(false);
  if (!ready) {
    interrupted.current = true;
  } else if (!pending) {
    interrupted.current = false;
  }
  return interrupted.current && pending;
}

/** Goal の作成（R-02、#78）。/goals/new */
export function GoalCreatePage() {
  // ログインしている人が替わったら作り直し、前の人の入力を持ち越さない
  const current = usePrivateEpoch();
  const draft = useMemoryDraft<FormDraft>(current, 'create');
  const completion = useConfirmedGoalSave(current, draft.generation, '/goals/new');
  const failure = useGoalFormFailure<FormFailure>(current, completion.acceptsVisit);
  // 別訪問で確認済みの旧応答は待たない。未確定attemptの再訪と同訪問のsession確認は待つ（#175）。
  const operationKey = ['goal-form', current.owner, 'create', ...completion.operationVisit];
  const operating = useInterruptedOperation(privateDataReady(current), operationKey);
  if (current.owner === null) {
    return <FormShell title={f.createTitle} body={<SignedOutPanel />} />;
  }
  if (!privateDataReady(current) || operating || failure.pending) {
    return <FormShell title={f.createTitle} body={<FormLoading />} />;
  }
  const knownRejected = rejectedCreateOperation(
    failure.restored?.error,
    failure.restored?.operation ?? null,
    current.owner ?? undefined,
  );
  if (failure.error && !knownRejected) {
    return <FormShell title={f.createTitle} body={
      <SaveFailure
        error={new CreateRecoveryError()}
        mode="create"
        onReloadLatest={async () => {}}
        reloadingLatest={false}
      />
    } />;
  }
  // 確認中の既知422に続く終了例外も、同訪問の入力と併せて保存禁止状態へ渡す。
  const displayFailure = failure.error && knownRejected ? { ...failure.restored!, prepareError: failure.error } : failure.restored;
  if (completion.error) return (
    <FormShell title={f.createTitle} body={
      <ErrorPanel
        title={f.createRecovery.unreadableTitle}
        action={<Link to="/goals" className="fr-btn fr-btn--secondary">{f.createRecovery.checkList}</Link>}
      >
        {f.createRecovery.completionFailed}
      </ErrorPanel>
    } />
  );
  if (completion.confirmed) {
    return <FormShell title={f.createTitle} body={<p role="status">保存しました。Goal一覧へ移動します。</p>} />;
  }
  return (
    <GoalForm
      key={`${current.owner}:${draft.generation}`}
      mode="create"
      owner={current.owner!}
      operationKey={operationKey}
      draft={draft.restored}
      onDraftChange={draft.remember}
      onSaved={completion.onSaved}
      acceptsFailureAction={completion.acceptsVisit}
      failure={displayFailure}
      onFailureChange={failure.remember}
    />
  );
}

/** Goal の編集・削除（R-02、#78）。/goals/$goalId/edit。Goal を読み込んでからフォームを出す。 */
export function GoalEditPage({ goalId }: { goalId: string }) {
  const current = usePrivateEpoch();
  const draft = useMemoryDraft<FormDraft>(current, `edit:${goalId}`);
  const completion = useConfirmedGoalSave(current, draft.generation, `/goals/${goalId}/edit`);
  const failure = useGoalFormFailure<FormFailure>(current, completion.acceptsVisit);
  const operationKey = ['goal-form', current.owner, 'edit', goalId];
  const operating = useInterruptedOperation(privateDataReady(current), operationKey);
  const { owner } = current;
  const ready = privateDataReady(current);
  const query = useQuery({
    queryKey: goalKeys.detail(goalId),
    queryFn: ({ signal }) => goalsHttp.getGoal(goalId, signal),
    enabled: ready,
    ...fetchPolicy,
  });
  if (owner === null) {
    return <FormShell title={f.editTitle} body={<SignedOutPanel />} />;
  }
  if (!ready || operating || (query.data && query.dataUpdatedAt <= current.clearedAt)) {
    return <FormShell title={f.editTitle} body={<FormLoading />} />;
  }
  if (completion.confirmed) {
    return <FormShell title={f.editTitle} body={<p role="status">保存しました。Goal一覧へ移動します。</p>} />;
  }
  if (!query.data) {
    if (!query.isError) {
      return <FormShell title={f.editTitle} body={<FormLoading />} />;
    }
    // 最初の読み込みの失敗。入力はまだないので、フォームの代わりにエラーを出す
    return (
      <FormShell
        title={isNotFound(query.error) ? c.notFound.heading : f.editTitle}
        body={isNotFound(query.error) ? <GoalNotFoundPanel /> : <>
          {failure.restored && !isUnauthenticated(query.error) ? <p role="status">{f.failedInputRetained}</p> : null}
          <LoadErrorPanel error={query.error} onRetry={() => void query.refetch()} />
        </>}
      />
    );
  }
  // Goal・ownerが替われば入力とbaselineを持ち越さない。focus・reconnectの失敗では未保存入力を残す。
  return (
    <GoalForm
      key={`${owner ?? ''}:${goalId}:${draft.generation}`}
      mode="edit"
      goal={query.data}
      draft={draft.restored}
      onDraftChange={draft.remember}
      operationKey={operationKey}
      onSaved={completion.onSaved}
      acceptsFailureAction={completion.acceptsVisit}
      failure={failure.restored}
      onFailureChange={failure.remember}
      refreshError={query.isError ? query.error : null}
      onRetryRefresh={() => void query.refetch()}
      onReloadLatest={() => reloadLatestGoal(() => query.refetch())}
    />
  );
}

type Props = {
  draft: FormDraft | undefined;
  onDraftChange: (draft: FormDraft | undefined) => void;
  operationKey: readonly unknown[];
  onSaved: (complete?: () => boolean) => void;
  acceptsFailureAction: () => boolean;
  failure: FormFailure | undefined;
  onFailureChange: (failure: FormFailure | undefined, complete?: () => boolean, changed?: boolean) => void;
} & (
  | { mode: 'create'; owner: string; goal?: undefined; refreshError?: undefined; onRetryRefresh?: undefined; onReloadLatest?: undefined }
  | {
      mode: 'edit';
      owner?: undefined;
      goal: GoalWithAnswers;
      refreshError: unknown;
      onRetryRefresh: () => void;
      /** 最新の Goal（回答と回答の版を含む）を読み直す。古い版で保存できなかったとき（409）に使う。 */
      onReloadLatest: () => Promise<GoalWithAnswers | undefined>;
    });

function GoalForm({
  mode,
  owner,
  goal,
  draft,
  onDraftChange,
  operationKey,
  onSaved,
  acceptsFailureAction,
  failure,
  onFailureChange,
  refreshError,
  onRetryRefresh,
  onReloadLatest,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locked = mode === 'edit' && (goal.hasLogs || Number(goal.historyRevision ?? 0) > 0);
  const title = mode === 'create' ? f.createTitle : f.editTitle;
  // 回復情報は過去の送信結果が不明な証跡。最初の描画で1回だけ読む
  const [recovery] = useState(() => loadRecovery(owner, failure));
  const [attempt, setAttempt] = useState<CreateAttempt | null>(recovery.attempt);
  const recoveryValues = attempt ? valuesFromCreateBody(attempt.body) : null;
  // 失敗表示は同訪問の入力/旧baselineを保持する。作成attemptがK2へ置換されたらK1の表示は採用しない。
  const { recoveredFailure, restored } = restoreFormDraft(mode, goal, draft, failure, recovery, attempt);
  const [prepareError, setPrepareError] = useState<unknown>(recovery.error ?? recoveredFailure?.prepareError ?? null);
  const [retainedError, setRetainedError] = useState<unknown>(recoveredFailure?.error ?? null);
  const [retainedOperation] = useState(recoveredFailure?.operation ?? null);
  const [discardedDraft] = useState(Boolean(goal && draft && !restored));
  // 未確定作成の入力は表示snapshotより元bodyを優先する。disabled欄への合成変更も回復操作へ混ぜない。
  const [values, setValues] = useState<FormValues>(() =>
    (attempt ? recoveryValues : restored?.values)
      ?? (goal ? valuesFromGoal(goal) : emptyValues(browserTimezone())));
  // 保存を押すまでは項目のエラーを出さない。押した後は入力のたびに検査し直す
  const [submitted, setSubmitted] = useState(restored?.submitted ?? false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>(recoveredFailure?.serverErrors ?? {});
  const [deleteOpen, setDeleteOpen] = useState(false);
  // APIの422で見つかったエラー項目。送信中は入力欄が押せないため、送信が終わってからフォーカスを移す
  const [focusAfterSave, setFocusAfterSave] = useState<FieldErrors | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // isPendingの再描画より先に二重送信を止める。成功後は一覧遷移まで保持し、失敗時だけ解除する。
  const saving = useRef(false);
  const deleting = useRef(false);
  // 編集開始時の比較元。自動再取得では変えず、他タブの変更を未変更項目の古い値で巻き戻さない。
  // 409後の明示的な再読込では、入力を残して比較元を更新する。
  const [baseline, setBaseline] = useState(restored?.baseline ?? goal);
  // 最新を読み直したときの回答。入力中の回答で上書きする前に確かめられるよう、知らせとして出す
  const [latestAnswers, setLatestAnswers] = useState<GoalWithAnswers['questionPrior'] | null>(restored?.latestAnswers ?? null);
  // 初期質問でどれかを選んだか（#259、必須）。未確定の作成を復元したときは、保存前の検査を通った回答なので選択済みとする
  const [priorChosen, setPriorChosen] = useState<PriorChosen>(() => attempt ? ALL_CHOSEN
    : restored?.priorChosen ?? initialPriorChosen(mode, restored?.values.questionPrior ?? values.questionPrior));
  // 初期質問の開閉。作成と、まだ選んでいない問がある編集では開いた状態から始める
  const [priorOpen, setPriorOpen] = useState(() => restored?.priorOpen ?? (
    mode === 'create' || !priorChosen.a || !priorChosen.b
      || values.questionPrior.a !== null || values.questionPrior.b !== null
  ));
  const [reloadingLatest, setReloadingLatest] = useState(false);
  const reloadInFlight = useRef(false);
  // この画面がまだ表示されているか。保存の途中で離れた後に、別の画面を一覧へ移さないために使う
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 単位・1回の量の変更と回答は同時に送れない（R-11、#133）。回答欄をロックし、APIによる撤回を伝える。
  const answersLock = mode === 'edit' && baseline !== undefined ? answersLockReason(values, baseline) : null;
  // 送る前の検査。初期質問は2問とも選ぶまで保存させない（#259。回答欄を押せない間は求めない）
  const findErrors = (): FieldErrors => {
    const found = validateGoalForm(values, { locked, baseline, goal, recoveryBody: attempt?.body });
    const prior = priorChoiceError(priorChosen, answersLock !== null);
    return prior ? { ...found, questionPrior: prior } : found;
  };
  const clientErrors = submitted ? findErrors() : {};
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };
  const count = errorCount(errors);
  // いまの入力と比較元をまとめた下書き。親へ退避する draft と、失敗表示（FormFailure）の土台に使う
  const currentDraft = (): FormDraft => ({ values, baseline, sourceGoal: goal, submitted, priorOpen, priorChosen, latestAnswers });

  const finishCreateAttempt = (operation: CreateAttempt, onCleanupError?: (error: unknown) => void): boolean => {
    // 離脱後に別フォームが同じ操作を復元・再送している可能性がある。
    // 旧応答ではstorageを終了せず、表示中のフォームの確定応答へ引き継ぐ。
    if (!mounted.current) {
      return false;
    }
    try {
      if (!clearCreateAttempt(operation, sessionStorage)) {
        return false;
      }
      setAttempt(current => current?.owner === operation.owner
        && current.key === operation.key && current.raw === operation.raw ? null : current);
      return true;
    } catch (error) {
      // 保存情報を消せなければ回復情報を保持する。422のfield error処理は続ける。
      setPrepareError(error);
      onCleanupError?.(error);
      return false;
    }
  };

  const save = useMutation({
    mutationKey: [...operationKey, 'save'],
    retry: false,
    mutationFn: async ({ values: v, operation }: { values: FormValues; operation: CreateAttempt | null }): Promise<Goal | null> => {
      if (mode === 'create') {
        if (!operation || operation.owner !== owner) {
          throw new Error('作成操作を確認できません。');
        }
        // 描画後に別タブでcookieが変わった場合、POST前に止めて元の操作を保持する。
        // このGETの後の切替はAPIのX-Create-Owner検証で拒否する。取得失敗でも新しいキーは作らない。
        const current = await authClient.getSession({ query: { disableCookieCache: true } });
        if (current.error) {
          throw new Error('アカウントを確認できません。作成操作は保持しています。');
        }
        if (current.data?.user.id !== operation.owner) {
          throw new ApiError(409, {
            error: {
              code: 'CREATE_OWNER_CHANGED',
              message: '作成時のアカウントでログインし直してから再試行してください。',
            },
          });
        }
        return goalsHttp.createGoal(operation.body, operation.key, operation.owner);
      }
      // 記録の有無は最新の Goal に従う（記録が付いた後は timezone・initialProgress を送らない）
      const patch = toPatchBody(v, { ...baseline!, hasLogs: goal.hasLogs });
      return patch ? goalsHttp.updateGoal(goal.id, patch) : null;
    },
    // 確定成功を親へ渡す。離脱済みFormでは操作を終了せず、同じ訪問での採用時にだけ親が終了する。
    onSuccess: async (_goal, vars) => {
      if (vars.operation) {
        finishCreateAttempt(vars.operation);
      }
      await queryClient.invalidateQueries({ queryKey: goalKeys.all });
      const operation = vars.operation;
      onSaved(operation ? () => clearCreateAttempt(operation, sessionStorage) : undefined);
    },
    onError: (error, vars) => {
      saving.current = false;
      let cleanupError: unknown = null;
      if (vars.operation && error instanceof ApiError && error.status === 422) {
        finishCreateAttempt(vars.operation, failure => { cleanupError = failure; });
      }
      const fromApi = fieldErrorsFromApi(error);
      onFailureChange(
        {
          ...currentDraft(),
          values: vars.values,
          submitted: true,
          error,
          prepareError: cleanupError,
          serverErrors: fromApi ?? {},
          operation: vars.operation,
        },
        !mounted.current && vars.operation && error instanceof ApiError && error.status === 422
          ? () => clearCreateAttempt(vars.operation!, sessionStorage) : undefined,
        true,
      );
      if (fromApi && errorCount(fromApi) > 0) {
        setServerErrors(fromApi);
        setFocusAfterSave(fromApi);
      }
    },
  });
  const failedSave = save.isError ? save.error : retainedError;
  // 最後に送った（または復元した）作成操作。410・422 の後始末で、いま保持している attempt と同じものかを確かめる
  const lastOperation = save.variables?.operation ?? retainedOperation;
  // 保存の失敗表示を消して、通常の未送信の下書きへ戻す
  const clearSaveFailure = () => {
    save.reset();
    setRetainedError(null);
    onFailureChange(undefined);
  };

  const remove = useMutation({
    mutationKey: [...operationKey, 'delete'],
    mutationFn: () => goalsHttp.deleteGoal(goal!.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: goalKeys.detail(goal!.id) });
      await queryClient.invalidateQueries({ queryKey: goalKeys.all });
    },
    onError: async (error) => {
      deleting.current = false;
      // すでに削除されていた（別のタブなど）場合も、一覧を取り直す
      if (isNotFound(error)) {
        await queryClient.invalidateQueries({ queryKey: goalKeys.all });
      }
    },
  });

  useLayoutEffect(() => {
    // 復元後は新mutationのisErrorがfalseでも失敗表示は残る。訪問失効後に入力だけ戻らないよう、通常draftには退避しない。
    const inProgress = attempt !== null || prepareError !== null || saving.current || deleting.current || reloadInFlight.current
      || save.isPending || failedSave !== null || remove.isPending || remove.isError || reloadingLatest;
    onDraftChange?.(inProgress ? undefined : currentDraft());
  }, [
    values, baseline, goal, submitted, priorOpen, priorChosen, latestAnswers,
    reloadingLatest, save.isPending, failedSave, remove.isPending, remove.isError,
    attempt, prepareError, onDraftChange,
  ]);
  useLayoutEffect(() => {
    if ((failedSave !== null || prepareError !== null)
      && !save.isPending && !saving.current && !deleting.current && !remove.isPending && !remove.isError) {
      onFailureChange({
        ...currentDraft(),
        error: failedSave,
        prepareError,
        serverErrors,
        operation: failedSave === null ? attempt : lastOperation,
      });
    }
  }, [
    failedSave, prepareError, values, baseline, goal, submitted, priorOpen, priorChosen,
    latestAnswers, serverErrors, save.isPending, save.variables, retainedOperation,
    attempt, remove.isPending, remove.isError, onFailureChange,
  ]);

  // 保存・削除が終わったとき、この画面がまだ表示されていれば一覧へ戻る（離れた後なら、いま表示中の別の画面を動かさない）
  const leaveToList = () => {
    if (!mounted.current) {
      return;
    }
    setDeleteOpen(false);
    void navigate({ to: '/goals' });
  };

  const update = <K extends FieldName>(name: K, value: FormValues[K]) => {
    // 契約のvalidation 422は保存前の確定拒否。訂正を始めた入力は再び未送信draftとして扱う。
    // 通信失敗/500/409など結果不明・競合はresetせず、通常draftへ戻さない。
    if (failedSave instanceof ApiError && failedSave.status === 422 && failedSave.body?.error.code === 'VALIDATION_ERROR' &&
      errorCount({ ...serverErrors, [name]: undefined }) === 0) {
      clearSaveFailure();
    }
    setValues((prev) => ({ ...prev, [name]: value }));
    if (serverErrors[name]) {
      setServerErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // 送信中は二重に送らない（ボタンも押せなくしている）
    if (saving.current || reloadInFlight.current || prepareError instanceof CreateRecoveryError
      || isEditConflict(failedSave) || isCreateBlocked(failedSave)) {
      return;
    }
    setSubmitted(true);
    setServerErrors({});
    // 選択中timezoneの今日より後を許可。変えていない保存済みの日付は送らず、検査しない。
    const found = findErrors();
    if (errorCount(found) > 0) {
      focusFirstError(found);
      return;
    }
    onDraftChange(undefined);
    clearSaveFailure();
    setPrepareError(null);
    try {
      // 再表示で復元した操作を優先し、storageから別の操作を準備し直さない。
      // 保持中の同じキー・元bodyで結果を確認し、表示中の確定応答で終了する。
      const operation = mode === 'create'
        ? attempt ?? prepareCreateAttempt(owner!, toCreateBody(values), sessionStorage) : null;
      if (operation) {
        setAttempt(operation);
      }
      saving.current = true;
      save.mutate({ values, operation });
    } catch (error) {
      saving.current = false;
      setPrepareError(error);
      // 再確認と同batchで子が消えても、保存開始前の失敗を同訪問の親へ渡す。
      onFailureChange(
        { ...currentDraft(), submitted: true, error: null, prepareError: error, serverErrors: {}, operation: attempt },
        undefined,
        true,
      );
    }
  };

  const focusFirstError = (found: FieldErrors) => {
    const first = FIELD_ORDER.find((name) => found[name]);
    if (!first) {
      return;
    }
    const selector = first === 'unit' ? '[aria-labelledby="goal-unit-label"] button'
      : first === 'questionPrior' ? `.r11-qp fieldset:nth-of-type(${priorChosen.a ? 2 : 1}) input`
      : `#goal-${first}`;
    // 閉じた回答欄の中へは移れないため、先に開く
    if (first === 'questionPrior') {
      const prior = formRef.current?.querySelector<HTMLDetailsElement>('#fr-goalform-prior');
      if (prior) {
        prior.open = true;
      }
    }
    const target = formRef.current?.querySelector<HTMLElement>(selector);
    target?.focus();
  };

  const busy = save.isPending;
  const recoveryBlocked = prepareError instanceof CreateRecoveryError;
  const inputDisabled = busy || (mode === 'create' && (attempt !== null || recoveryBlocked));
  useEffect(() => {
    if (!focusAfterSave || busy) {
      return;
    }
    focusFirstError(focusAfterSave);
    setFocusAfterSave(null);
  }, [focusAfterSave, busy]);
  // APIへ送る量は整数分または整数回。時間＋分の入力も整数分へ変換する（P-18、P-23）。
  const unit = f.units[values.unit];
  const timezones = useTimezones(values.timezone);
  // 422 で項目に割り当てられたエラーは各項目に出す。それ以外（通信・サーバー・ログイン切れ）は保存ボタンの上に出す
  const apiFieldErrors = failedSave !== null ? fieldErrorsFromApi(failedSave) : null;
  const saveFailure = prepareError ?? (failedSave !== null && (apiFieldErrors === null || errorCount(apiFieldErrors) === 0) ? failedSave : null);
  // 410（作成したGoalが削除済み）・回復情報を読めない422 は、いま保持している attempt と同じ操作のときだけ後始末の入口を出す
  const deletedAttempt = mode === 'create' && isCreateResultDeleted(saveFailure) &&
    lastOperation?.owner === owner && lastOperation?.raw === attempt?.raw ? attempt : null;
  const rejectedOperation = mode === 'create' && recoveryBlocked ? rejectedCreateOperation(failedSave, lastOperation, owner) : null;
  const rejectedAttempt = rejectedOperation && rejectedOperation.raw === attempt?.raw ? rejectedOperation : null;
  // 作成操作の後始末に失敗したとき、失敗表示を保ったまま後始末の失敗（prepareError）だけを親へ渡す
  const reportCleanupFailure = (operation: CreateAttempt) => (error: unknown) =>
    onFailureChange({ ...currentDraft(), error: failedSave, prepareError: error, serverErrors, operation }, undefined, true);
  const resumeCorrection = () => {
    const current = getPrivateEpoch();
    if (!rejectedAttempt || busy || !mounted.current || !acceptsFailureAction()
      || !privateDataReady(current) || current.owner !== owner) {
      return;
    }
    if (!finishCreateAttempt(rejectedAttempt, reportCleanupFailure(rejectedAttempt))) {
      return;
    }
    setPrepareError(null);
    // 同batchの確認でも終了済みrawのgateを再採用しない。422項目は訂正まで保持し、POSTやkey生成はしない。
    onFailureChange({ ...currentDraft(), error: failedSave, prepareError: null, serverErrors, operation: null }, undefined, true);
  };
  // 最新GETで単位ロック等の項目エラーが増えても、409を解除する明示的な再読込は残す。
  const showSaveFailure = saveFailure !== null && (count === 0 || isEditConflict(saveFailure) || prepareError instanceof CreateRecoveryError);
  // 通信・サーバーの失敗は「もう一度保存」。ログイン切れはログインし直すまで同じ文言のままにする
  const canRetry = showSaveFailure && !isUnauthenticated(saveFailure) && !isEditConflict(saveFailure) && createFailureKind(saveFailure) === null;
  const restartCreate = () => {
    if (!deletedAttempt || busy || !mounted.current) {
      return;
    }
    try {
      // 410を確認した同owner/keyだけを終了する。新keyは次の明示保存まで作らない。
      if (!finishCreateAttempt(deletedAttempt, reportCleanupFailure(deletedAttempt))) {
        return;
      }
      setPrepareError(null);
      setSubmitted(false);
      clearSaveFailure();
    } catch (error) {
      setPrepareError(error);
    }
  };
  const reloadLatest = async () => {
    if (reloadInFlight.current || saving.current) {
      return;
    }
    reloadInFlight.current = true;
    onDraftChange?.(undefined);
    setReloadingLatest(true);
    try {
      const latest = await onReloadLatest?.();
      if (!latest || !mounted.current) {
        return;
      }
      // 成功した取得だけで比較元を更新する。触った項目は残し、触っていない項目は最新にする。
      if (baseline) {
        setValues((current) => rebaseValues(current, baseline, latest));
      }
      setBaseline(latest);
      setLatestAnswers(latest.questionPrior ?? NO_ANSWERS);
      clearSaveFailure();
    } finally {
      reloadInFlight.current = false;
      if (mounted.current) {
        setReloadingLatest(false);
      }
    }
  };

  return (
    <div className="fr fr-page fr-page--desk fr-page--goalform">
      <PageTitle title={title} />
      <AppBar title={title} leading={<CloseLink />} />
      <DeskHeader back={goal ? <GoalCrumb goal={goal} /> : <ListCrumb />} title={title} titleAs="p" />
      <FormIntro title={title} guide={mode === 'create' ? c.formGuideCreate : c.formGuideEdit} {...(goal ? { goalTitle: goal.title } : {})} />
      <form ref={formRef} className={`fr-goalform fr-goalform--${mode}`} noValidate onSubmit={onSubmit} aria-busy={busy || undefined}>
        <GoalFormFields
          {...(mode === 'create' ? { mode } : { mode, goal })}
          values={values}
          errors={errors}
          count={count}
          unit={unit}
          timezones={timezones}
          discardedDraft={discardedDraft}
          pendingCreate={attempt !== null}
          refreshNotice={refreshError && onRetryRefresh ? (
            <RefreshFailed
              error={refreshError}
              onRetry={isEditConflict(failedSave) ? () => void reloadLatest() : onRetryRefresh}
              editConflict={isEditConflict(failedSave)}
            />
          ) : null}
          inputDisabled={inputDisabled}
          locked={locked}
          priorOpen={priorOpen}
          latestAnswers={latestAnswers}
          answersLock={answersLock}
          priorChosen={priorChosen}
          onPriorChoose={(origin) => setPriorChosen((current) => current[origin] ? current : { ...current, [origin]: true })}
          update={update}
          onPriorToggle={setPriorOpen}
          onDeleteOpen={() => setDeleteOpen(true)}
        />

        <StickyActionBar>
          <div className="fr-goalform__actions">
            {showSaveFailure ? (
              <SaveFailure
                error={saveFailure}
                mode={mode}
                onReloadLatest={reloadLatest}
                reloadingLatest={reloadingLatest}
                onRestartCreate={deletedAttempt ? restartCreate : undefined}
                onResumeCorrection={rejectedAttempt ? resumeCorrection : undefined}
              />
            ) : null}
            {/* Desk-edit: 削除は左端、取りやめは保存の横。スマートフォン幅の「×」を補う。 */}
            <div className="fr-goalform__buttons">
              {mode === 'edit' ? (
                <span className="fr-goalform__delete-desk">
                  <Button variant="text" icon="trash" disabled={inputDisabled} onClick={() => setDeleteOpen(true)}>
                    {f.delete}
                  </Button>
                </span>
              ) : null}
              {goal ? (
                <Link to="/goals/$goalId" params={{ goalId: goal.id }} className="fr-btn fr-btn--secondary fr-goalform__cancel">
                  {f.cancel}
                </Link>
              ) : (
                <Link to="/goals" className="fr-btn fr-btn--secondary fr-goalform__cancel">
                  {f.cancel}
                </Link>
              )}
              <Button
                type="submit"
                variant="primary"
                block
                busy={busy}
                disabled={reloadingLatest || isEditConflict(saveFailure) || recoveryBlocked || isCreateBlocked(saveFailure)}
                {...(canRetry ? { icon: 'retry' as const } : {})}
              >
                {busy ? f.saving
                  : createFailureKind(saveFailure) === 'owner' ? f.createRecovery.ownerRetry
                  : canRetry ? f.saveFailed.retry
                  : mode === 'create' ? f.save : f.saveEdit}
              </Button>
            </div>
          </div>
        </StickyActionBar>
      </form>

      {mode === 'edit' ? (
        <ConfirmDialog
          open={deleteOpen}
          title={c.deleteDialog.title}
          confirmLabel={c.deleteDialog.confirm}
          confirmIcon="trash"
          cancelLabel={c.deleteDialog.cancel}
          busy={remove.isPending}
          onConfirm={() => {
            if (deleting.current) {
              return;
            }
            deleting.current = true;
            onDraftChange(undefined);
            remove.mutate(undefined, {
              onSuccess: leaveToList,
              // すでに削除されていた（別のタブなど）場合は、一覧へ戻る
              onError: (error) => {
                if (isNotFound(error)) {
                  leaveToList();
                }
              },
            });
          }}
          onCancel={() => {
            setDeleteOpen(false);
            remove.reset();
          }}
        >
          <p>
            {c.deleteDialog.body(goal.title)}
            <b>{c.deleteDialog.bodyStrong}</b>。
          </p>
          <p>{c.deleteDialog.irreversible}</p>
          {remove.isError && !isNotFound(remove.error) ? (
            isUnauthenticated(remove.error) ? (
              <SignedOutPanel body={c.signedOut.body} newTab />
            ) : (
              <p className="fr-goalform__dialog-error" role="alert">
                {c.deleteDialog.failed}
              </p>
            )
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** 選べるタイムゾーン。ブラウザが知っている IANA 名に、今の値（ブラウザ設定・保存済みの値）を必ず含める。 */
function useTimezones(current: string): string[] {
  return useMemo(() => {
    const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([browserTimezone(), current, ...known])];
  }, [current]);
}
