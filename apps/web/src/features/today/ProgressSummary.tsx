import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { addDays, longDate } from '../../copy/date.ts';
import { cumulativeSeries } from '../history/history-model.ts';
import { SaveFeedback, SaveDelta } from '../logs/SaveFeedback.tsx';
import type { SaveFeedback as Feedback } from '../logs/save-feedback.ts';
import type { ReactNode } from 'react';
import type { Log } from '@contracts';
import { Section, SectionLabel } from '../../ui/components/Section.tsx';
import type { AmountFormat } from '../../copy/amount.ts';
import { todayCopy } from '../../copy/today.ts';
import { useElementWidth } from '../../ui/useElementWidth.ts';
import { cumulativeChart, DEFAULT_CHART_WIDTH } from './chart-geometry.ts';

const CUMULATIVE_HEIGHT = 250;
import type { ActualProgress } from '../prior/presentation-types.ts';
import { progressPercent, progressPercentLabel, progressPercentQualifier } from '../../copy/progress.ts';
import type { DraftProgress } from '../logs/draft-preview.ts';
import { DraftProgressPreview } from './DraftProgressPreview.tsx';

interface Props {
  goalId?: string;
  feedback?: Feedback | null;
  progress: ActualProgress;
  initialProgress: number;
  logs: Log[];
  recordStartDate: string;
  today: string;
  /** 量の書き方（分のGoalは累計・総量を時間＋分で出す、P-18）。 */
  fmt: AmountFormat;
  showDetails?: boolean;
  brief?: ReactNode;
  preview?: DraftProgress | null;
}

/** これまでの積み上げ。％は進捗だけに使い、累計は記録開始日〜今日の範囲で描く（今日より先の線は引かない）。 */
export function ProgressSummary({
  progress,
  initialProgress,
  logs,
  recordStartDate,
  today,
  fmt,
  showDetails = true,
  brief,
  preview = null,
  feedback = null,
}: Props) {
  const percent = progressPercent(progress.done, progress.total);
  return (
    <Section labelledBy="fr-progress-title">
      <div className="fr-progress__header">
        <SectionLabel as="h2" id="fr-progress-title">
          {todayCopy.progressLabel}
        </SectionLabel>
        {brief}
      </div>
      <div className="fr-progress">
        <p className="fr-progress__percent">
          {progressPercentLabel(progress.done, progress.total)}
          <small>%</small>
          {progressPercentQualifier(progress.done, progress.total)}
          <SaveDelta value={feedback} field="points" />
        </p>
        <p className="fr-progress__amount">
          {todayCopy.progressActual(fmt.total(progress.done))}
          <SaveDelta value={feedback} field="amount" />
        </p>
      </div>
      <SaveFeedback value={feedback} />
      <DraftProgressPreview value={preview} />
      <dl className="fr-progress__balance">
        <div><dt>{todayCopy.progressGoal}</dt><dd>{fmt.total(progress.total)}</dd></div>
        <div><dt>{todayCopy.progressRemaining}</dt><dd>{fmt.total(Math.max(0, progress.total - progress.done))}</dd></div>
        {progress.done > progress.total ? <div><dt>{todayCopy.progressExcess}</dt><dd>{fmt.total(progress.done - progress.total)}</dd></div> : null}
      </dl>
      <div
        className="fr-progress-track"
        role="progressbar"
        aria-labelledby="fr-progress-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: String(percent) + '%' }} />
      </div>
      {showDetails ? (
        <ProgressDetails
          progress={progress}
          initialProgress={initialProgress}
          logs={logs}
          recordStartDate={recordStartDate}
          today={today}
          fmt={fmt}
        />
      ) : null}
    </Section>
  );
}

