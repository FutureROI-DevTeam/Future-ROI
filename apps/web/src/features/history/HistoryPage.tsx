import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useHistoryData } from './useHistoryData.ts';
import { HistoryEditor, type HistoryDraft } from './HistoryEditor.tsx';
import { amountFormat } from '../../copy/amount.ts';
import { longDate } from '../../copy/date.ts';
import { Button } from '../../ui/components/Button.tsx';

import { isNotFound, isUnauthenticated } from '../../api/http.ts';
import { privateDataReady, usePrivateEpoch } from '../../api/session-cache.ts';
import { useMemoryDraft } from '../../api/session-draft.ts';
import { appCopy } from '../../copy/app.ts';
import { todayCopy } from '../../copy/today.ts';
import { AppBar } from '../../ui/components/AppBar.tsx';
import { DeskHeader } from '../../ui/components/DeskHeader.tsx';
import { Icon } from '../../ui/components/Icon.tsx';
import { PageTitle } from '../../ui/components/PageTitle.tsx';
import { Spinner } from '../../ui/components/Spinner.tsx';
import { GoalNotFoundPanel, LoadErrorPanel, SignedOutPanel } from '../goals/GoalStates.tsx';
import { dayState, monthCells, shiftMonth } from './calendar.ts';
import { DayMark } from './DayMark.tsx';
import '../../ui/tokens.css';
import '../../ui/page.css';
import '../../ui/components/Button.css';
import './history.css';

type HistoryMemory = { month?: string | undefined; selected?: string | null; editor?: HistoryDraft | null };
const c = todayCopy;
/** カレンダーの見出し。月曜始まり（monthCells の並びと同じ）。 */
const WEEKDAY_HEADERS_FROM_MONDAY = ['月', '火', '水', '木', '金', '土', '日'];

/**
 * 記録の履歴（デザイン F1）。/goals/$goalId/history
 * 月ごとのカレンダーに、やった・休んだ・未記録（休んだとは別）を出す。記録開始日の月から今日の月まで移れる。
 * Goal（記録開始日・今日）と記録の一覧は Today と同じキャッシュを使い、表示のために計算し直さない。
 */
export function HistoryPage({ goalId, initialDate }: { goalId: string; initialDate?: string | undefined }) {
  const current = usePrivateEpoch();
  const draft = useMemoryDraft<HistoryMemory>(current, `history:${goalId}:${initialDate ?? ''}`);
  if (!privateDataReady(current)) {
    return <HistoryWaiting goalId={goalId} signedOut={current.owner === null} />;
  }
  const restored = draft.restored && typeof draft.restored === 'object' ? draft.restored : undefined;
  // The URL chooses the initial day of a visit; a healthy recheck restores the user's later selection.
  const memory = restored;
  // 利用者が替わったら表示月も捨てる。旧cacheの消去が完了するまで取得部品をmountしない。
  return (
    <PrivateHistory
      key={`${current.owner}:${goalId}:${initialDate ?? ''}:${draft.generation}`}
      goalId={goalId}
      clearedAt={current.clearedAt}
      initialDate={initialDate}
      initialMonth={memory?.month ?? (initialDate && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(initialDate) ? initialDate.slice(0,7) : undefined)}
      initialMemory={memory}
      onRemember={draft.remember}
    />
  );
}

function HistoryWaiting({ goalId, signedOut }: { goalId: string; signedOut: boolean }) {
  const back = (
    <Link to="/goals/$goalId" params={{ goalId }} className="fr-icon-btn" aria-label={c.backToGoal}>
      <Icon name="back" />
    </Link>
  );
  return (
    <div className="fr fr-page fr-page--desk fr-page--history">
      <PageTitle title={c.historyTitle} />
      <AppBar title={c.historyTitle} leading={back} />
      <DeskHeader back={back} title={c.historyTitle} />
      <div className="fr-history__pad">
        {signedOut ? <SignedOutPanel /> : (
          <p className="fr-history__legend" role="status"><Spinner />{appCopy.loading}</p>
        )}
      </div>
    </div>
  );
}

