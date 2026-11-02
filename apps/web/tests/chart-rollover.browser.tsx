import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ProgressDetails } from '../src/features/today/ProgressSummary.tsx';
import { amountFormat } from '../src/copy/amount.ts';
import baseStyles from '../src/styles.css?inline';
import chartStyles from '../src/features/today/today.css?inline';
import dawnStyles from '../src/features/today/today-dawn.css?inline';

// Real component/ResizeObserver/CSS. Advance only props; do not remount the chart at rollover.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const style = document.createElement('style');
style.textContent = baseStyles + '\n' + chartStyles + '\n' + dawnStyles;
document.head.append(style);
const host = document.getElementById('app')!;
host.style.width = '320px';
const root = createRoot(host);
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const settle = async () => { for (let i=0;i<10;i++) await act(tick); };
const ensure = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const render = async (today: string) => {
  await act(async () => { root.render(<div className="fr fr-page--today"><ProgressDetails
    progress={{ done: 50, total: 1000, unit: 'minutes' }} initialProgress={50} logs={[]} recordStartDate="2026-11-02" today={today}
    fmt={amountFormat({unit:'minutes'})} /></div>); await tick(); });
  await settle();
};
const measured = (stage: string) => {
  const svg = host.querySelector<SVGSVGElement>('.fr-chart')!;
  const container = host.querySelector<HTMLElement>('.fr-chart-box')!;
  ensure(svg && container, 'actual chart missing');
  const expected = Math.round(container.getBoundingClientRect().width);
  ensure(Number(svg.getAttribute('width')) === expected, 'chart width mismatch: ' + JSON.stringify({stage,svg:svg.getAttribute('width'),expected}));
  ensure(svg.getBoundingClientRect().width <= container.getBoundingClientRect().width + 1, 'chart overflows its measured container');
  return expected;
};
async function run() {
  await render('2026-11-01');
  ensure(host.textContent?.includes('表示できる記録日はまだありません') && !host.querySelector('svg.fr-chart'), 'before-start view is not empty');
  ensure(host.querySelector('.fr-chart-box'), 'empty state must keep the measured node mounted');
  await render('2026-11-02');
  const initial = measured('first visible day');
  await act(async()=>{
    // Wait for the browser's resize delivery, not just virtual timers in --dump-dom.
    await new Promise<void>(resolve=>{
      const probe=new ResizeObserver(()=>{probe.disconnect();resolve();});
      probe.observe(host.querySelector('.fr-chart-box')!);
      host.style.width='252px';
    });
  }); await settle();
  const narrow = measured('resized'); ensure(narrow < initial, 'ResizeObserver did not follow the narrower container');
  await render('2026-11-01'); await render('2026-11-02'); measured('visible again');
  await act(async()=>root.unmount());
  return {results:['empty-to-first-day chart keeps measured width without remount','resize and another empty-to-visible transition retain the observer'],initial,narrow};
}
run().then(result=>{document.getElementById('result')!.textContent=JSON.stringify({ok:true,...result});}).catch(error=>{
  document.getElementById('result')!.textContent=JSON.stringify({ok:false,error:error.stack ?? String(error)});
});
