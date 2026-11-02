import { Link } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { browserTimezone } from '../../../calendar.ts';
import { goalsCopy } from '../../../copy/goals.ts';
import { longDate } from '../../../copy/date.ts';
import { Button } from '../../../ui/components/Button.tsx';
import { Field, fieldAria, NumberInput, SelectInput, TextInput } from '../../../ui/components/FormField.tsx';
import { Icon } from '../../../ui/components/Icon.tsx';
import { TimeAmountField, timeParts } from './TimeAmountField.tsx';
import { parseGoalAmount } from '../goal-form.ts';
import { QuestionPriorFields } from '../../prior/QuestionPriorFields.tsx';
import {
  NO_ANSWERS,
  TITLE_MAX,
  titleLength,
  type FieldErrors,
  type FieldName,
  type FormValues,
  type GoalWithAnswers,
  type PriorChosen,
  type answersLockReason,
} from '../goal-form.ts';

const f = goalsCopy.form;

type Props = {
  values: FormValues;
  errors: FieldErrors;
  count: number;
  unit: string;
  timezones: string[];
  discardedDraft: boolean;
  pendingCreate: boolean;
  refreshNotice: ReactNode;
  inputDisabled: boolean;
  locked: boolean;
  priorOpen: boolean;
  latestAnswers: GoalWithAnswers['questionPrior'] | null;
  answersLock: ReturnType<typeof answersLockReason>;
  priorChosen: PriorChosen;
  onPriorChoose: (origin: keyof PriorChosen) => void;
  update: <K extends FieldName>(name: K, value: FormValues[K]) => void;
  onPriorToggle: (open: boolean) => void;
  onDeleteOpen: () => void;
} & ({ mode: 'create'; goal?: undefined } | { mode: 'edit'; goal: GoalWithAnswers });

