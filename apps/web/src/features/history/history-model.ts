import type { Log } from '@contracts';
import { addDays } from '../../copy/date.ts';
export const editableDate = (date: string, start: string, today: string) => date >= start && date <= today;
/** Recorded facts only; missing dates carry the known total without inventing an amount. */
export function cumulativeSeries(logs: readonly Log[], initial: number, recordStart: string, today: string, start = recordStart) {
  const records = new Map(logs.map(log=>[log.localDate,log]));
  let cumulative=initial;
  const result: {date:string;status:'DONE'|'SKIPPED'|'UNRECORDED';amount:number|null;cumulative:number}[]=[];
  for(let date=recordStart;date<=today;date=addDays(date,1).toISOString().slice(0,10)){
    const log=records.get(date);
    if(log?.status==='DONE') cumulative+=log.amount ?? 0;
    if(date>=start)result.push({date,status:log?.status ?? 'UNRECORDED',amount:log?.amount ?? null,cumulative});
  }
  return result;
}
