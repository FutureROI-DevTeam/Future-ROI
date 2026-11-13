import { amountFormat } from '../../copy/amount.ts';
import { progressPercentLabel, progressPercentQualifier } from '../../copy/progress.ts';
import type { DraftProgress } from '../logs/draft-preview.ts';

/** 右の実績に添える条件付き試算。mobileの入力付近の写しは通知を重ねない。 */
export function DraftProgressPreview({ value, compact = false }: { value: DraftProgress | null; compact?: boolean }) {
  if (!value) return null;
  const fmt = amountFormat(value);
  const sign = value.amount < 0 ? '−' : '+';
  return (
    <div
      className={compact ? 'fr-draft-preview fr-draft-preview--compact' : 'fr-draft-preview'}
      role={compact ? undefined : 'status'}
      aria-live={compact ? undefined : 'polite'}
      aria-atomic={compact ? undefined : true}
    >
      <p className="fr-draft-preview__label">この量で「やった」を保存すると <span>未保存</span></p>
      <p>累計 {fmt.total(value.done)} · {progressPercentLabel(value.done, value.total)}%{progressPercentQualifier(value.done, value.total)}</p>
      <p className="fr-draft-preview__delta">
        {value.amount === 0 ? '量・進捗は変わりません' : (
          <>
            {sign}{fmt.record(Math.abs(value.amount))} / {sign}{Math.abs(value.points).toLocaleString('ja-JP', Math.abs(value.points) >= 1000 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 3 })}パーセントポイント
          </>
        )}
      </p>
      {value.done > value.total ? <p>目標を{fmt.total(value.done - value.total)}上回る試算です</p> : null}
    </div>
  );
}
