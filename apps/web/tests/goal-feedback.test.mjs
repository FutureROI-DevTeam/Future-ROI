import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGoalAmount, parseInteger, toCreateBody, toPatchBody, rebaseValues, valuesFromGoal, validate } from '../src/features/goals/goal-form.ts';
import { confirmedSaveFeedback } from '../src/features/logs/save-feedback.ts';
import { cumulativeChart } from '../src/features/today/chart-geometry.ts';
import { draftProgress, recordPreviewBaseline } from '../src/features/logs/draft-preview.ts';
import { progressPercent, progressPercentLabel, progressPercentQualifier } from '../src/copy/progress.ts';
import { amountFormat, recordDisplay } from '../src/copy/amount.ts';

test('時間＋分を丸めず整数分へ変換し、不正な途中入力を拒否する', () => {
  const parts = (h, m) => '@hm:' + JSON.stringify([h, m]);
  assert.equal(parseGoalAmount(parts('200', '0')), 12000);
  assert.equal(parseGoalAmount(parts('20', '40')), 1240);
  assert.equal(parseGoalAmount('1,240'), 1240);
  assert.equal(parseGoalAmount(parts('０', '５９')), 59);
  for (const [h, m] of [['', '0'], ['-1', '0'], ['1.5', '0'], ['0', '60'], ['1', ''], ['x', '0']]) {
    assert.equal(parseGoalAmount(parts(h, m)), null);
  }
  assert.equal(parseInteger(parts('1', '0')), null, '日々の記録の整数入力契約を変えない');
});

const date = '2026-10-11';
function snapshot(logs, settings = {}) {
  const todayLog = logs.find(l => l.localDate === date) ?? null;
  const done = logs.filter(l => l.status === 'DONE').reduce((n, l) => n + l.amount, 0);
  const goal = { id: 'g', title: '合成 Goal', unit: 'minutes', totalRequired: 12000, sessionAmount: 30,
    initialProgress: 0, timezone: 'UTC', recordStartDate: '2026-10-10', today: date,
    goalSettingsRevision: 0, answerRevision: 0, historyRevision: '1', unitLocked: false, progressDone: done,
    todayStatus: todayLog?.status ?? 'UNRECORDED', ...settings };
  const today = { today: date, yesterday: '2026-10-10', todayLog,
    yesterdayMissing: !logs.some(l => l.localDate === '2026-10-10'),
    prediction: { today: date, todayStatus: goal.todayStatus, progress: { done, total: goal.totalRequired } },
    context: { goalSettingsRevision: goal.goalSettingsRevision, answerRevision: goal.answerRevision, historyRevision: goal.historyRevision,
      unitLocked: goal.unitLocked, unit: goal.unit, sessionAmount: goal.sessionAmount, recordStartDate: goal.recordStartDate } };
  return { goal, today, logs };
}
const done = amount => ({ localDate: date, status: 'DONE', amount });
const skip = { localDate: date, status: 'SKIPPED', amount: null };
const receipt = (log, previousAmount, overrides = {}) => ({ ...log, change: { goalId: 'g', previousAmount,
  amountDelta: (log.amount ?? 0) - previousAmount, totalRequired: 12000, unit: 'minutes',
  goalSettingsRevision: 0, historyRevision: '1', ...overrides } });
