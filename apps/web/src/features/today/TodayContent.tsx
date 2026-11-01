import type { SaveFeedback } from '../logs/save-feedback.ts';
import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import type { GoalR11 as Goal, Log, TodayR11 as Today } from '@contracts';
import { amountFormat } from '../../copy/amount.ts';
import { todayCopy } from '../../copy/today.ts';
import type { DraftProgress } from '../logs/draft-preview.ts';
import { reachedDate } from '../logs/record-log.ts';
import { assertForecastPresentation } from '../prior/forecast-validation.ts';
import { CoreMetric } from './CoreMetric.tsx';
import { CompletionBrief, CompletionDetails, OutlookPanel } from './OutlookPanel.tsx';
import { ProgressDetails, ProgressSummary } from './ProgressSummary.tsx';
import { AchievedFacts, AchievedPanel, ChangeHeader, RecordedSummary, TodayRecordLine } from './RecordedSummary.tsx';
import { toForecastView } from './forecast-view.ts';

/** 整合した snapshot を描画する。取得・保存・編集状態は TodayPage が所有する。 */
export function TodayContent({
  area,
  goal,
  today,
  logs,
  changing,
  changeDisabled,
  onChange,
  preview = null,
  feedback = null,
}: {
  area: 'primary' | 'details' | 'history';
  goal: Goal;
  today: Today;
  logs: Log[];
  /** 今日の記録を選び直す間は上部の見出しを切り替える。 */
  changing: boolean;
  /** 昨日の訂正中は今日の変更を止める。callback 側でも同じ条件を確認する。 */
  changeDisabled: boolean;
  onChange: () => void;
  preview?: DraftProgress | null;
  feedback?: SaveFeedback | null;
}) {
  // Boundary 内で変換・検査し、失敗しても記録の2択を残す。出所・plan は API の値を使う。
  const view = toForecastView(today.prediction, goal.unit, {
    provenance: today.provenance,
    plan: today.plan,
    sessionAmount: today.context.sessionAmount,
  });
  assertForecastPresentation(view);
  const fmt = amountFormat(goal);
  // 読み込み中やエラー状態には進捗を出さない。
  const hasProgress = view.kind === 'completed' || view.kind === 'forecast' || view.kind === 'today-recorded';
  if (area === 'history') {
    return hasProgress ? (
      <ProgressDetails
        goalId={goal.id}
        progress={view.progress}
        initialProgress={goal.initialProgress}
        logs={logs}
        recordStartDate={goal.recordStartDate}
        today={today.today}
        fmt={fmt}
      />
    ) : null;
  }
  const progress =
    hasProgress ? (
      <ProgressSummary
        feedback={feedback}
        showDetails={false}
        preview={preview}
        brief={view.kind === 'forecast' || view.kind === 'today-recorded'
          ? <CompletionBrief completion={view.completion} />
          : null}
        progress={view.progress}
        initialProgress={goal.initialProgress}
        logs={logs}
        recordStartDate={goal.recordStartDate}
        today={today.today}
        fmt={fmt}
      />
    ) : null;
  const outlookTitle = todayCopy.outlookTitle(fmt.total(goal.totalRequired));
  const changeHeader =
    changing && today.todayLog ? (
      <ChangeHeader log={today.todayLog} sessionAmount={goal.sessionAmount} fmt={fmt} />
    ) : null;

  switch (view.kind) {
    case 'completed':
      return area === 'primary' ? (
        <>
          {changeHeader ?? <AchievedPanel done={view.progress.done} total={view.progress.total} fmt={fmt} />}
          {/* 達成後も今日の誤記録を訂正できる（R-03 / R-08）。 */}
          {today.todayLog && !changeHeader ? (
            <TodayRecordLine
              log={today.todayLog}
              today={today.today}
              sessionAmount={goal.sessionAmount}
              fmt={fmt}
              onChange={onChange}
              changeDisabled={changeDisabled}
            />
          ) : null}
        </>
      ) : (
        <div className="fr-today__right">
          {progress}
          <AchievedFacts
            goalId={goal.id}
            recordStartDate={goal.recordStartDate}
            reached={reachedDate(goal.initialProgress, goal.totalRequired, logs)}
          />
        </div>
      );
    case 'today-recorded':
    case 'forecast':
      if (area === 'primary') {
        if (view.kind === 'today-recorded') {
          return changeHeader ?? (today.todayLog ? (
            <RecordedSummary
              todayLog={today.todayLog}
              fmt={fmt}
              onChange={onChange}
              changeDisabled={changeDisabled}
            />
          ) : null);
        }
        return (
          <section className="fr-today__top" aria-labelledby="fr-question">
            <CoreMetric core={view.core}>
              <h1 id="fr-question" className="fr-today__question">
                {todayCopy.question.split(/(?<=、|は)/).map((phrase, index) => (
                  <Fragment key={index}>{phrase}<wbr /></Fragment>
                ))}
              </h1>
            </CoreMetric>
          </section>
        );
      }
      return (
        <div className="fr-today__right">
          {progress}
          <OutlookPanel
            showDetails={false}
            completion={view.completion}
            today={today.today}
            title={outlookTitle}
            fmt={fmt}
            targetDate={goal.targetDate}
            sessionAmount={today.context.sessionAmount}
          />
          <Link to="/goals/$goalId/edit" params={{ goalId: goal.id }} className="fr-link">
            {todayCopy.editAnswers}
          </Link>
          {view.completion.kind === 'estimate' ? (
            <div className="fr-today__details">
              <CompletionDetails completion={view.completion} today={today.today} targetDate={goal.targetDate} />
            </div>
          ) : null}
        </div>
      );
    default:
      throw new TypeError(`Today の表示データとして想定していない状態です: ${view.kind}`);
  }
}
