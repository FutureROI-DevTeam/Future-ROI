import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { ApiError } from '../src/api/client.ts';
import { goalsCopy } from '../src/copy/goals.ts';
import {
  answersLockReason,
  changesAnswerContext,
  emptyValues,
  errorCount,
  initialPriorChosen,
  priorChoiceError,
  fieldErrorsFromApi,
  isEditSaveResultUnknown,
  parseInteger,
  rebaseValues,
  reloadLatestGoal,
  targetDateChecks,
  toCreateBody,
  toPatchBody,
  validate,
  validateGoalForm,
  valuesFromGoal,
} from '../src/features/goals/goal-form.ts';

const e = goalsCopy.errors;
const valid = { title: '英単語アプリ', unit: 'minutes', totalRequired: '3000', sessionAmount: '20', initialProgress: '0', timezone: 'Asia/Tokyo', targetDate: '', questionPrior: { a: null, b: null } };
const goal = {
  id: 'g1', title: '英単語アプリ', unit: 'minutes', totalRequired: 3000, sessionAmount: 20, initialProgress: 0, timezone: 'Asia/Tokyo',
  recordStartDate: '2026-08-17', hasLogs: false, unitLocked: false, goalSettingsRevision: 0, today: '2026-10-07', todayStatus: 'UNRECORDED', targetDate: null,
};

test('数の入力は全角数字と桁区切りを受け付け、整数でなければ拒否する', () => {
  assert.equal(parseInteger('３,０００'), 3000);
  assert.equal(parseInteger(' 20 '), 20);
  for (const raw of ['', '1.5', '-1', '1e3', '二十']) assert.equal(parseInteger(raw), null, raw);
});

test('API契約と同じ範囲を、送る前に項目ごとに検査する', () => {
  assert.deepEqual(validate(valid), {});
  const errors = validate({ ...valid, title: '   ', totalRequired: '0', sessionAmount: '', initialProgress: '-1', timezone: 'Mars/Base' });
  assert.deepEqual(errors, { title: e.titleRequired, totalRequired: e.positiveInteger, sessionAmount: e.positiveInteger, initialProgress: e.nonNegativeInteger, timezone: e.timezone });
  // タイトルは100文字まで（絵文字も1文字と数える）
  assert.deepEqual(validate({ ...valid, title: '😀'.repeat(100) }), {});
  assert.equal(validate({ ...valid, title: 'あ'.repeat(101) }).title, e.titleTooLong);
  // DBの整数の上限を超える数
  assert.equal(validate({ ...valid, totalRequired: '2147483648' }).totalRequired, e.tooLarge);
  assert.equal(validate({ ...valid, initialProgress: '0' }).initialProgress, undefined);
});

test('記録後はtimezoneだけを固定し、開始前の合計は検査して訂正する', () => {
  const locked = { ...valid, initialProgress: 'x', timezone: '' };
  assert.deepEqual(validate(locked, { locked: true }), { initialProgress: e.nonNegativeInteger });
  const patch = toPatchBody({ ...valuesFromGoal(goal), title: '新しい名前', initialProgress: '999', timezone: 'UTC' }, { ...goal, hasLogs: true });
  assert.deepEqual(patch, { expectedGoalSettingsRevision: 0, title: '新しい名前', initialProgress: 999 });
});

test('作成は全項目を整数で送り、編集は変えた項目だけを送る（変更がなければ送らない）', () => {
  assert.deepEqual(toCreateBody({ ...valid, totalRequired: '３,０００' }), { title: '英単語アプリ', unit: 'minutes', totalRequired: 3000, sessionAmount: 20, initialProgress: 0, timezone: 'Asia/Tokyo', questionPrior: { a: null, b: null } });
  assert.equal(toPatchBody(valuesFromGoal(goal), goal), null);
  assert.deepEqual(toPatchBody({ ...valuesFromGoal(goal), unit: 'sessions', sessionAmount: '25', timezone: 'UTC' }, goal), { expectedGoalSettingsRevision: 0, unit: 'sessions', sessionAmount: 25, timezone: 'UTC' });
  assert.equal(emptyValues('Asia/Tokyo').initialProgress, '0');
});

