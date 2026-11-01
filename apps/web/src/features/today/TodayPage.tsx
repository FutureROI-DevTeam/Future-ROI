import { useQueryClient } from '@tanstack/react-query';
import { goalKeys } from '../../api/goals-http.ts';
import { todayKeys } from '../../api/today-http.ts';
import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { GoalR11 as Goal, Log, TodayR11 as Today } from '@contracts';
import { ApiError } from '../../api/client.ts';
import { isNotFound, isUnauthenticated } from '../../api/http.ts';
import { checkingSameOwner, getPrivateEpoch, privateDataReady, usePrivateEpoch } from '../../api/session-cache.ts';
import { useDraftGeneration } from '../../api/session-draft.ts';
import { authClient } from '../../auth/client.ts';
import { AppBar } from '../../ui/components/AppBar.tsx';
import { PageTitle } from '../../ui/components/PageTitle.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { ErrorPanel, InsufficientNotice } from '../../ui/components/Notice.tsx';
import { Icon } from '../../ui/components/Icon.tsx';
import { Spinner } from '../../ui/components/Spinner.tsx';
import { amountFormat } from '../../copy/amount.ts';
import { todayCopy } from '../../copy/today.ts';
import { longDate } from '../../copy/date.ts';
import { RecordChoiceBar } from '../logs/RecordChoiceBar.tsx';
import { YesterdayPrompt } from '../logs/YesterdayPrompt.tsx';
import { GoalMenu } from './GoalMenu.tsx';
import { RecentDays } from '../history/RecentDays.tsx';
import { ForecastBoundary } from './ForecastBoundary.tsx';
import { YesterdayDetails } from './YesterdayDetails.tsx';
import { useTodayData } from './useTodayData.ts';
import { TodayContent } from './TodayContent.tsx';
import type { SaveFeedback as SaveFeedbackValue } from '../logs/save-feedback.ts';
import { draftProgress, recordPreviewBaseline, type RecordDraft } from '../logs/draft-preview.ts';
import { DraftProgressPreview } from './DraftProgressPreview.tsx';
import { StickyActionBar } from '../../ui/components/StickyActionBar.tsx';
import { WIDE_LAYOUT_QUERY } from '../../ui/layout.ts';
import { useSaveLog } from '../logs/useSaveLog.ts';
import { showYesterdayPrompt } from './yesterday-later.ts';
import { YesterdayCorrection } from '../logs/YesterdayCorrection.tsx';
import { editLocks, isCurrentToday, yesterdayRecord } from '../logs/record-log.ts';
import '../../ui/tokens.css';
import '../../ui/page.css';
import './today.css';
import './today-dawn.css';
import './assets/zen-old-mincho.css';
import '@fontsource/zen-maru-gothic/900.css';

/**
 * Today Decision（R-05〜R-08）。owner・Goal・入力者の連続性世代で画面を作り直す。
 * 描画間の owner/error/認証操作でも旧 snapshot と入力を捨て、別 Goal へ持ち越さない。
 * 正常な同一 owner 再確認中だけ入力を保持する（D-30）。notBefore=∞ で新しい応答を採用せず、
 * useSaveLog は owner 確定まで送信を待つ。
 */
export function TodayPage({ goalId }: { goalId: string }) {
  const current = usePrivateEpoch();
  const draftGeneration = useDraftGeneration();
  const session = authClient.useSession();
  // 再確認の結果が別 owner・未ログイン・失敗なら、表示中の owner を捨てる。
  const shownOwner = useRef<string | undefined>(undefined);
  const { owner, clearedAt } = current;
  const ready = privateDataReady(current);
  const isCheckingSameOwner = !ready && checkingSameOwner(shownOwner.current, current, session);
  shownOwner.current = ready ? owner ?? undefined : isCheckingSameOwner ? shownOwner.current : undefined;
  if (owner === null) {
    return <SignedOutPage />;
  }
  if (!shownOwner.current) {
    return <Loading />;
  }
  return (
    <TodayScreen
      key={`${shownOwner.current}:${goalId}:${draftGeneration}`}
      goalId={goalId}
      notBefore={isCheckingSameOwner ? Number.POSITIVE_INFINITY : clearedAt}
    />
  );
}

/** 設定変更時に量の draft を読み替えず、RecordChoiceBar で入力し直してもらう。 */
function recordSettingsKey(goal: Pick<Goal, 'id' | 'unit' | 'timezone' | 'goalSettingsRevision' | 'sessionAmount'>): string {
  return JSON.stringify([goal.id, goal.unit, goal.timezone, goal.goalSettingsRevision, goal.sessionAmount]);
}