function PrivateHistory({ goalId, clearedAt, initialMonth, onRemember, initialMemory, initialDate }: {
  initialDate?: string | undefined;
  goalId: string;
  clearedAt: number;
  initialMonth: string | undefined;
  onRemember: (memory: HistoryMemory) => void;
  initialMemory?: HistoryMemory | undefined;
}) {
  const { goalQuery, logsQuery, snapshot, refresh, resyncFailed } = useHistoryData(goalId, clearedAt);
  const [selected,setSelected] = useState<string|null>(initialMemory?.editor?.date ?? initialMemory?.selected ?? initialDate ?? null);
  const [editing,setEditing] = useState(!!initialMemory?.editor);
  const [editorDraft,setEditorDraft] = useState<HistoryDraft|null>(initialMemory?.editor ?? null);
  const [message,setMessage] = useState<string|null>(null);
  const editEntry=useRef<HTMLButtonElement>(null);
  const [month, setMonth] = useState<string | null>(initialMonth ?? null);
  // Retain only owner-scoped memory while session confirmation removes private DOM.
  useEffect(()=>{ onRemember({month:month ?? undefined,selected,editor:editing?editorDraft:null}); },[month,selected,editing,editorDraft,onRemember]);

  const goal = [goalQuery.error, logsQuery.error].some(isNotFound) ? undefined : snapshot?.goal;
  const logs = snapshot?.logs;
  const error = goalQuery.error ?? logsQuery.error ?? (resyncFailed ? new Error('履歴の内容が揃いません。読み込み直してください。') : null);
  if ([goalQuery.error, logsQuery.error].some(isUnauthenticated)) {
    return <HistoryWaiting goalId={goalId} signedOut />;
  }
  const back = (
    <Link to="/goals/$goalId" params={{ goalId }} className="fr-icon-btn" aria-label={c.backToGoal}>
      <Icon name="back" />
    </Link>
  );
  // デスクトップ幅の戻り先（デザイン Desk-history）。行き先はスマートフォン幅の「＜」と同じそのGoalのToday
  const crumb = (
    <Link to="/goals/$goalId" params={{ goalId }} className="fr-btn fr-btn--text">
      <Icon name="back" size={18} />
      {goal ? c.breadcrumbTrail(goal.title) : c.backToGoal}
    </Link>
  );

  if (!goal || !logs) {
    return (
      <div className="fr fr-page fr-page--desk fr-page--history">
        <PageTitle title={c.historyTitle} />
        <AppBar title={c.historyTitle} leading={back} />
        <DeskHeader back={crumb} title={c.historyTitle} />
        <div className="fr-history__pad">
          {isNotFound(error) ? (
            <GoalNotFoundPanel />
          ) : error ? (
            <LoadErrorPanel error={error} onRetry={() => void Promise.all([goalQuery.refetch(), logsQuery.refetch()])} />
          ) : (
            <p className="fr-history__legend" role="status">
              <Spinner />
              {appCopy.loading}
            </p>
          )}
        </div>
      </div>
    );
  }

  const first = goal.recordStartDate.slice(0, 7);
  const last = goal.today.slice(0, 7);
  const shown = month === null ? last : month < first ? first : month > last ? last : month;
  const chooseMonth = (next: string) => {
    setEditing(false);setSelected(null);setMessage(null);
    setMonth(next);

  };
  const validSelected = selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) && !Number.isNaN(Date.parse(selected+'T00:00:00Z')) && new Date(selected+'T00:00:00Z').toISOString().slice(0,10)===selected;
  const date = validSelected ? selected : goal.today;
  const log=logs.find(l=>l.localDate===date);
  const canEdit=date>=goal.recordStartDate && date<=goal.today && !error && !resyncFailed && snapshot?.goal===goalQuery.data && snapshot?.logs===logsQuery.data;
  return (
    <div className="fr fr-page fr-page--desk fr-page--history">
      <PageTitle title={`${c.historyTitle}（${goal.title}）`} />
      <AppBar title={c.historyTitle} leading={back} />
      {/* 見出し（h1）は月の名前なので、デスクトップ幅の「記録の履歴」は見出しにしない */}
      <DeskHeader back={crumb} title={c.historyTitle} titleAs="p" />
      <div className="fr-history__box">
        <p className="fr-history__goal">{goal.title}</p>
        <section className="fr-history__top">
          <div className="fr-history__month">
            <button
              type="button"
              className="fr-icon-btn"
              aria-label={c.prevMonth}
              disabled={shown <= first || editing}
              onClick={() => chooseMonth(shiftMonth(shown, -1))}
            >
              <Icon name="back" />
            </button>
            <h1 aria-live="polite">{c.monthLabel(shown)}</h1>
            <button
              type="button"
              className="fr-icon-btn"
              aria-label={c.nextMonth}
              disabled={shown >= last || editing}
              onClick={() => chooseMonth(shiftMonth(shown, 1))}
            >
              <Icon name="chevronRight" />
            </button>
          </div>
          <Button variant="text" disabled={shown===last || editing} onClick={()=>chooseMonth(last)}>今月へ戻る</Button>
          <p className="fr-history__legend">
            <span>
              <DayMark state="done" size={24} />
              {c.dayStateLabel.done}
            </span>
            <span>
              <DayMark state="rest" size={24} />
              {c.dayStateLabel.rest}
            </span>
            <span>
              <DayMark state="unrecorded" size={24} />
              {c.legendUnrecorded}
            </span>
          </p>
        </section>
        <ul className="fr-history__cal" aria-label={c.monthLabel(shown)}>
          {WEEKDAY_HEADERS_FROM_MONDAY.map((weekday) => (
            <li key={weekday} className="fr-history__wd" aria-hidden="true">
              {weekday}
            </li>
          ))}
          {monthCells(shown).map((date, i) => {
            if (date === null) {
              return <li key={`pad-${i}`} aria-hidden="true" />;
            }
            const state = dayState(date, logs, goal.recordStartDate, goal.today);
            const day = Number(date.slice(8, 10));
            const label = `${Number(date.slice(5, 7))}月${day}日${state === 'outside' ? '' : ` ${c.dayStateLabel[state]}`}`;
            return (
              <li key={date} aria-label={label}>
                <button type="button" className="fr-history__day" aria-label={label} aria-pressed={date===(selected ?? goal.today)} disabled={editing} onClick={()=>{setSelected(date);setMessage(null)}}>
                  <DayMark state={state} size={36} /><span aria-hidden="true">{day}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error || resyncFailed ? <p role="alert">履歴の更新を確認できません。<Button variant="text" onClick={refresh}>読み込み直す</Button></p>:null}
        {message?<p role="status">{message}</p>:null}
        {editing?<HistoryEditor key={date} initial={editorDraft ?? undefined} onDraftChange={setEditorDraft} goal={goal} date={date} log={log} onClose={()=>{setEditing(false);refresh();requestAnimationFrame(()=>editEntry.current?.focus())}} onSaved={()=>{setEditing(false);setMessage('記録を保存しました。累計と予測を確認しています。');requestAnimationFrame(()=>editEntry.current?.focus())}}/>:
          <section className="fr-history-selection" aria-label="選択した日の記録">
            <h2>{longDate(date)}</h2>
            <p>{date<goal.recordStartDate?'記録開始前':date>goal.today?'未来の日付':log?.status==='DONE'?'やった '+amountFormat(goal).record(log.amount!):log?.status==='SKIPPED'?'休んだ':'未記録（休みとは別）'}</p>
            <Button ref={editEntry} disabled={!canEdit} onClick={()=>{setSelected(date);setEditorDraft(null);setEditing(true);}}>この日の記録を編集</Button>
          </section>}
      </div>
    </div>
  );
}