test('APIの422を項目ごとのエラーへ割り当てる', () => {
  const validation = new ApiError(422, { error: { code: 'VALIDATION_ERROR', message: 'x', fields: [{ path: 'body/totalRequired', message: 'must be >= 1' }, { path: 'body/timezone', message: 'bad' }, { path: 'body/unknown', message: 'x' }] } });
  assert.deepEqual(fieldErrorsFromApi(validation), { totalRequired: e.positiveInteger, timezone: e.timezone });
  const locked = new ApiError(422, { error: { code: 'GOAL_HAS_LOGS', message: 'x', fields: [{ path: 'body/timezone', message: 'x' }, { path: 'body/initialProgress', message: 'x' }] } });
  assert.deepEqual(fieldErrorsFromApi(locked), { timezone: e.locked, initialProgress: e.locked });
  // 項目のない422は空（画面は保存失敗として出す）、422以外と通信の失敗はnull
  assert.deepEqual(fieldErrorsFromApi(new ApiError(422, { error: { code: 'CONSTRAINT_VIOLATION', message: 'x' } })), {});
  assert.equal(fieldErrorsFromApi(new ApiError(500, null)), null);
  assert.equal(fieldErrorsFromApi(new TypeError('Failed to fetch')), null);
});

test('編集を始めた時点の値と比べ、別のタブでの変更を触っていない項目で巻き戻さない', () => {
  // 編集開始時：sessionAmount=20。その後、別のタブで30へ変更され、再取得でGoalが新しくなった
  const baseline = goal;
  const refreshed = { ...goal, sessionAmount: 30 };
  const values = { ...valuesFromGoal(baseline), title: '英単語アプリ（朝）' };
  // 比較元を編集開始時に固定していれば、タイトルだけを送る
  assert.deepEqual(toPatchBody(values, baseline), { expectedGoalSettingsRevision: 0, title: '英単語アプリ（朝）' });
  // 比較元を再取得後のGoalにすると、触っていない sessionAmount=20 まで送って巻き戻してしまう（直す前の動き）
  assert.deepEqual(toPatchBody(values, refreshed), { expectedGoalSettingsRevision: 0, title: '英単語アプリ（朝）', sessionAmount: 20 });
});