test('時間表示から同じbodyを作り、未変更PATCHを出さず、不正なdraftをrebaseで消さない', () => {
  const g = { ...snapshot([]).goal, initialProgress: 1240, hasLogs: false, questionPrior: { a: null, b: null } };
  const values = { ...valuesFromGoal(g), totalRequired: '@hm:["200","0"]', initialProgress: '@hm:["20","40"]' };
  assert.equal(toCreateBody(values).totalRequired, 12000);
  assert.equal(toCreateBody(values).initialProgress, 1240);
  assert.equal(toPatchBody(values, g), null);
  const invalid = { ...values, initialProgress: '@hm:["20","60"]' };
  assert.equal(rebaseValues(invalid, g, { ...g, initialProgress: 1200 }).initialProgress, invalid.initialProgress);
  const edited = { ...values, totalRequired: '@hm:["2","3"]' };
  const counts = rebaseValues(edited, g, { ...g, unit: 'sessions', totalRequired: 150 });
  assert.equal(counts.unit, 'sessions');
  assert.equal(counts.totalRequired, '123', '有効な旧時間入力の内部表現を回数欄へ露出しない');
  assert.deepEqual(validate(values), {});
  assert.ok(validate({ ...values, unit: 'sessions' }).totalRequired, '回数へ時間＋分の内部表現を送らない');
  assert.ok(validate({ ...values, sessionAmount: '@hm:["0","30"]' }).sessionAmount, '1回の量は整数分の入力契約を保つ');
});
test('200時間へ30分保存は+0.25ポイント、30→20分の訂正は−10分', () => {
  assert.deepEqual(confirmedSaveFeedback(snapshot([]), snapshot([done(30)]), receipt(done(30), 0)),
    { amount: 30, points: .25, unit: 'minutes', localDate: date });
  assert.equal(confirmedSaveFeedback(snapshot([done(30)]), snapshot([done(20)]), receipt(done(20), 30)).amount, -10);
  assert.equal(confirmedSaveFeedback(snapshot([done(30)]), snapshot([skip]), receipt(skip, 30)).amount, -30);
});
test('ゼロ増分・不整合・設定変更・他日更新には増分を出さない', () => {
  assert.equal(confirmedSaveFeedback(snapshot([]), snapshot([skip]), receipt(skip, 0)), null);
  assert.equal(confirmedSaveFeedback(snapshot([done(30)]), snapshot([done(30)]), receipt(done(30), 30)), null);
  for (const settings of [{ totalRequired: 6000 }, { goalSettingsRevision: 1 }, { answerRevision: 1 }, { sessionAmount: 20 }, { timezone: 'Asia/Tokyo' }]) {
    assert.equal(confirmedSaveFeedback(snapshot([]), snapshot([done(30)], settings), receipt(done(30), 0)), null);
  }
  assert.equal(confirmedSaveFeedback(snapshot([]), snapshot([done(30), { localDate: '2026-10-10', status: 'DONE', amount: 10 }]), receipt(done(30), 0)), null);
  const stale = snapshot([done(30)]); stale.goal.progressDone = 0;
  assert.equal(confirmedSaveFeedback(snapshot([]), stale, receipt(done(30), 0)), null);
  assert.equal(confirmedSaveFeedback(snapshot([]), snapshot([done(20)]), receipt(done(30), 0)), null);
});

test('古い表示20分・DB直前40分・保存30分は表示差+10でなく実増減−10分', () => {
  const before = snapshot([done(20)], { historyRevision: '1' });
  const after = snapshot([done(30)], { historyRevision: '3' });
  assert.equal(confirmedSaveFeedback(before, after, receipt(done(30), 40, { historyRevision: '3' })).amount, -10);
  assert.equal(confirmedSaveFeedback(before, after, done(30)), null, '旧応答から差分を推測しない');
  for (const changed of [{ historyRevision: '2' }, { goalId: 'other' }, { totalRequired: 6000 },
    { unit: 'sessions' }, { amountDelta: 10 }, { goalSettingsRevision: 1 }]) {
    assert.equal(confirmedSaveFeedback(before, after, receipt(done(30), 40, { historyRevision: '3', ...changed })), null);
  }
});
test('積み上げ軸は0起点の実績尺度で超過を保持し、初日に架空の未来点を作らない', () => {
  const chart = cumulativeChart([done(125)], 0, 100, date, date, 350, 1);
  assert.equal(chart.points.length, 1);
  assert.equal(chart.singleDay, true);
  assert.ok(chart.maxValue > 125);
  assert.ok(chart.points[0].y < chart.targetY, '超過実績は目標線より上');
  const short = cumulativeChart([], 1, 12000, date, date, 350, 60);
  assert.equal(short.targetY, null, '大きな目標で小さい実績をつぶさない');
  const future = cumulativeChart([{ ...done(1000), localDate: '2026-10-12' }], 0, 100, date, date, 350, 1);
  assert.equal(future.last, 0);
  assert.equal(future.points[0].y, future.zeroY);
});

