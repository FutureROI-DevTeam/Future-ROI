import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GoalR11, Log, HistoryEdit as Edit } from '@contracts';
import { HistoryEditResult } from '@contracts';
import { requestJson } from '../../api/http.ts';
import { ApiError } from '../../api/client.ts';
import { getDraftGeneration, isDraftOwner } from '../../api/session-draft.ts';
import { getPrivateEpoch, privateDataReady } from '../../api/session-cache.ts';
import { goalKeys } from '../../api/goals-http.ts';
import { isRecordAmount } from '../../copy/amount.ts';
import { amountFormat } from '../../copy/amount.ts';
import { longDate } from '../../copy/date.ts';
import { createSavePeerGuard } from '../logs/save-feedback.ts';
import { Button } from '../../ui/components/Button.tsx';

export type HistoryDraft = { goal: GoalR11; date: string; status: Edit['status']; amount: string; error: string | null; conflict: boolean; pending: boolean };
export function HistoryEditor({goal,date,log,onClose,onSaved,initial,onDraftChange}:{goal:GoalR11;date:string;log:Log|undefined;onClose:()=>void;onSaved:()=>void;initial?:HistoryDraft|undefined;onDraftChange?:(draft:HistoryDraft)=>void}){
  const [base]=useState(()=>({goal:initial?.goal ?? goal,date:initial?.date ?? date,owner:getPrivateEpoch().owner,generation:getDraftGeneration()}));
  const [status,setStatus]=useState<Edit['status']>(initial?.status ?? log?.status ?? 'DONE');
  const [amount,setAmount]=useState(initial?.amount ?? String(log?.status==='DONE'?log.amount:goal.sessionAmount));
  const [busy,setBusy]=useState(false), [error,setError]=useState<string|null>(initial?.pending?'保存状態を確認してから編集し直してください。':initial?.error ?? null), [conflict,setConflict]=useState(!!initial?.pending || !!initial?.conflict);
  const inFlight=useRef(false), alive=useRef(true), heading=useRef<HTMLHeadingElement>(null);
  const client=useQueryClient();
  useEffect(()=>{alive.current=true;heading.current?.focus();return()=>{alive.current=false}},[]);
  useEffect(()=>{onDraftChange?.({goal:base.goal,date:base.date,status,amount,error,conflict,pending:busy});},[base.goal,base.date,status,amount,error,conflict,busy,onDraftChange]);
  const submit=async()=>{
    if(inFlight.current || conflict || !privateDataReady(getPrivateEpoch()) || (typeof base.owner!=='string' || !isDraftOwner(base.owner,base.generation)))return;
    if(status==='DONE' && (!/^\d+$/.test(amount) || !isRecordAmount(Number(amount)))){setError('実施量は1以上の整数で入力してください。0は休み・削除へ変換されません。');return;}
    if(base.goal.historyRevision===undefined){setError('記録の版を確認できません。履歴を読み込み直してください。');return;}
    inFlight.current=true;setBusy(true);setError(null);
    const guard=createSavePeerGuard(base.goal.id,()=>{});guard.start();
    try{
      await requestJson(HistoryEditResult,'/api/goals/'+encodeURIComponent(base.goal.id)+'/logs/'+base.date,{method:'PATCH',body:{status,expectedGoalSettingsRevision:base.goal.goalSettingsRevision,expectedHistoryRevision:base.goal.historyRevision,...(status==='DONE'?{amount:Number(amount)}:{})}});
      // A confirmed write must refresh the same owner's cache even after leaving this editor.
      if(typeof base.owner!=='string' || !isDraftOwner(base.owner,base.generation))return;
      await client.cancelQueries({queryKey:goalKeys.all});
      if(!isDraftOwner(base.owner,base.generation))return;
      await client.invalidateQueries({queryKey:goalKeys.all});
      if(alive.current && typeof base.owner==='string' && isDraftOwner(base.owner,base.generation))onSaved();
    }catch(e){
      if(!alive.current || typeof base.owner!=='string' || !isDraftOwner(base.owner,base.generation))return;
      const changed=e instanceof ApiError && e.status===409;
      setError(changed?'別の画面で記録または設定が変わりました。最新の内容を読み込み、確認してから編集し直してください。':'保存を確認できませんでした。入力は保持しています。読み込み直して保存状態を確認してください。');
      // An ambiguous failure must never replay an old epoch automatically.
      setConflict(true);
    }finally{guard.end();guard.close();inFlight.current=false;if(alive.current)setBusy(false)}
  };
  return <section className="fr-history-editor" aria-labelledby="fr-history-edit-title">
    <h2 id="fr-history-edit-title" tabIndex={-1} ref={heading}>{longDate(date)}の記録を編集</h2>
    <p className="fr-note">日付はGoalのタイムゾーン（{base.goal.timezone}）です。保存後に累計と予測を更新します。</p>
    <fieldset disabled={busy || conflict}><legend>記録状態</legend>
      {(['DONE','SKIPPED','UNRECORDED'] as const).map(value=><label key={value}><input type="radio" name="history-status" value={value} checked={status===value} onChange={()=>setStatus(value)}/>{value==='DONE'?'やった':value==='SKIPPED'?'休んだ':'削除して未記録に戻す'}</label>)}
    </fieldset>
    {status==='DONE'?<label className="fr-history-editor__amount">実施量（{amountFormat(base.goal).recordUnit}）<input inputMode="numeric" value={amount} disabled={busy || conflict} onChange={e=>setAmount(e.target.value)} aria-describedby="fr-history-amount-help"/><span id="fr-history-amount-help" className="fr-note">保存済みの実量を訂正します。1以上の整数。</span></label>:null}
    {status==='UNRECORDED'?<p className="fr-note">記録を削除します。休んだ記録は残りません。予測上も不明な日へ戻ります。</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <div className="fr-history-editor__actions"><Button variant={status==='UNRECORDED'?'danger':'primary'} disabled={busy || conflict} onClick={()=>void submit()}>{busy?'保存中…':status==='UNRECORDED'?'削除して未記録に戻す':'記録を保存'}</Button><Button variant="text" disabled={busy} onClick={onClose}>{conflict?'最新の履歴を読み込む':'変更をやめる'}</Button></div>
  </section>;
}