/** 今日と昨日の保存結果の通知のうち、新しい方（sequence が大きい方）を1つだけ出す。 */
function newestFeedback(...candidates: (SaveFeedbackValue | null)[]): SaveFeedbackValue | null {
  return candidates
    .filter(value => value !== null)
    .sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0] ?? null;
}

function TodayScreen({ goalId, notBefore }: { goalId: string; notBefore: number }) {
  // graph は1つだけ描画する。PCは週間履歴の後、スマホは見通しの後に置く。
  const [isWideLayout, setIsWideLayout] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(WIDE_LAYOUT_QUERY).matches
  ));
  useEffect(() => {
    const media = window.matchMedia(WIDE_LAYOUT_QUERY);
    const changed = () => setIsWideLayout(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  const { goalQuery, todayQuery, logsQuery, snapshot, goal: acceptedGoal, resyncFailed, refresh, retryResync } = useTodayData(goalId, notBefore);

  // 今日と昨日は同時に編集しない。保存状態は別々に持つ。
  const [changing, setChanging] = useState(false);
  const [amountEditing, setAmountEditing] = useState(false);
  const [recordDraft, setRecordDraft] = useState<RecordDraft | null>(null);
  // 開いた量の入力・記録変更は開始した日を保持する。翌日の入力へ黙って付け替えない
  const [todayEditDate, setTodayEditDate] = useState<string | undefined>();
  const queryClient = useQueryClient();
  // 昨日も訂正を始めた時点の記録と対象日を固定する。
  const [yesterdayEdit, setYesterdayEdit] = useState<Log | null>(null);
  const yesterdayChangeEntry = useRef<HTMLButtonElement>(null);
  const yesterdayOriginalEntry = useRef<HTMLElement | null>(null);
  const yesterdayFocusAfterCancel = useRef<string | undefined>(undefined);
  // 保存・取消で押したボタンが消えるため、記録済み/達成済みの見出しへ focus を戻す。
  const focusAfterSave = useRef(false);
  const resetTodayEdit = () => {
    setChanging(false);
    setAmountEditing(false);
    setTodayEditDate(undefined);
    setRecordDraft(null);
  };
  const todaySaver = useSaveLog(goalId, {
    context: snapshot?.goal ?? acceptedGoal,
    onSaved: () => {
      focusAfterSave.current = true;
      resetTodayEdit();
    },
    localDate: todayEditDate ?? snapshot?.today.today ?? acceptedGoal?.today,
    // 再描画前のクリックでも、QueryClient に到着済みの API 日付を検査する
    canSaveDate: (date) => isCurrentToday(
      date,
      queryClient.getQueryData<Goal>(goalKeys.detail(goalId))?.today,
      queryClient.getQueryData<Today>(todayKeys.today(goalId))?.today,
    ),
    // 同一 owner 確認後の cache 消去中も、API の今日が分かるまで入力と保留保存を保持する（D-30）。
    isStaleDate: (date) => {
      // 確認中に届いた未採用の日付は、入力の破棄にも使わない。
      if (!privateDataReady(getPrivateEpoch())) {
        return false;
      }
      const goalToday = queryClient.getQueryData<Goal>(goalKeys.detail(goalId))?.today;
      const todayToday = queryClient.getQueryData<Today>(todayKeys.today(goalId))?.today;
      // Todayだけの先着では、同じ日付のGoalをまだ待っている。既知の矛盾だけを日付変更と扱う。
      return (goalToday !== undefined && date !== goalToday)
        || (todayToday !== undefined && date < todayToday);
    },
  });
  const yesterdaySaver = useSaveLog(goalId, {
    context: snapshot?.goal,
    onSaved: () => setYesterdayEdit(null),
    localDate: yesterdayEdit?.localDate ?? snapshot?.today.yesterday,
  });
  // 「後で答える」を押したときの対象日。日付が変われば問いかけを出し直す
  const [yesterdayLaterFor, setYesterdayLaterFor] = useState<string | null>(null);

  // 取り直した見出しが出たら、そこへフォーカスを移す（保存の直後だけ）
  useEffect(() => {
    if (!focusAfterSave.current) {
      return;
    }
    const heading = document.getElementById('fr-recorded-title') ?? document.getElementById('fr-achieved-title');
    if (!heading) {
      return;
    }
    focusAfterSave.current = false;
    heading.focus();
  });

  // edit/view 切替で元ボタンが消えるため、取消の commit 後に同じ日の入口へ戻す。
  // ref の intent は再描画を起こさないので依存配列を置かず、一度だけ消費する。
  // owner/Goal/draft 世代の remount で intent を捨てる。
  useEffect(() => {
    const date = yesterdayFocusAfterCancel.current;
    if (!date) {
      return;
    }
    yesterdayFocusAfterCancel.current = undefined;
    const entry = yesterdayChangeEntry.current;
    if (
      !privateDataReady(getPrivateEpoch())
      || date !== snapshot?.today.yesterday
      || !entry?.isConnected
      || entry.disabled
    ) {
      return;
    }
    const original = yesterdayOriginalEntry.current;
    const page = entry.closest('.fr-page--today');
    const originalAvailable = original?.isConnected && page?.contains(original)
      && !(original instanceof HTMLButtonElement && original.disabled);
    (originalAvailable ? original : entry)?.focus();
  });

  if (isNotFound(goalQuery.error) || isNotFound(todayQuery.error)) {
    return <NotFound />;
  }
  // 401 では cache のタイトル・記録も含め、画面全体をログイン切れへ切り替える。
  if ([goalQuery.error, todayQuery.error, logsQuery.error].some(isUnauthenticated)) {
    return <SignedOutPage />;
  }

  const goal = snapshot?.goal;
  const today = snapshot?.today;
  // 未記録・未達成は API の値だけで決める。記録済みでも選び直し中は2択を出す。
  const unrecorded = today ? today.prediction.todayStatus === 'UNRECORDED' && !today.prediction.progress.completed : false;
  // Today の取得失敗時も、採用済み Goal の日付で記録できる。401/404 は上で拒否済み。
  // 同一 owner 確認で isError が pending に戻っても、開いた fallback 入力は外さない（D-30）。
  const fallbackGoal = !today && (todayQuery.isError || amountEditing) ? acceptedGoal : undefined;
  const recordGoal = goal ?? fallbackGoal;
  const recordDate = todayEditDate ?? today?.today ?? fallbackGoal?.today;
  const canRecordToday = recordDate !== undefined && todaySaver.canSaveDate(recordDate)
    && (!todaySaver.failure?.vars || todaySaver.canSaveDate(todaySaver.failure.vars.localDate));
  const showChoices = recordDate !== undefined && recordGoal !== undefined && recordDate >= recordGoal.recordStartDate
    && (today && goal ? unrecorded || (changing && today.todayLog != null) : fallbackGoal?.todayStatus === 'UNRECORDED');
  // 今日と昨日を同時に編集しない（#88）
  const locks = editLocks({
    changingToday: changing,
    todayAmountEditing: amountEditing,
    todayChoicesShown: !!showChoices,
    todaySaving: todaySaver.isSaving,
    yesterdayEditing: yesterdayEdit !== null,
  });
  // 保存成功と、その後の表示再取得失敗を区別する。
  const savedButStale = (todaySaver.refreshFailed || yesterdaySaver.refreshFailed) && (todayQuery.isError || logsQuery.isError);

  const yesterday = goal && today && snapshot ? yesterdayRecord(today.yesterday, goal.recordStartDate, snapshot.logs) : null;
  // 昨日の行・Goal メニューのどちらの入口からでも、取消時に元のボタンへ戻す。
  const beginYesterdayCorrection = (log: Log) => {
    yesterdayOriginalEntry.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    yesterdaySaver.reset();
    setYesterdayEdit(log);
  };
  const startYesterdayCorrection =
    yesterday?.kind === 'recorded' && !yesterdayEdit && !locks.yesterdayLocked
      ? () => beginYesterdayCorrection(yesterday.log)
      : undefined;

  // 記録済みの今日を選び直す（「記録を変更」と直近7日の帯の今日から）
  const startTodayChange = () => {
    if (yesterdayEdit) {
      return;
    }
    setAmountEditing(false);
    setChanging(true);
    setTodayEditDate(today?.today);
  };

  // 保存中の取消は遅れて届く失敗と再試行を見失うため、ボタンと callback の両方で防ぐ。
  const cancelChange = () => {
    if (locks.cancelChangeLocked) {
      return;
    }
    focusAfterSave.current = true;
    todaySaver.reset();
    resetTodayEdit();
  };

  let yesterdayArea = null;
  if (goal && today) {
    const common = {
      sessionAmount: goal.sessionAmount,
      fmt: amountFormat(goal),
      saver: yesterdaySaver,
      onRefresh: refresh,
    };
    if (yesterdayEdit) {
      yesterdayArea = (
        <YesterdayCorrection
          // 訂正を始めるたびに作り直し、選択の初期値を保存済みの記録から取り直す
          key="edit"
          {...common}
          log={yesterdayEdit}
          currentYesterday={today.yesterday}
          editing
          disabled={false}
          onStart={() => {}}
          onEnd={() => {
            yesterdayFocusAfterCancel.current = yesterdayEdit.localDate;
            setYesterdayEdit(null);
          }}
        />
      );
    } else if (showYesterdayPrompt(today, yesterdayLaterFor)) {
      yesterdayArea = (
        <YesterdayDetails
          key={today.yesterday}
          reveal={yesterdaySaver.isSaving ? 'saving' : yesterdaySaver.failure}
        >
          <summary>
            <span>{todayCopy.yesterdayQuestion}</span>
            <span className="fr-today__yesterday-date">
              {longDate(today.yesterday)}<Icon name="chevronDown" size={16} />
            </span>
          </summary>
          <YesterdayPrompt
            {...common}
            yesterday={today.yesterday}
            onLater={() => setYesterdayLaterFor(today.yesterday)}
          />
        </YesterdayDetails>
      );
    } else if (yesterday?.kind === 'recorded') {
      const log = yesterday.log;
      yesterdayArea = (
        <YesterdayCorrection
          key="view"
          {...common}
          entryRef={yesterdayChangeEntry}
          log={log}
          currentYesterday={today.yesterday}
          editing={false}
          disabled={locks.yesterdayLocked}
          onStart={() => beginYesterdayCorrection(log)}
          onEnd={() => setYesterdayEdit(null)}
        />
      );
    } else if (yesterday?.kind === 'before-start' && today.today === goal.recordStartDate) {
      // 記録開始日は昨日の問いかけを出さず、開始日前の扱いを伝える（P-14）。
      yesterdayArea = (
        <div className="fr-first-day">
          <InsufficientNotice role="status">{todayCopy.firstDayNote}</InsufficientNotice>
        </div>
      );
    }
  }

  const validSnapshot = snapshot && !todayQuery.isError && !goalQuery.isError && !logsQuery.isError && !resyncFailed;
  // 最後の整合表示を残していても、取得中の部分更新へ試算を載せない。
  const previewSnapshot = validSnapshot && snapshot && snapshot.goal === goalQuery.data
    && snapshot.today === todayQuery.data && snapshot.logs === logsQuery.data
    ? snapshot
    : null;
  const previewBaseline = previewSnapshot ? recordPreviewBaseline(previewSnapshot) : undefined;
  const preview = previewSnapshot && showChoices && canRecordToday && privateDataReady(getPrivateEpoch())
    && !todaySaver.isSaving && !todaySaver.failure && !yesterdayEdit
    ? draftProgress(previewSnapshot, recordDraft)
    : null;
  const historyArea = validSnapshot ? (
    <ForecastBoundary resetKey={todayQuery.dataUpdatedAt}>
      <TodayContent
        area="history"
        goal={snapshot.goal}
        today={snapshot.today}
        logs={snapshot.logs}
        changing={changing}
        changeDisabled={!!yesterdayEdit}
        onChange={startTodayChange}
      />
    </ForecastBoundary>
  ) : null;
  const feedback = newestFeedback(todaySaver.feedback, yesterdaySaver.feedback);

  return (
    <div className="fr fr-page fr-page--today">
      <PageTitle title={recordGoal?.title} />
      <AppBar
        title={recordGoal?.title ?? ''}
        leading={
          // 戻る先を文字で示し、読み上げ名にも含める（#251）。
          <Link to="/goals" className="fr-today__back" aria-label={todayCopy.backToList}>
            <Icon name="back" />
            <span>{todayCopy.backToListShort}</span>
          </Link>
        }
        trailing={goal ? <GoalMenu goalId={goalId} onCorrectYesterday={startYesterdayCorrection} /> : undefined}
      />
      {/* デスクトップでは戻り口とメニューを nav に出す。Goal 名は行き先と混同しないよう別に表示する（#251）。 */}
      <nav className="fr-today__desknav" aria-label={todayCopy.breadcrumb}>
        <Link to="/goals" className="fr-btn fr-btn--text fr-today__crumb">
          <Icon name="back" size={18} />
          {todayCopy.backToListLabel}
        </Link>
        {goal ? <GoalMenu goalId={goalId} onCorrectYesterday={startYesterdayCorrection} /> : null}
      </nav>
      {recordGoal ? <p className="fr-today__goalname">{recordGoal.title}</p> : null}
      {/* 同じ snapshot を area ごとに描画する。PC は primary→記録→graph→details、スマホは primary→記録→details→graph。 */}
      <div className="fr-today-layout">
        <div className="fr-today__scroll">
          <div className="fr-today__primary">
            {todayQuery.isError || goalQuery.isError || logsQuery.isError ? (
              savedButStale ? (
                <SavedButStale onRetry={refresh} />
              ) : (
                <FetchError
                  error={todayQuery.error ?? goalQuery.error ?? logsQuery.error}
                  onRetry={refresh}
                  canRecordToday={canRecordToday}
                />
              )
            ) : resyncFailed ? (
              <Inconsistent onRetry={retryResync} />
            ) : snapshot ? (
              <ForecastBoundary resetKey={todayQuery.dataUpdatedAt}>
                <TodayContent
                  area="primary"
                  goal={snapshot.goal}
                  today={snapshot.today}
                  logs={snapshot.logs}
                  changing={changing}
                  changeDisabled={!!yesterdayEdit}
                  onChange={startTodayChange}
                  preview={preview}
                />
              </ForecastBoundary>
            ) : (
              <Loading />
            )}


          </div>

          {goal && today && snapshot ? (
            <section className="fr-today__records" aria-label={todayCopy.recentDays}>
              <RecentDays
                today={today.today}
                yesterday={today.yesterday}
                recordStartDate={goal.recordStartDate}
                logs={snapshot.logs}
                onYesterday={startYesterdayCorrection}
                onToday={today.todayLog && !changing && !yesterdayEdit ? startTodayChange : undefined}
              />
              <Link to="/goals/$goalId/history" params={{ goalId }} className="fr-btn fr-btn--text">履歴をすべて見る・編集する</Link>
              {yesterdayArea}
            </section>
          ) : null}

          {isWideLayout ? historyArea : null}

          {validSnapshot ? (
            <ForecastBoundary resetKey={todayQuery.dataUpdatedAt}>
              <TodayContent
                feedback={validSnapshot && !changing && !amountEditing && !yesterdayEdit ? feedback : null}
                area="details"
                goal={snapshot.goal}
                today={snapshot.today}
                logs={snapshot.logs}
                changing={changing}
                changeDisabled={!!yesterdayEdit}
                onChange={startTodayChange}
                preview={preview}
              />
            </ForecastBoundary>
          ) : null}

          {!isWideLayout ? historyArea : null}
        </div>

        {showChoices && recordGoal && recordDate ? (
          <section className="fr-today__dock" aria-labelledby="fr-today-record-day">
            <p id="fr-today-record-day" className="fr-today__record-day">
              <span>{todaySaver.isStaleDate(recordDate) ? todayCopy.recordTarget : todayCopy.todayRecordTitle}</span>
              <time dateTime={recordDate}>{longDate(recordDate)}</time>
            </p>
            <RecordChoiceBar
              // 選び直しの開始・取消で、量の入力を持ち越さない。
              key={changing ? 'change' : 'new'}
              today={recordDate}
              sessionAmount={recordGoal.sessionAmount}
              fmt={amountFormat(recordGoal)}
              recordSettings={recordSettingsKey(recordGoal)}
              current={changing && today ? today.todayLog : null}
              saver={todaySaver}
              previewBaseline={previewBaseline}
              onPreviewChange={setRecordDraft}
              {...(changing ? { onCancelChange: cancelChange } : {})}
              locked={locks.todayLocked}
              editingAmount={locks.todayAmountEditing}
              onEditingAmountChange={(editing) => {
                setAmountEditing(editing);
                setTodayEditDate(editing || changing ? recordDate : undefined);
              }}
              onRefresh={() => {
                todaySaver.reset();
                resetTodayEdit();
                refresh();
              }}
            />
            <DraftProgressPreview value={preview} compact />
          </section>
        ) : null}
        {!showChoices && validSnapshot && goal && today?.todayLog ? (
          <section className="fr-today__dock" aria-label="今日の記録を変更する">
            <p className="fr-today__record-day">
              <span>{todayCopy.todayRecordTitle}</span><time dateTime={today.today}>{longDate(today.today)}</time>
            </p>
            <StickyActionBar
              note={
                <span>
                  {today.todayLog.status === 'DONE'
                    ? `やった ${amountFormat(goal).record(today.todayLog.amount ?? 0)}`
                    : todayCopy.recordedRest}
                </span>
              }
            >
              <Button
                variant="secondary"
                icon="edit"
                disabled={!!yesterdayEdit || todaySaver.isSaving}
                onClick={startTodayChange}
              >
                {todayCopy.changeRecord}
              </Button>
            </StickyActionBar>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="fr-today__top">
      <h1 className="fr-today__question">{todayCopy.question}</h1>
      <p className="fr-loading" role="status">
        <Spinner />
        {todayCopy.loading}
      </p>
    </div>
  );
}

function FetchError({ error, onRetry, canRecordToday }: {
  error: unknown;
  onRetry: () => void;
  canRecordToday: boolean;
}) {
  if (isUnauthenticated(error)) {
    return <SignedOut />;
  }
  // 計算失敗と通信失敗を区別し、どちらもデータ不足と混同しない。
  const calc = error instanceof ApiError && error.body?.error.code === 'PREDICTION_FAILED';
  return (
    <div className="fr-today__top">
      <h1 className="fr-today__question">{todayCopy.question}</h1>
      <ErrorPanel
        title={calc ? todayCopy.calcErrorTitle : todayCopy.networkErrorTitle}
        action={
          <Button icon="retry" onClick={onRetry}>
            {todayCopy.reload}
          </Button>
        }
      >
        {calc ? (canRecordToday ? todayCopy.calcError : todayCopy.calcErrorRecordBlocked) : todayCopy.networkError}
      </ErrorPanel>
    </div>
  );
}

/** ログイン切れ（401）の画面全体。 */
function SignedOutPage() {
  return (
    <div className="fr fr-page">
      <PageTitle title={todayCopy.signedOutTitle} />
      <AppBar
        title=""
        leading={
          <Link to="/goals" className="fr-icon-btn" aria-label={todayCopy.backToList}>
            <Icon name="back" />
          </Link>
        }
      />
      <SignedOut />
    </div>
  );
}

/** 取り直しても Goal・Today・記録の時点がそろわなかった。食い違った組み合わせは表示しない。 */
function Inconsistent({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fr-today__top">
      <h1 className="fr-today__question">{todayCopy.question}</h1>
      <ErrorPanel
        title={todayCopy.inconsistentTitle}
        action={
          <Button icon="retry" onClick={onRetry}>
            {todayCopy.reload}
          </Button>
        }
      >
        {todayCopy.inconsistent}
      </ErrorPanel>
    </div>
  );
}

/** 保存は成功したが、見通しの取り直しに失敗した。保存できなかったと誤解させない。 */
function SavedButStale({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fr-today__top">
      <ErrorPanel
        title={todayCopy.savedButStaleTitle}
        action={
          <Button icon="retry" onClick={onRetry}>
            {todayCopy.reload}
          </Button>
        }
      >
        {todayCopy.savedButStale}
      </ErrorPanel>
    </div>
  );
}

function NotFound() {
  return (
    <div className="fr fr-page">
      <PageTitle title={todayCopy.notFoundTitle} />
      <AppBar title="" />
      <div className="fr-today__top">
        <h1 className="fr-today__question">{todayCopy.notFoundTitle}</h1>
        <ErrorPanel
          title={todayCopy.notFoundPanel}
          action={
            <Link to="/goals" className="fr-btn fr-btn--secondary">
              {todayCopy.backToGoals}
            </Link>
          }
        >
          {todayCopy.notFound}
        </ErrorPanel>
      </div>
    </div>
  );
}

/** ログインが切れた（API が 401 を返した）。ログイン後にこの画面へ戻れるよう、今の場所を渡す。 */
function SignedOut() {
  const location = useLocation();
  return (
    <div className="fr-today__top">
      <h1 className="fr-today__question">{todayCopy.question}</h1>
      <ErrorPanel
        title={todayCopy.signedOutTitle}
        action={
          <Link to="/login" search={{ redirect: location.href, reason: 'expired' }} className="fr-btn fr-btn--secondary">
            {todayCopy.signIn}
          </Link>
        }
      >
        {todayCopy.signedOut}
      </ErrorPanel>
    </div>
  );
}