/** controlledな項目表示。入力・baseline・保存操作のstateは親フォームだけが持つ。 */
export function GoalFormFields({
  mode,
  goal,
  values,
  errors,
  count,
  unit,
  timezones,
  discardedDraft,
  pendingCreate,
  refreshNotice,
  inputDisabled,
  locked,
  priorOpen,
  latestAnswers,
  answersLock,
  priorChosen,
  onPriorChoose,
  update,
  onPriorToggle,
  onDeleteOpen,
}: Props) {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'fr-goalform-prior') {
      onPriorToggle(true);
      document.getElementById('fr-goalform-prior-summary')?.focus();
    } else if (hash === 'goal-sessionAmount') {
      document.getElementById(hash)?.focus();
    }
  }, [onPriorToggle]);
  // 整数分へ変換できない途中入力を、単位切替で失わない。
  const incompleteTime = values.unit === 'minutes'
    && [values.totalRequired, values.initialProgress].some(raw =>
      raw.startsWith('@hm:') && !Number.isFinite(parseGoalAmount(raw) ?? NaN));
  // 記録が付いた後は単位を変えられない（過去の量の意味を保つため）。編集でだけ起きる
  const unitLocked = mode === 'edit' && goal.unitLocked;
  const bothChosen = priorChosen.a && priorChosen.b;
  const initialProgressHelp = (
    <>
      <p>{goal ? f.initialProgressHelp(longDate(goal.recordStartDate)) : f.initialProgressHelpNew}</p>
      {mode === 'edit' ? <p>{f.initialProgressCorrectionHelp}</p> : null}
    </>
  );
  // 未選択のエラーは、まだ選んでいない問の下に出す。APIの検査エラーは従来どおり1問目の下に出す
  const priorErrors = !errors.questionPrior ? {}
    : errors.questionPrior === f.answersRequired
    ? { ...(priorChosen.a ? {} : { a: errors.questionPrior }), ...(priorChosen.b ? {} : { b: errors.questionPrior }) }
    : { a: errors.questionPrior };
  const switchUnit = (next: FormValues['unit']) => {
    for (const field of ['totalRequired', 'initialProgress'] as const) {
      if (values[field].startsWith('@hm:')) {
        update(field, String(parseGoalAmount(values[field])));
      }
    }
    update('unit', next);
  };
  return (
    <div className="fr-goalform__fields">
      {discardedDraft ? <p role="status">別の更新があったため最新のGoalを表示しています。未保存の入力は復元していません。</p> : null}
      {pendingCreate ? <p role="status">{f.createRecovery.pending}</p> : null}
      {refreshNotice}
      {count > 0 ? (
        <div className="fr-goalform__summary" role="alert">
          <Icon name="alert" size={20} />
          {f.summary(count)}
        </div>
      ) : null}

      <section className="fr-goalform__group fr-goalform__group--basic" aria-labelledby="fr-goalform-basic-title">
        <header className="fr-goalform__group-head">
          <span className="fr-goalform__group-index" aria-hidden="true">01</span>
          <h2 id="fr-goalform-basic-title">{goalsCopy.formGroups.basic}</h2>
        </header>
        <div className="fr-goalform__group-fields">
          <Field id="goal-title" label={f.title} counter={`${titleLength(values.title)} / ${TITLE_MAX}`} error={errors.title}>
            <TextInput
              id="goal-title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              disabled={inputDisabled}
              invalid={Boolean(errors.title)}
              autoComplete="off"
              {...fieldAria('goal-title', { error: errors.title })}
            />
          </Field>

          <Field id="goal-unit" label={f.unit} group error={errors.unit} help={unitLocked ? (
            <>
              <LockedNote>{goalsCopy.errors.unitLocked}</LockedNote>
              {values.unit !== goal.unit ? <Button variant="secondary" disabled={inputDisabled} onClick={() => update('unit', goal.unit)}>{f.restoreSavedUnit}</Button> : null}
              <Link to="/goals/new" className="fr-goalform__new-goal">{f.createNewGoal}</Link>
            </>
          ) : undefined}>
            <fieldset
              id="goal-unit"
              className="fr-unit-radio"
              aria-labelledby="goal-unit-label"
              {...fieldAria('goal-unit', { help: unitLocked, error: errors.unit })}
              disabled={inputDisabled || incompleteTime || unitLocked}
              tabIndex={-1}
            >
              <label><input type="radio" name="goal-unit" value="minutes" checked={values.unit === 'minutes'} onChange={() => switchUnit('minutes')} />時間</label>
              <label><input type="radio" name="goal-unit" value="sessions" checked={values.unit === 'sessions'} onChange={() => switchUnit('sessions')} />回数</label>
            </fieldset>
            {incompleteTime ? <p className="fr-goals__help">時間と分の入力を直すと単位を切り替えられます。</p> : null}
          </Field>
        </div>
      </section>

      <section className="fr-goalform__group fr-goalform__group--record" aria-labelledby="fr-goalform-record-title">
        <header className="fr-goalform__group-head">
          <span className="fr-goalform__group-index" aria-hidden="true">02</span>
          <h2 id="fr-goalform-record-title">{goalsCopy.formGroups.record}</h2>
        </header>
        <div className="fr-goalform__group-fields">
          {/* デスクトップ幅では2列に並べる（デザイン Desk-create）。スマートフォン幅では1列のまま */}
          <div className="fr-goalform__pair">
            {values.unit === 'minutes' ? (
              <TimeAmountField
                id="goal-totalRequired"
                label={f.totalRequired}
                value={values.totalRequired}
                error={errors.totalRequired}
                disabled={inputDisabled}
                onChange={v => update('totalRequired', v)}
              />
            ) : (
              <AmountField
                id="goal-totalRequired"
                label={f.totalRequired}
                unit={unit}
                value={values.totalRequired}
                error={errors.totalRequired}
                disabled={inputDisabled}
                onChange={(v) => update('totalRequired', v)}
              />
            )}
            <AmountField
              id="goal-sessionAmount"
              label={f.sessionAmount}
              unit={unit}
              value={values.sessionAmount}
              error={errors.sessionAmount}
              disabled={inputDisabled}
              onChange={(v) => update('sessionAmount', v)}
            />
          </div>
          {values.unit === 'minutes' ? (
            <TimeAmountField
              id="goal-initialProgress"
              label={f.initialProgress}
              value={values.initialProgress}
              error={errors.initialProgress}
              disabled={inputDisabled}
              onChange={(v) => update('initialProgress', v)}
              help={initialProgressHelp}
            />
          ) : (
            <AmountField
              id="goal-initialProgress"
              label={f.initialProgress}
              unit={unit}
              value={values.initialProgress}
              error={errors.initialProgress}
              disabled={inputDisabled}
              onChange={(v) => update('initialProgress', v)}
              help={initialProgressHelp}
            />
          )}
        </div>
      </section>

      {/* 初期質問は2問とも選ぶまで保存できない。「回答しない」も選択に含む（#259）。 */}
      <details
        id="fr-goalform-prior"
        className="fr-goalform__prior"
        open={priorOpen || Boolean(errors.questionPrior) || latestAnswers !== null || answersLock !== null}
        onToggle={(event) => onPriorToggle(event.currentTarget.open)}
      >
        <summary id="fr-goalform-prior-summary" className="fr-goalform__prior-summary">
          <h2 id="fr-goalform-prior-title" className="fr-goalform__prior-title">
            あなたに合う最初の見通しをつくる <span>（必須）</span>
          </h2>
          <Icon name="chevronDown" size={20} />
        </summary>
        <p className="fr-goals__help">最近の取り組み方を2問だけ教えてください。続けやすさ・再開しやすさを最初の見通しに使い、その後は本人の記録で更新します。</p>
        {latestAnswers ? (
          <p className="fr-goalform__latest" role="status">
            {f.latestAnswers(answerLabel(latestAnswers.a), answerLabel(latestAnswers.b))}
          </p>
        ) : null}
        <QuestionPriorFields
          externalHeadingId="fr-goalform-prior-title"
          value={answersLock ? NO_ANSWERS : values.questionPrior}
          onChange={(next) => update('questionPrior', next)}
          disabled={inputDisabled || answersLock !== null}
          fieldErrors={priorErrors}
          {...(answersLock ? {} : { chosen: priorChosen, onChoose: onPriorChoose })}
        />
        {answersLock ? <LockedNote>{answersLock === 'withdrawn' ? f.answersWithdrawn : f.answersNotSavedWithContext}</LockedNote> : null}
        <p className="fr-goals__help">{f.answersNotRecords}</p>
        {mode === 'create' && bothChosen ? <>
          <p className="fr-goals__help">欄を閉じても選んだ回答は残ります。</p>
          <Button variant="text" disabled={inputDisabled} onClick={() => {
            onPriorToggle(false);
            document.getElementById('fr-goalform-prior-summary')?.focus();
          }}>回答欄を閉じる</Button>
        </> : null}
      </details>

      <section className="fr-goalform__group fr-goalform__group--schedule" aria-labelledby="fr-goalform-schedule-title">
        <header className="fr-goalform__group-head">
          <span className="fr-goalform__group-index" aria-hidden="true">03</span>
          <h2 id="fr-goalform-schedule-title">{goalsCopy.formGroups.schedule}</h2>
        </header>
        <div className="fr-goalform__group-fields">
          <div className="fr-goalform__pair">
            {/* 到達予定日（任意、#157、P-19）。記録があっても変えられる */}
            <Field
              id="goal-targetDate"
              label={f.targetDate}
              counter={f.targetDateOptional}
              error={errors.targetDate}
              help={<p>{mode === 'edit' ? f.targetDateEditHelp : f.targetDateHelp}</p>}
            >
              <TextInput
                id="goal-targetDate"
                type="date"
                value={values.targetDate}
                onChange={(event) => update('targetDate', event.target.value)}
                disabled={inputDisabled}
                invalid={Boolean(errors.targetDate)}
                {...fieldAria('goal-targetDate', { help: true, error: errors.targetDate })}
              />
            </Field>
            <Field
              id="goal-timezone"
              label={f.timezone}
              error={errors.timezone}
              help={
                <>
                  <p>{f.timezoneHelp}</p>
                  {locked ? <LockedNote>{f.lockedTimezone}</LockedNote> : null}
                </>
              }
            >
              <SelectInput
                id="goal-timezone"
                value={values.timezone}
                onChange={(event) => update('timezone', event.target.value)}
                disabled={inputDisabled || locked}
                invalid={Boolean(errors.timezone)}
                {...fieldAria('goal-timezone', { help: true, error: errors.timezone })}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz === browserTimezone() ? f.browserTimezone(tz) : tz}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </div>
      </section>

      {mode === 'edit' ? (
        <div className="fr-goalform__delete-mobile">
          <Button variant="text" icon="trash" disabled={inputDisabled} onClick={onDeleteOpen}>
            {f.delete}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AmountField({
  id,
  label,
  unit,
  value,
  error,
  disabled,
  onChange,
  help,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
  help?: ReactNode;
}) {
  const retained = value.startsWith('@hm:') ? timeParts(value) : null;
  const fieldHelp = retained ? <>{help}<p>以前の未保存の時間入力：{retained[0]}時間 {retained[1]}分。新しい単位で量を入力してください。</p></> : help;
  return (
    <Field id={id} label={label} error={error} help={fieldHelp}>
      <NumberInput
        id={id}
        suffix={unit}
        value={retained ? '' : value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        invalid={Boolean(error)}
        {...fieldAria(id, { help: fieldHelp, error })}
      />
    </Field>
  );
}

function LockedNote({ children }: { children: string }) {
  return (
    <p className="fr-goalform__locked">
      <Icon name="info" size={16} />
      {children}
    </p>
  );
}

const answerLabel = (answer: NonNullable<GoalWithAnswers['questionPrior']>['a']) => f.answerLabels[answer ?? 'none'];