const draft = (s, amount, overrides = {}) => ({ baseline: recordPreviewBaseline(s), localDate: date, status: 'DONE', amount, ...overrides });
test('未保存試算は新規分量を加算し、当日訂正は旧量を差し引く。実績snapshotを書き換えない', () => {
  const fresh = snapshot([]), original = JSON.stringify(fresh);
  assert.deepEqual(draftProgress(fresh, draft(fresh, 30)), { amount: 30, points: .25, done: 30, total: 12000, unit: 'minutes' });
  assert.equal(JSON.stringify(fresh), original);
  const recorded = snapshot([done(120)], { totalRequired: 18000 });
  assert.deepEqual(draftProgress(recorded, draft(recorded, 200)), { amount: 80, points: 80 / 18000 * 100, done: 200, total: 18000, unit: 'minutes' });
  assert.equal(draftProgress(recorded, draft(recorded, 60)).amount, -60);
  assert.equal(draftProgress(recorded, draft(recorded, 120)).amount, 0);
  const counts = snapshot([done(3)], { unit: 'sessions', totalRequired: 4 });
  assert.deepEqual(draftProgress(counts, draft(counts, 5)), { amount: 2, points: 50, done: 5, total: 4, unit: 'sessions' });
});
test('不正・空欄・0・skip・別Goal/設定/日付/他日更新・不整合へ未保存試算を出さない', () => {
  const s = snapshot([]), d = draft(s, 30);
  for (const value of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2147483648]) assert.equal(draftProgress(s, { ...d, amount: value }), null);
  assert.equal(draftProgress(s, null), null);
  assert.equal(draftProgress(s, { ...d, status: 'SKIPPED' }), null);
  assert.equal(draftProgress(s, { ...d, localDate: '2026-10-12' }), null);
  for (const settings of [{ id: 'other' }, { totalRequired: 6000 }, { goalSettingsRevision: 1 }, { answerRevision: 1 }, { sessionAmount: 20 }, { timezone: 'Asia/Tokyo' }]) {
    assert.equal(draftProgress(snapshot([], settings), d), null);
  }
  assert.equal(draftProgress(snapshot([{ localDate: '2026-10-10', status: 'DONE', amount: 10 }]), d), null);
  const broken = snapshot([]); broken.goal.progressDone = 5;
  assert.equal(draftProgress(broken, d), null);
  assert.equal(draftProgress(broken, draft(broken, 30)), null, 'Goalだけ新しい累計でも新規入力を試算しない');
  const duplicate = snapshot([done(30), done(30)]);
  assert.equal(draftProgress(duplicate, draft(duplicate, 20)), null);
});
test('小さい実績を0%にせず、未達を丸めで100%にしない。超過実績は保持する', () => {
  assert.equal(progressPercentLabel(120, 18000), '0.67');
  assert.ok(Math.abs(progressPercent(120, 18000) - 2 / 3) < 1e-12);
  assert.equal(progressPercentLabel(0, 18000), '0');
  // 端の書き方（#255）：0.01%を下回るときは「0.01%以下」、未達で丸めると100になるときは「99.99%」
  assert.equal(progressPercentLabel(1, 2147483647), '0.01');
  assert.equal(progressPercentQualifier(1, 2147483647), '以下');
  assert.equal(progressPercentLabel(1, 100000), '0.01');
  assert.equal(progressPercentQualifier(1, 100000), '以下');
  assert.equal(progressPercentLabel(1, 10000), '0.01');
  assert.equal(progressPercentQualifier(1, 10000), '');
  // 丸めると0.01になる0.005%・0.009%も、0.01%を下回るので「以下」を付ける。ちょうど0.01%には付けない
  assert.equal(progressPercentLabel(5, 100000), '0.01');
  assert.equal(progressPercentQualifier(5, 100000), '以下');
  assert.equal(progressPercentLabel(9, 100000), '0.01');
  assert.equal(progressPercentQualifier(9, 100000), '以下');
  assert.equal(progressPercentLabel(10, 100000), '0.01');
  assert.equal(progressPercentQualifier(10, 100000), '');
  assert.equal(progressPercentQualifier(11, 100000), '');
  assert.equal(progressPercentQualifier(0, 18000), '');
  assert.equal(progressPercentLabel(9999, 10000), '99.99');
  assert.equal(progressPercentLabel(99999, 100000), '99.99');
  assert.equal(progressPercentLabel(99996, 100000), '99.99');
  assert.equal(progressPercentQualifier(99999, 100000), '');
  assert.equal(progressPercentQualifier(100000, 100000), '');
  assert.equal(progressPercentLabel(100000, 100000), '100');
  assert.equal(progressPercentLabel(125, 100), '125');
  assert.equal(progressPercent(125, 100), 100, 'バーだけは100%まで');
  const s = snapshot([done(90)], { totalRequired: 100 });
  assert.equal(draftProgress(s, draft(s, 125)).done, 125);
});
test('日々の量は120分/回、総量と累計は2時間0分を保つ', () => {
  assert.equal(recordDisplay(amountFormat({ unit: 'minutes' }), 120), '120分');
  assert.equal(amountFormat({ unit: 'minutes' }).total(120), '2時間0分');
  assert.equal(recordDisplay(amountFormat({ unit: 'sessions' }), 120), '120回');
});
