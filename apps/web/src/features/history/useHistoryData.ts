import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { GoalR11, Log } from '@contracts';
import { goalKeys, goalsHttp } from '../../api/goals-http.ts';
import { todayKeys, todayHttp } from '../../api/today-http.ts';
import { shouldRefetchForNewDay } from '../today/day-rollover.ts';
import { fetchPolicy } from '../today/fetch-policy.ts';

/** History remains available even when forecasting fails. Compare actual record content,
 * not only totals, before accepting independent Goal/log reads. */
export function useHistoryData(goalId: string, notBefore: number) {
  const goalQuery = useQuery({ queryKey: goalKeys.detail(goalId), queryFn: ({signal}) => goalsHttp.getGoal(goalId,signal), ...fetchPolicy });
  const logsQuery = useQuery({ queryKey: todayKeys.logs(goalId), queryFn: ({signal}) => todayHttp.listLogs(goalId,signal), ...fetchPolicy });
  const accepted = useRef<{goal: GoalR11; logs: Log[]} | undefined>(undefined);
  const [attempts, setAttempts] = useState(0);
  const {data:goal} = goalQuery;
  const {data:logs} = logsQuery;
  const fresh = goalQuery.dataUpdatedAt > notBefore && logsQuery.dataUpdatedAt > notBefore;
  const consistent = goal && logs && fresh
    ? goal.historyFingerprint === undefined || goal.historyFingerprint === JSON.stringify([...logs].sort((a,b)=>a.localDate.localeCompare(b.localDate)).map(log=>[log.localDate,log.status,log.amount]))
    : null;
  if (consistent && goal && logs) accepted.current = {goal,logs};
  const fetching = goalQuery.isFetching || logsQuery.isFetching;
  const refresh = () => { void Promise.all([goalQuery.refetch(),logsQuery.refetch()]); };
  useEffect(()=>{
    if (consistent === true && attempts !== 0) setAttempts(0);
    if (consistent === false && !fetching && attempts < 3) {
      setAttempts(n=>n+1);
      refresh();
    }
  },[consistent,fetching,attempts]);
  const fetchingRef = useRef(fetching);
  fetchingRef.current = fetching;
  const shown = accepted.current;
  useEffect(()=>{
    if (!shown) return;
    const timer = setInterval(()=>{
      if (!fetchingRef.current && shouldRefetchForNewDay(shown.goal.timezone,shown.goal.today,new Date())) refresh();
    },30_000);
    return ()=>clearInterval(timer);
  },[shown?.goal.timezone,shown?.goal.today]);
  return {goalQuery,logsQuery,snapshot:accepted.current,refresh,resyncFailed:consistent===false && !fetching && attempts>=3};
}