export function ProgressDetails({ progress, initialProgress, logs, recordStartDate, today, fmt, goalId }: Props) {
  return (
    <section className="fr-today__history-chart" aria-labelledby="fr-cumulative-title">
      <h2 id="fr-cumulative-title">積み上げ推移</h2>
      <p className="fr-note">記録期間：{recordStartDate}〜{today}</p>
      <p className="fr-note">{todayCopy.progressHelp(initialProgress > 0 ? fmt.total(initialProgress) : null)}</p>
      <CumulativeChartView
        goalId={goalId}
        logs={logs}
        initialProgress={initialProgress}
        total={progress.total}
        recordStartDate={recordStartDate}
        today={today}
        fmt={fmt}
        done={progress.done}
      />
    </section>
  );
}

function CumulativeChartView({
  goalId,
  logs,
  initialProgress,
  total,
  recordStartDate,
  today,
  fmt,
  done,
}: {
  goalId?: string | undefined;
  logs: Log[];
  initialProgress: number;
  total: number;
  recordStartDate: string;
  today: string;
  fmt: AmountFormat;
  done: number;
}) {
  const [period, setPeriod] = useState<30 | 90 | 'all'>(30);
  const [selection, setSelection] = useState<string | null>(null);
  const cutoff = period === 'all' ? recordStartDate : addDays(today, 1 - period).toISOString().slice(0,10);
  const start = cutoff > recordStartDate ? cutoff : recordStartDate;
  const carried = logs.filter(l => l.localDate < start && l.localDate >= recordStartDate && l.status === 'DONE').reduce((n,l)=>n+(l.amount ?? 0),initialProgress);
  const series = useMemo(() => cumulativeSeries(logs, initialProgress, recordStartDate, today, start), [logs, initialProgress, recordStartDate, today, start]);
  const selected = series.find(day=>day.date===selection) ?? series.at(-1)!;
  const selectedIndex = series.indexOf(selected);
  const axis = fmt.axis(done);
  // 実際の幅で描く（縮めて表示すると文字まで小さくなるため）
  const [ref, width] = useElementWidth<HTMLDivElement>(DEFAULT_CHART_WIDTH);
  // 分のGoalは、目盛りを1時間刻みにそろえる（P-18）
  const c = cumulativeChart(logs, carried, total, start, today, width, axis.gridUnit);
  const b = c.bounds;
  const line = c.points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${b.left},${c.zeroY} ${line} ${b.right},${c.zeroY}`;
  const lastPoint = c.points[c.points.length - 1];
  // Keep the measured node mounted so a later day can reveal the chart without losing its observer.
  if (!selected) return <div ref={ref} className="fr-chart-box"><p className="fr-note">今日（{today}）は記録開始日（{recordStartDate}）より前です。表示できる記録日はまだありません。</p></div>;
  return (
    <div ref={ref} className="fr-chart-box">
      <div className="fr-chart-controls" role="group" aria-label="グラフの表示期間">
        {([30,90,'all'] as const).map(value=><button key={value} type="button" className="fr-btn fr-btn--text" aria-pressed={period===value} onClick={()=>{setPeriod(value);setSelection(null);}}>{value==='all'?'全期間':value+'日'}</button>)}
      </div>
      <p className="fr-note">{start}〜{today} · 実績の累計（将来予測を含みません）</p>
      <p className="fr-note">表示範囲：0〜{fmt.total(c.maxValue)}{c.targetY === null ? '（目標量は範囲外）' : ''}</p>
      <svg
        tabIndex={0}
        onKeyDown={event=>{
          const index=event.key==='Home'?0:event.key==='End'?series.length-1:event.key==='ArrowLeft'?selectedIndex-1:event.key==='ArrowRight'?selectedIndex+1:null;
          if(index===null)return;
          event.preventDefault(); setSelection(series[Math.max(0,Math.min(series.length-1,index))]!.date);
        }}
        onPointerMove={event=>{
          if(event.pointerType==='touch' && event.buttons===0)return;
          const rect=event.currentTarget.getBoundingClientRect();
          const x=(event.clientX-rect.left)*width/rect.width;
          const index=Math.round((x-b.left)/(b.right-b.left)*(series.length-1));
          setSelection(series[Math.max(0,Math.min(series.length-1,index))]!.date);
        }}
        onPointerDown={event=>{
          const rect=event.currentTarget.getBoundingClientRect();
          const index=Math.round(((event.clientX-rect.left)*width/rect.width-b.left)/(b.right-b.left)*(series.length-1));
          setSelection(series[Math.max(0,Math.min(series.length-1,index))]!.date);
        }}
        className="fr-chart"
        width={width}
        height={CUMULATIVE_HEIGHT}
        viewBox={`0 0 ${width} ${CUMULATIVE_HEIGHT}`}
        role="slider"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={series.length - 1}
        aria-valuenow={selectedIndex}
        aria-valuetext={`${longDate(selected.date)}、累計 ${fmt.total(selected.cumulative)}`}
        aria-label={`累積実績の日付。今日 ${fmt.total(done)}。目標は${fmt.total(total)}`}
      >
        <text x="50" y="16" textAnchor="end" className="fr-chart__text">
          {axis.unit}
        </text>
        {c.targetY !== null ? (
          <>
            <line x1={b.left} y1={c.targetY} x2={b.right} y2={c.targetY} className="fr-chart__target" />
            <text x={b.right} y={c.targetY - 8} textAnchor="end" className="fr-chart__text">
              目標 {fmt.total(total)}
            </text>
          </>
        ) : null}
        {c.gridLines.map((g) => (
          <g key={g.value}>
            <line x1={b.left} y1={g.y} x2={b.right} y2={g.y} className="fr-chart__grid" />
            <text x="50" y={g.y + 4} textAnchor="end" className="fr-chart__text">
              {axis.label(g.value)}
            </text>
          </g>
        ))}
        <line x1={b.left} y1={c.zeroY} x2={b.right} y2={c.zeroY} className="fr-chart__axis" />
        <text x="50" y={c.zeroY + 4} textAnchor="end" className="fr-chart__text">
          0
        </text>
        {!c.singleDay ? (
          <>
            <polygon points={area} className="fr-chart__area" />
            <polyline points={line} className="fr-chart__line" />
          </>
        ) : null}
        {c.points[selectedIndex] ? <g aria-hidden="true"><line x1={c.points[selectedIndex]!.x} x2={c.points[selectedIndex]!.x} y1={b.top} y2={b.bottom} className="fr-chart__target"/><circle cx={c.points[selectedIndex]!.x} cy={c.points[selectedIndex]!.y} r="6" className="fr-chart__now"/></g> : null}
        {lastPoint ? <circle cx={lastPoint.x} cy={lastPoint.y} r="5" className="fr-chart__now" /> : null}
        {!c.singleDay ? (
          <>
            <text x={b.left} y="218" textAnchor="start" className="fr-chart__text">
              {c.startLabel}
            </text>
          </>
        ) : null}
        {!c.singleDay ? (
          <text x={b.left} y="234" textAnchor="start" className="fr-chart__text">
            {start===recordStartDate?'記録開始':'表示開始'}
          </text>
        ) : null}
        <text x={b.right} y="218" textAnchor="end" className="fr-chart__text">
          {c.todayLabel}
        </text>
        <text x={b.right} y="234" textAnchor="end" className="fr-chart__text">
          {c.singleDay ? '記録開始・今日' : '今日'}
        </text>
      </svg>
      <div className="fr-chart-selection" aria-live="polite" aria-atomic="true">
        <strong>{longDate(selected.date)}</strong>
        <span>{selected.status==='DONE'?'やった '+fmt.record(selected.amount!):selected.status==='SKIPPED'?'休んだ':'未記録（休みとは別）'}</span>
        <span>累計 {fmt.total(selected.cumulative)} / 目標 {fmt.total(total)}</span>
        {goalId ? <Link to="/goals/$goalId/history" params={{goalId}} search={{date:selected.date}} className="fr-btn fr-btn--text">この日の記録を見る・編集する</Link> : null}
      </div>
      <p className="fr-note">左右キーで1日ずつ、Home / Endで最初・最後へ移動できます。未記録の日の実施量は不明です。</p>
    </div>
  );
}
