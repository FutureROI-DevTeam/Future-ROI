import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { addDays, longDate } from '../../copy/date.ts';
import { monthCells, shiftMonth } from '../history/calendar.ts';
import { todayCopy } from '../../copy/today.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Icon } from '../../ui/components/Icon.tsx';
import { buildFootprint, type FootprintSource } from './footprint.ts';

/** 日の種類 → 読み上げ・選択日の表示に使う文言。 */
const DAY_KIND_LABELS = { done: '実施', rest: '休みの記録あり', unrecorded: '実施の記録なし', unconfirmed: '未確認', 'before-start': '記録開始前', future: '未来の日付' } as const;
/** monthCellsと同じ月曜始まり。上下キーは同じ曜日の前後の週へ移る。 */
const WEEKDAYS_FROM_MONDAY = ['月', '火', '水', '木', '金', '土', '日'];
const ARROW_KEY_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** 一覧上部に一つだけ置く全Goal共通の足跡。取得・保存はPageが担う。 */
export function GoalFootprint({ sources, onRefresh }: { sources: readonly FootprintSource[]; onRefresh: () => void }) {
  const [month, setMonth] = useState<string | null>(null);
  const current = buildFootprint(sources);
  const last = current.today?.slice(0,7) ?? '';
  const first = sources.map(source=>source.goal.recordStartDate.slice(0,7)).sort()[0] ?? last;
  const shown = month === null ? last : month < first ? first : month > last ? last : month;
  const cells = shown ? monthCells(shown) : [];
  const dates = cells.filter((date):date is string=>date!==null);
  const footprint = buildFootprint(sources, dates.length, dates.at(-1));
  const daysByDate = new Map(footprint.days.map(day => [day.date, day]));
  const [selected, setSelected] = useState<string | null>(null);
  const date = footprint.days.some(day => day.date === selected) ? selected : footprint.days.filter(day=>day.date<=(footprint.today ?? '')).at(-1)?.date ?? footprint.days[0]?.date;
  const active = footprint.days.find(day => day.date === date);
  const keyboardFocus = useRef(false);
  const selectedButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (keyboardFocus.current) {
      keyboardFocus.current = false;
      selectedButton.current?.focus();
    }
  }, [date]);
  if (!footprint.today) return null;
  return <section className="fr-footprint" aria-labelledby="fr-footprint-title">
    <header className="fr-footprint__head">
      <h2 id="fr-footprint-title">取り組みの足跡</h2>
      <span className="fr-footprint__streak">{footprint.streak === null ? '連続実施は確認中' : `連続実施 ${footprint.streak}日`}</span>
    </header>
    <div className="fr-footprint__months" role="group" aria-label="足跡の表示月">
      <button type="button" className="fr-icon-btn" aria-label="足跡の前の月" disabled={shown<=first} onClick={()=>setMonth(shiftMonth(shown,-1))}><Icon name="back" /></button>
      <span className="fr-footprint__month" aria-live="polite">{todayCopy.monthLabel(shown)}</span>
      <button type="button" className="fr-icon-btn" aria-label="足跡の次の月" disabled={shown>=last} onClick={()=>setMonth(shiftMonth(shown,1))}><Icon name="chevronRight" /></button>
      <div className="fr-footprint__current-month"><Button variant="text" disabled={shown===last} onClick={()=>setMonth(last)}>今月へ戻る</Button></div>
    </div>
    <div className="fr-footprint__calendar">
      <div className="fr-footprint__weekdays" aria-hidden="true">{WEEKDAYS_FROM_MONDAY.map(day => <span key={day}>{day}</span>)}</div>
      <div className="fr-footprint__days" role="group" aria-label={`${todayCopy.monthLabel(shown)}の日付。選ぶと取り組んだGoalが表示されます`}>
        {cells.map((cell, index) => {
          const day = cell ? daysByDate.get(cell) : undefined;
          if (!day) return <span key={`blank-${index}`} aria-hidden="true" />;
          return <button key={day.date} type="button" data-date={day.date}
          ref={day.date === date ? selectedButton : undefined} className={`fr-footprint__day fr-footprint__day--${day.kind}`}
          aria-label={`${longDate(day.date)} ${DAY_KIND_LABELS[day.kind]}${day.goals.length ? ` ${day.goals.length}Goal` : ''}${!day.complete ? ' 一部未確認' : ''}`}
          aria-pressed={day.date === date} aria-current={day.date === footprint.today ? 'date' : undefined} tabIndex={day.date === date ? 0 : -1}
          onClick={() => setSelected(day.date)} onKeyDown={event => {
            const move = ARROW_KEY_STEPS[event.key];
            const targetDate = event.key === 'Home' ? footprint.days[0]?.date
              : event.key === 'End' ? footprint.days.at(-1)?.date
              : move !== undefined ? addDays(day.date, move).toISOString().slice(0,10) : undefined;
            if (!targetDate) return;
            event.preventDefault();
            const targetMonth = targetDate.slice(0,7);
            if (targetMonth < first || targetMonth > last) return;
            if (targetDate === date) { keyboardFocus.current = false; return; }
            keyboardFocus.current = true;
            if (targetMonth !== shown) setMonth(targetMonth);
            setSelected(targetDate);
          }}>
          <span className="fr-footprint__mark" aria-hidden="true">{day.kind === 'done' ? '✓' : day.kind === 'rest' ? '休' : day.kind === 'unconfirmed' ? '?' : ''}</span>
          <span className="fr-footprint__date">{Number(day.date.slice(8))}</span>
        </button>})}
      </div>
    </div>
    <div className="fr-footprint__selection" aria-live="polite" aria-atomic="true">
      <span>{date ? longDate(date) : ''}：</span>
      {active?.goals.length ? active.goals.map(goal => <Link key={goal.id} to="/goals/$goalId" params={{ goalId: goal.id }}>{goal.title}</Link>) :
        <span>{active ? DAY_KIND_LABELS[active.kind] : '確認中'}</span>}
      {active && !active.complete && active.goals.length > 0 ? <span>ほかのGoalは未確認</span> : null}
    </div>
    <p className="fr-footprint__note">✓ 実施 · 休 休みの記録 · ? 未確認。各Goalの記録日で集計し、量は合算しません。削除したGoalは含みません。</p>
    {!footprint.sameToday ? <p className="fr-footprint__note">Goalによって今日の日付が異なるため、連続日数は保留しています。</p> : null}
    {!footprint.complete ? <Button variant="text" onClick={onRefresh}>足跡を再読み込み</Button> : null}
  </section>;
}
