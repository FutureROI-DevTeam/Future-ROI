import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GoalFootprint } from '../src/features/goals/GoalFootprint.tsx';
import type { FootprintSource } from '../src/features/goals/footprint.ts';
import baseStyles from '../src/styles.css?inline';
import goalStyles from '../src/features/goals/goals.css?inline';

// Actual calendar and CSS; no session, HTTP, storage or database writes.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The hook-test runner emits only JS. Explicitly include the production CSS for layout assertions.
const style = document.createElement('style');
style.textContent = baseStyles + '\n' + goalStyles;
document.head.append(style);
const host = document.getElementById('app')!;
const root = createRoot(host);
let visit = 0;
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const settle = async () => { for (let i = 0; i < 5; i++) await act(tick); };
const ensure = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const source = (recordStartDate: string, today: string): FootprintSource => ({
  goal: { id: 'calendar', title: 'Calendar fixture', unit: 'minutes', timezone: 'UTC', recordStartDate, today,
    todayStatus: 'UNRECORDED', initialProgress: 0, progressDone: 0 }, logs: [],
});
const render = async (sources: FootprintSource[]) => {
  await act(async () => { root.render(<div className="fr"><GoalFootprint key={++visit} sources={sources} onRefresh={() => { throw Error('unexpected refresh'); }} /></div>); await tick(); });
  await settle();
};
const day = (date: string) => host.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
const previous = () => host.querySelector<HTMLButtonElement>('[aria-label="足跡の前の月"]')!;
const click = async (target: HTMLButtonElement) => { await act(async () => { ensure(target && !target.disabled, 'target unavailable'); target.click(); await tick(); }); await settle(); };
const key = async (value: string) => {
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); await tick(); });
  await settle();
};
const focused = () => (document.activeElement as HTMLElement).dataset.date;
const month = (first: string, count: number, leading: number) => {
  const cells = [...host.querySelector('.fr-footprint__days')!.children];
  ensure(host.querySelectorAll('.fr-footprint__day').length === count, 'wrong month length: ' + first);
  ensure(cells.indexOf(day(first)) === leading, 'first day not aligned to Monday-first weekday: ' + first);
  ensure(cells.slice(0, leading).every(cell => cell.getAttribute('aria-hidden') === 'true' && !cell.querySelector('button')), 'leading blanks are interactive');
  ensure(getComputedStyle(host.querySelector('.fr-footprint__days')!).gridTemplateColumns.split(' ').length === 7, 'calendar has more than seven columns');
  ensure(host.querySelector('.fr-footprint__weekdays')?.textContent === '月火水木金土日', 'weekday order differs from date columns');
  ensure(host.querySelectorAll('.fr-footprint__day[tabindex="0"]').length === 1, 'calendar must have one tab stop');
};
async function run() {
  const results: string[] = [];
  await render([source('2024-02-01', '2024-04-30')]);
  month('2024-04-01', 30, 0);
  ensure(day('2024-04-30').getAttribute('aria-current') === 'date', 'today missing');
  await click(previous()); month('2024-03-01', 31, 4);
  results.push('30/31 day months, Monday/Friday starts, today and one tab stop');

  await click(day('2024-03-31')); day('2024-03-31').focus();
  await key('ArrowRight'); ensure(focused() === '2024-04-01', 'right arrow did not cross month');
  await key('ArrowUp'); ensure(focused() === '2024-03-25', 'up arrow did not cross month by seven days');
  await key('ArrowDown'); ensure(focused() === '2024-04-01', 'down arrow did not return by seven days');
  await key('ArrowLeft'); ensure(focused() === '2024-03-31', 'left arrow did not cross month');
  await key('Home'); ensure(focused() === '2024-03-01', 'Home did not choose first day');
  await key('End'); ensure(focused() === '2024-03-31', 'End did not choose last day');
  results.push('native focus follows left/right, week up/down, Home/End and month boundaries');

  await click(previous()); month('2024-02-01', 29, 3);
  ensure(previous().disabled && !day('2024-02-30'), 'first month or leap day is wrong');
  await click(day('2024-02-01')); day('2024-02-01').focus();
  await key('ArrowLeft'); await key('ArrowUp'); ensure(focused() === '2024-02-01', 'keyboard escaped first allowed month');
  await key('End'); await key('ArrowUp'); ensure(focused() === '2024-02-22', 'leap-month up arrow is not one week');
  await key('ArrowDown'); ensure(focused() === '2024-02-29', 'leap-month down arrow is not one week');
  await key('ArrowRight'); ensure(focused() === '2024-03-01', 'leap-month boundary is wrong');
  results.push('leap February and first-month boundary');

  await render([source('2026-11-02', '2026-11-02')]);
  month('2026-11-01', 30, 6);
  ensure(day('2026-11-01').classList.contains('fr-footprint__day--before-start'), 'before-start became unrecorded');
  ensure(day('2026-11-03').classList.contains('fr-footprint__day--future'), 'future became unrecorded');
  await click(day('2026-11-03'));
  ensure(host.querySelector('.fr-footprint__selection')?.textContent?.includes('未来の日付'), 'future selection is mislabeled');
  day('2026-11-03').focus(); await key('End');
  ensure(focused() === '2026-11-30', 'End did not choose last month day');
  await key('ArrowRight'); ensure(focused() === '2026-11-30', 'keyboard escaped last allowed month');
  results.push('Sunday start, before-start/future distinction and last-month boundary');

  await render([source('2024-01-01', '2024-05-31')]);
  await click(previous()); await click(day('2024-04-01')); day('2024-04-01').focus();
  await key('Home'); await key('Home'); // No date change must not leave a deferred focus request.
  previous().focus(); await click(previous());
  ensure(document.activeElement === previous(), 'a no-op Home stole focus from month navigation');
  month('2024-03-01', 31, 4);
  results.push('no-op Home leaves no pending focus when the month button is used');
  await act(async () => root.unmount());
  return { results };
}
run().then(result => { document.getElementById('result')!.textContent = JSON.stringify({ ok: true, ...result }); }).catch(error => {
  document.getElementById('result')!.textContent = JSON.stringify({ ok: false, error: error.stack ?? String(error) });
});
