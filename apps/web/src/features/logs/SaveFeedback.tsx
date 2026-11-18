import { amountFormat, recordDisplay } from '../../copy/amount.ts';
import type { SaveFeedback as Feedback } from './save-feedback.ts';
export function SaveDelta({value,field}:{value:Feedback|null;field:'amount'|'points'}) {
  if(!value)return null;
  const sign=value.amount<0?'−':'+';
  return <span aria-hidden="true" title="今回の保存による増減" className={value.amount>0?'fr-save-delta fr-save-feedback__increase':'fr-save-delta'}>{sign}{field==='amount'?recordDisplay(amountFormat(value),Math.abs(value.amount)):Math.abs(value.points).toLocaleString('ja-JP',Math.abs(value.points)>=1000?{maximumFractionDigits:0}:{maximumSignificantDigits:3})+'pt'}</span>;
}
/** One announcement for the confirmed save transaction. */
export function SaveFeedback({value}:{value:Feedback|null}) {
  const sign=value && value.amount<0?'−':'+';
  return <div className="fr-save-feedback fr-sr-only" role="status" aria-live="polite" aria-atomic="true">{value?<p key={value.sequence}>今回の保存による増減：{sign}{recordDisplay(amountFormat(value),Math.abs(value.amount))}、目標進捗 {sign}{Math.abs(value.points).toLocaleString('ja-JP',Math.abs(value.points)>=1000?{maximumFractionDigits:0}:{maximumSignificantDigits:3})}パーセントポイント</p>:null}</div>;
}