test('保存の途中で画面を離れたら、mutateに渡した一覧への移動は呼ばれず、取り直しだけは行われる', async () => {
  const client = new QueryClient();
  let finish;
  let invalidated = 0;
  let navigated = 0;
  const observer = new MutationObserver(client, {
    mutationFn: () => new Promise((resolve) => (finish = resolve)),
    onSuccess: () => {
      invalidated += 1;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const pending = observer.mutate(undefined, { onSuccess: () => (navigated += 1) }).catch(() => {});
  // 保存の要求が送られるのを待つ
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  // 保存の途中でフォームを離れる（部品が消えると購読も外れる）
  unsubscribe();
  finish({ ok: true });
  await pending;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(invalidated, 1);
  assert.equal(navigated, 0);
  client.clear();
});
test('R-11の回答は、変えたときだけ両方の問いと版を送り、単位・1回の量を変えるときは版だけを送る', () => {
  const answered = { ...goal, questionPrior: { a: 'MID', b: null }, answerRevision: 3 };
  const base = valuesFromGoal(answered);
  assert.deepEqual(base.questionPrior, { a: 'MID', b: null });
  // 回答に触れない無関係な更新には版を付けない（付けると422）
  assert.deepEqual(toPatchBody({ ...base, title: '新しい名前' }, answered), { expectedGoalSettingsRevision: 0, title: '新しい名前' });
  // 片方だけ変えても、もう片方を含めて両方送る
  assert.deepEqual(toPatchBody({ ...base, questionPrior: { a: 'MID', b: 'UNKNOWN' } }, answered), { expectedGoalSettingsRevision: 0,
    questionPrior: { a: 'MID', b: 'UNKNOWN' }, expectedAnswerRevision: 3,
  });
  // 撤回は両方null
  assert.deepEqual(toPatchBody({ ...base, questionPrior: { a: null, b: null } }, answered), { expectedGoalSettingsRevision: 0,
    questionPrior: { a: null, b: null }, expectedAnswerRevision: 3,
  });
  // 1回の量を変えるときは回答を送らず（APIが取り消す）、版だけを送る
  assert.deepEqual(toPatchBody({ ...base, sessionAmount: '30', questionPrior: { a: 'HIGH', b: 'HIGH' } }, answered), { expectedGoalSettingsRevision: 0,
    sessionAmount: 30, expectedAnswerRevision: 3,
  });
  assert.equal(changesAnswerContext({ ...base, unit: 'sessions' }, answered), true);
  assert.equal(changesAnswerContext({ ...base, totalRequired: '9999' }, answered), false);
  // 総量だけの変更は回答を保ち、版も送らない
  assert.deepEqual(toPatchBody({ ...base, totalRequired: '4000' }, answered), { expectedGoalSettingsRevision: 0, totalRequired: 4000 });
});

test('回答の版の誤り（422）は回答の欄のエラーとして出す', () => {
  const error = new ApiError(422, { error: { code: 'VALIDATION_ERROR', message: 'x', fields: [{ path: 'body/expectedAnswerRevision', message: 'x' }] } });
  assert.deepEqual(fieldErrorsFromApi(error), { questionPrior: e.server });
});

test('409の後に最新を読み直したら、触っていない項目は最新の値にし、別の画面での変更を巻き戻さない（R-11、#137）', () => {
  const previous = { ...goal, questionPrior: { a: 'MID', b: null }, answerRevision: 3 };
  // 別の画面で、タイトル・総量・回答が変わった
  const latest = { ...previous, title: '英単語アプリ（夜）', totalRequired: 5000, questionPrior: { a: 'LOW', b: 'LOW' }, answerRevision: 4 };
  // 回答だけを編集していた
  const edited = { ...valuesFromGoal(previous), questionPrior: { a: 'HIGH', b: 'HIGH' } };
  const rebased = rebaseValues(edited, previous, latest);
  assert.equal(rebased.title, '英単語アプリ（夜）');
  assert.equal(rebased.totalRequired, '5000');
  assert.deepEqual(rebased.questionPrior, { a: 'HIGH', b: 'HIGH' });
  // 再保存では、編集した回答と最新の版だけを送り、タイトル・総量を古い値で送らない
  assert.deepEqual(toPatchBody(rebased, latest), { expectedGoalSettingsRevision: 0, questionPrior: { a: 'HIGH', b: 'HIGH' }, expectedAnswerRevision: 4 });
  // 触った項目（タイトル）は入力を残し、触っていない回答は最新にする
  const titleEdited = rebaseValues({ ...valuesFromGoal(previous), title: '自分の名前' }, previous, latest);
  assert.equal(titleEdited.title, '自分の名前');
  assert.deepEqual(titleEdited.questionPrior, { a: 'LOW', b: 'LOW' });
  assert.deepEqual(toPatchBody(titleEdited, latest), { expectedGoalSettingsRevision: 0, title: '自分の名前' });
});

test('単位か1回の量を変えている間は、保存済みの回答がなくても回答の欄を押せなくする（R-11、#137）', () => {
  const unanswered = { ...goal, questionPrior: { a: null, b: null }, answerRevision: 0 };
  const answered = { ...goal, questionPrior: { a: 'MID', b: null }, answerRevision: 3 };
  const changed = { ...valuesFromGoal(unanswered), sessionAmount: '30', questionPrior: { a: 'HIGH', b: 'LOW' } };
  assert.equal(answersLockReason(changed, unanswered), 'notSaved');
  // 回答の欄が押せない理由と送信内容が一致する（回答は送らない）
  assert.deepEqual(toPatchBody(changed, unanswered), { expectedGoalSettingsRevision: 0, sessionAmount: 30, expectedAnswerRevision: 0 });
  assert.equal(answersLockReason({ ...valuesFromGoal(answered), unit: 'sessions' }, answered), 'withdrawn');
  assert.equal(answersLockReason({ ...valuesFromGoal(unanswered), totalRequired: '4000' }, unanswered), null);
});

test('409後の再取得は通信中断・503の古いcacheを採用せず、成功した最新の版でだけ再保存できる', async () => {
  for (const failure of [new TypeError('Failed to fetch'), new ApiError(503, null)]) {
    const client = new QueryClient();
    const previous = { ...goal, questionPrior: { a: 'MID', b: 'LOW' }, answerRevision: 0 };
    const latest = { ...previous, title: '別の画面のタイトル', questionPrior: { a: 'LOW', b: 'LOW' }, answerRevision: 1 };
    const edited = { ...valuesFromGoal(previous), questionPrior: { a: 'HIGH', b: 'HIGH' } };
    let failed = true;
    const observer = new QueryObserver(client, {
      queryKey: ['goal', failure.name], initialData: previous, retry: false,
      queryFn: async () => {
        if (failed) throw failure;
        return latest;
      },
    });
    try {
      assert.equal(await reloadLatestGoal(() => observer.refetch()), undefined);
      // 固定版React Queryは失敗結果にも古いdataを保持するが、比較元に採用しない。
      assert.equal(observer.getCurrentResult().data, previous);
      assert.equal(observer.getCurrentResult().isError, true);
      assert.deepEqual(edited.questionPrior, { a: 'HIGH', b: 'HIGH' });
      failed = false;
      const loaded = await reloadLatestGoal(() => observer.refetch());
      assert.deepEqual(loaded, latest);
      assert.deepEqual(toPatchBody(rebaseValues(edited, previous, loaded), loaded), { expectedGoalSettingsRevision: 0,
        questionPrior: { a: 'HIGH', b: 'HIGH' }, expectedAnswerRevision: 1,
      });
    } finally { client.clear(); }
  }
});

test('最新取得のPromiseがrejectしても成功扱いせず、未取得なら比較元を返さない', async () => {
  assert.equal(await reloadLatestGoal(async () => { throw new Error('aborted'); }), undefined);
  assert.equal(await reloadLatestGoal(async () => ({ isSuccess: true, data: undefined })), undefined);
});

test('到達予定日：任意で、今日より後だけ。空にすると未設定（null）で送る（#157、P-19）', () => {
  assert.deepEqual(validate({ ...valid, targetDate: '2026-10-08' }, { today: '2026-10-07' }), {});
  assert.equal(validate({ ...valid, targetDate: '2026-10-07' }, { today: '2026-10-07' }).targetDate, e.targetDatePast);
  assert.equal(toCreateBody({ ...valid, targetDate: '2027-03-31' }).targetDate, '2027-03-31');
  assert.equal('targetDate' in toCreateBody(valid), false);
  const withTarget = { ...goal, targetDate: '2027-03-31', hasLogs: true };
  assert.equal(toPatchBody(valuesFromGoal(withTarget), withTarget), null);
  // 記録があっても変えられる。空にすると null
  assert.deepEqual(toPatchBody({ ...valuesFromGoal(withTarget), targetDate: '2027-06-30' }, withTarget), { targetDate: '2027-06-30', expectedGoalSettingsRevision: 0 });
  assert.deepEqual(toPatchBody({ ...valuesFromGoal(withTarget), targetDate: '' }, withTarget), { targetDate: null, expectedGoalSettingsRevision: 0 });
});

test('保存済みの到達予定日が今日以前になっても、日付を変えない編集は止めない。変えた日付は今日より後だけ（#157、P-19）', () => {
  const passed = { ...goal, targetDate: '2026-10-07' };
  const titleOnly = { ...valuesFromGoal(passed), title: '英単語アプリ（改）' };
  // 当日・過去日になった保存済みの日付は、送らないので検査しない
  assert.deepEqual(validate(titleOnly, { today: '2026-10-07', savedTargetDate: '2026-10-07' }), {});
  assert.deepEqual(validate(titleOnly, { today: '2026-10-09', savedTargetDate: '2026-10-07' }), {});
  assert.deepEqual(toPatchBody(titleOnly, passed), { title: '英単語アプリ（改）', expectedGoalSettingsRevision: 0 });
  // 当日・過去日へ変えたときは拒否する
  assert.equal(validate({ ...titleOnly, targetDate: '2026-10-09' }, { today: '2026-10-09', savedTargetDate: '2026-10-07' }).targetDate, e.targetDatePast);
  assert.equal(validate({ ...titleOnly, targetDate: '2026-10-08' }, { today: '2026-10-09', savedTargetDate: '2026-10-07' }).targetDate, e.targetDatePast);
  assert.deepEqual(validate({ ...titleOnly, targetDate: '2026-10-10' }, { today: '2026-10-09', savedTargetDate: '2026-10-07' }), {});
});

test('時間のGoalの量は整数分のまま入力・保存し、編集で触らなければ元の分を保つ（P-18）', () => {
  // 1240分のような時間＋分で表す値も、入力欄は分の整数で出し、未変更なら送らない
  const g = { ...goal, totalRequired: 3000, sessionAmount: 25, initialProgress: 1240 };
  const shown = valuesFromGoal(g);
  assert.deepEqual([shown.totalRequired, shown.sessionAmount, shown.initialProgress], ['3000', '25', '1240']);
  assert.equal(toPatchBody(shown, g), null);
  // 小数は受け付けない（小数の時間で入力しない）
  assert.equal(validate({ ...valid, sessionAmount: '1.5' }).sessionAmount, e.positiveInteger);
});

test('フォーム共通検査は選択中timezoneの今日を使い、過去日を文言と件数に含める', () => {
  const now = new Date('2026-10-05T15:30:00Z'); // 東京6日、LA5日
  const values = { ...valid, targetDate: '2026-10-06' };
  const errors = validateGoalForm(values, { now });
  assert.deepEqual(errors, { targetDate: e.targetDatePast });
  assert.equal(errorCount(errors), 1);
  assert.deepEqual(validateGoalForm({ ...values, timezone: 'America/Los_Angeles' }, { now }), {});
});

test('フォーム共通検査は経過した保存日を維持し、別の過去日への変更だけを拒否する', () => {
  const baseline = { ...goal, targetDate: '2026-10-07' };
  const now = new Date('2026-10-09T00:00:00Z');
  const values = { ...valuesFromGoal(baseline), title: '名前だけ変更' };
  assert.deepEqual(validateGoalForm(values, { baseline, now }), {});
  assert.deepEqual(toPatchBody(values, baseline), { title: '名前だけ変更', expectedGoalSettingsRevision: 0 });
  assert.equal(validateGoalForm({ ...values, targetDate: '2026-10-08' }, { baseline, now }).targetDate, e.targetDatePast);
  assert.deepEqual(validateGoalForm({ ...values, targetDate: '' }, { baseline, now }), {});
  assert.deepEqual(validateGoalForm({ ...values, targetDate: '2026-10-10' }, { baseline, now }), {});
});

test('画面に出すエラーと送る前の検査は、同じ到達予定日の条件を使う（#157、P-19）', () => {
  // 2026-10-09 09:00 JST。Asia/Tokyo の今日は 2026-10-09
  const now = new Date('2026-10-09T00:00:00Z');
  // 新規作成：今日以前の日付は、画面に出すエラーとして文言が返る
  const createChecks = targetDateChecks('Asia/Tokyo', undefined, now);
  assert.deepEqual(createChecks, { today: '2026-10-09' });
  assert.equal(validate({ ...valid, targetDate: '2026-10-09' }, createChecks).targetDate, e.targetDatePast);
  assert.deepEqual(validate({ ...valid, targetDate: '2026-10-10' }, createChecks), {});
  // 編集：保存済みの過去日は変えなければ通り、別の過去日へ変えると文言が返る
  const editChecks = targetDateChecks('Asia/Tokyo', '2026-10-07', now);
  assert.deepEqual(validate({ ...valid, targetDate: '2026-10-07' }, editChecks), {});
  assert.equal(validate({ ...valid, targetDate: '2026-10-08' }, editChecks).targetDate, e.targetDatePast);
  // 保存済みが未設定（null）の編集で今日を入れたら文言が返る
  assert.equal(validate({ ...valid, targetDate: '2026-10-09' }, targetDateChecks('Asia/Tokyo', null, now)).targetDate, e.targetDatePast);
  // タイムゾーンが違えば今日も違う（同じ時刻で Honolulu は 2026-10-08）
  assert.deepEqual(targetDateChecks('Pacific/Honolulu', undefined, now), { today: '2026-10-08' });
});

test('単位固定は単位だけでも名称との同時変更でも全体を拒否し、422の理由を示す（#148 F09）', () => {
  const locked = { ...goal, initialProgress: 10, unitLocked: true };
  for (const title of [locked.title, '変更名']) {
    const input = { ...valuesFromGoal(locked), unit: 'sessions', title };
    assert.equal(validate(input, { goal: locked }).unit, e.unitLocked);
    assert.throws(() => toPatchBody(input, locked));
  }
  assert.deepEqual(toPatchBody({ ...valuesFromGoal(locked), title: '変更名' }, locked), { expectedGoalSettingsRevision: 0, title: '変更名' });
  assert.deepEqual(fieldErrorsFromApi(new ApiError(422, { error: { code: 'GOAL_UNIT_LOCKED', message: 'x' } })), { unit: e.unitLocked });
});

test('編集の保存結果が分からない失敗（通信・5xx・形の違い）だけを「保存を確認できません」に分ける（R5、#146）', () => {
  // 応答が届かなかった・サーバーの不調・成功応答の形が契約と違う：保存されたか分からない
  assert.equal(isEditSaveResultUnknown(new TypeError('Failed to fetch')), true);
  assert.equal(isEditSaveResultUnknown(new Error('contract mismatch')), true);
  for (const status of [500, 502, 503, 504]) assert.equal(isEditSaveResultUnknown(new ApiError(status, null)), true, String(status));
  // サーバーがはっきり断った：まだ保存されていないと言い切れる
  for (const status of [400, 401, 403, 404, 409, 410, 422, 429]) assert.equal(isEditSaveResultUnknown(new ApiError(status, null)), false, String(status));
});

test('初期質問は2問ともどれかを選ぶまで保存させず、「回答しない」も1つの選択として認める（#259）', () => {
  // 作成は未選択から始める。値の null（回答しない）と未選択は区別できないため、選んだかどうかを別に持つ
  assert.deepEqual(initialPriorChosen('create', { a: 'HIGH', b: null }), { a: false, b: false });
  // 編集は、保存済みの回答がある問だけ選択済み。保存済みの null は選び直してもらう
  assert.deepEqual(initialPriorChosen('edit', { a: 'HIGH', b: null }), { a: true, b: false });
  assert.deepEqual(initialPriorChosen('edit', { a: 'UNKNOWN', b: 'LOW' }), { a: true, b: true });
  assert.equal(priorChoiceError({ a: false, b: false }, false), goalsCopy.form.answersRequired);
  assert.equal(priorChoiceError({ a: true, b: false }, false), goalsCopy.form.answersRequired);
  assert.equal(priorChoiceError({ a: false, b: true }, false), goalsCopy.form.answersRequired);
  assert.equal(priorChoiceError({ a: true, b: true }, false), undefined);
  // 単位か1回の量を変えて回答欄を押せない間は求めない（回答を一緒に送れないため）
  assert.equal(priorChoiceError({ a: false, b: false }, true), undefined);
  // 「回答しない」を選んだ2問は、従来どおり null として送る
  assert.deepEqual(toCreateBody(valid).questionPrior, { a: null, b: null });
});

test('開始前合計は取消後も絶対値で訂正でき、409後は入力と最新設定版を使う', () => {
  const baseline = { ...goal, hasLogs: false, historyRevision: '17', unitLocked: true, initialProgress: 600, goalSettingsRevision: 7 };
  const values = { ...valuesFromGoal(baseline), initialProgress: '0', timezone: 'UTC' };
  assert.equal(validate(values, { locked: true, goal: baseline }).initialProgress, undefined);
  assert.deepEqual(toPatchBody(values, baseline), { expectedGoalSettingsRevision: 7, initialProgress: 0 });
  assert.equal(toPatchBody(valuesFromGoal(baseline), baseline), null);
  assert.equal(validate({ ...values, initialProgress: '-1' }, { locked: true }).initialProgress, e.nonNegativeInteger);
  const edited = { ...valuesFromGoal(baseline), initialProgress: '@hm:["11","40"]' };
  const latest = { ...baseline, initialProgress: 800, goalSettingsRevision: 8 };
  const rebased = rebaseValues(edited, baseline, latest);
  assert.equal(rebased.initialProgress, edited.initialProgress);
  assert.deepEqual(toPatchBody(rebased, latest), { expectedGoalSettingsRevision: 8, initialProgress: 700 });
});
