import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Fastify from 'fastify';
import { Value } from '@sinclair/typebox/value';
import { DEFAULT_CONFIG, predict, predictWithQuestionPrior } from '@futureroi/prediction';
import { TodayR11 } from '../../apps/api/src/contracts/r11.ts';
import { buildR11Today } from '../../apps/api/src/prediction/r11.ts';
import { runPrediction } from '../../apps/api/src/prediction/engine.ts';
import { QUESTION_MAPPING, makeQuestionSnapshot } from '../../apps/api/src/questions/snapshot.ts';
import { toForecastView } from '../../apps/web/src/features/today/forecast-view.ts';
import { assertForecastPresentation } from '../../apps/web/src/features/prior/forecast-validation.ts';

const common = JSON.parse(readFileSync(new URL('../../experiments/question-prior-contract/common-fixtures.json', import.meta.url), 'utf8'));
const legacy = JSON.parse(readFileSync(new URL('../../apps/web/tests/fixtures/engine-examples.json', import.meta.url), 'utf8'));

// D-26の公開DTOには旧提案の必要回数やEngine内部の計算方式を追加しない。
function publicCompletion(completion) {
  if (completion.status !== 'available') return completion;
  return { status: completion.status, scenario: completion.scenario, p50Days: completion.p50Days, p80Days: completion.p80Days };
}

function assertView(view, expected, unit, sources, plan, sessionAmount) {
  assertForecastPresentation(view);
  assert.equal(view.kind, expected.progress.completed ? 'completed'
    : expected.todayStatus === 'UNRECORDED' ? 'forecast' : 'today-recorded');
  assert.deepEqual(view.progress, { done: expected.progress.done, total: expected.progress.total, unit });
  if (view.kind === 'completed') return;
  // FEの予測部品はDONE/SKIPPEDをtoday-recordedへ集約する。個別状態はToday DTOで照合する。
  assert.deepEqual(view.resumed, { success: expected.observations.nSD, total: expected.observations.nSD + expected.observations.nSS });
  const completion = expected.completion;
  assert.equal(view.completion.kind, completion.status === 'available' ? 'estimate' : plan ? 'conditional' : 'insufficient');
  if (view.completion.kind === 'estimate') {
    assert.deepEqual(view.completion.sources, sources);
    assert.equal(view.completion.scenario, completion.scenario);
    assert.equal(view.completion.p50Days, completion.p50Days);
    assert.equal(view.completion.p80Days, completion.p80Days);
  } else if (view.completion.kind === 'conditional') {
    assert.deepEqual(view.completion.plan, { remainingAmount: plan.remainingAmount, sessions: plan.remainingSessions,
      sessionAmount, lastAmount: plan.lastSessionAmount, unit });
  }
  if (view.kind === 'forecast') {
    if (expected.coreMetric.status === 'available') {
      assert.deepEqual(view.core, { kind: 'estimate', days: expected.coreMetric.g50, source: sources.b });
    } else {
      assert.equal(view.core.kind, 'insufficient');
    }
  }
}

test('共通固定例の範囲と写像・設定を現行D-26へ照合し、旧提案を再採択しない', () => {
  assert.deepEqual(common.calculationExamples.map(c => c.id), Array.from({ length: 18 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(QUESTION_MAPPING, { version: 'r11-strength4-v1', values: {
    LOW: { alpha: 1, beta: 3 }, MID: { alpha: 2, beta: 2 }, HIGH: { alpha: 3, beta: 1 },
  } });
  assert.deepEqual(common.mappingCandidate.values, QUESTION_MAPPING.values);
  for (const c of common.calculationExamples) assert.deepEqual(c.config, DEFAULT_CONFIG, c.id);
  assert.equal(legacy.cases.length, 13);
});

for (const c of common.calculationExamples) {
  test(`R-11共通固定例 ${c.id}: ${c.note}`, async t => {
    const engine = predictWithQuestionPrior({ prediction: c.input, answers: c.answers, mapping: QUESTION_MAPPING });
    const prediction = { ...engine.prediction, completion: publicCompletion(engine.prediction.completion) };
    for (const key of ['todayStatus', 'progress', 'observations', 'posterior', 'coreMetric']) {
      assert.deepEqual(prediction[key], c.expected[key], key);
    }
    assert.deepEqual(prediction.completion, publicCompletion(c.expected.completion));
    assert.deepEqual(engine.provenance, c.expected.evidenceSource);
    const plan = !c.expected.progress.completed && c.expected.completion.status === 'insufficient'
      ? c.expected.conditionalPlan : null;
    assert.deepEqual(engine.plan, plan);

    // 実Today変換と厳密HTTP serializerの出力をFEへ渡す。DB/認証routeの試験とは区別する。
    let response;
    const app = Fastify();
    t.after(() => app.close());
    app.get('/today', { schema: { response: { 200: TodayR11 } } }, () => response);
    for (const unit of ['minutes', 'sessions']) {
      const context = { unit, sessionAmount: c.input.goal.sessionAmount,
        recordStartDate: c.input.logs.map(log => log.localDate).sort()[0] ?? c.input.today };
      response = buildR11Today({
        now: new Date(`${c.input.today}T03:00:00Z`),
        goal: { ...c.input.goal, ...context, timezone: 'Asia/Tokyo', goalSettingsRevision: 0,
          unitLocked: c.input.logs.length > 0 || c.input.goal.initialProgress > 0 },
        logs: c.input.logs,
        question: { question_prior: c.answers, answer_revision: '0', question_prior_snapshot: makeQuestionSnapshot(c.answers, context) },
      });
      assert.deepEqual(response.prediction, prediction);
      assert.equal(response.today, c.input.today);
      assert.deepEqual(response.todayLog, c.input.logs.find(log => log.localDate === c.input.today) ?? null);
      assert.deepEqual(response.provenance, c.expected.evidenceSource);
      assert.deepEqual(response.plan, plan);
      assert.equal(response.context.sessionAmount, c.input.goal.sessionAmount);
      assert.equal(response.context.unit, unit);
      const http = await app.inject('/today');
      assert.equal(http.statusCode, 200, http.body);
      const dto = http.json();
      assert.ok(Value.Check(TodayR11, dto), 'wire DTO');
      assert.deepEqual(dto, response, 'serializerで数値・出所・不足状態を落とさない');
      assertView(toForecastView(dto.prediction, unit, { provenance: dto.provenance, plan: dto.plan,
        sessionAmount: dto.context.sessionAmount }), c.expected, unit, c.expected.evidenceSource, plan, c.input.goal.sessionAmount);
    }
  });
}

for (const c of legacy.cases) {
  test(`旧固定例 ${c.name}: sampledの凍結値と現行autoの層間一致を分ける`, () => {
    // source.commit=545f5f7の固定値はD-31以前のsampling。既定autoのgoldenへ読み替えない。
    const sampled = predict(c.input, { modelVersion: c.prediction.modelVersion, ...c.prediction.config, completionMethod: 'sampled' });
    assert.deepEqual({ ...sampled, completion: publicCompletion(sampled.completion) }, c.prediction);
    const current = predict(c.input);
    const dto = runPrediction(c.input);
    assert.deepEqual(dto, { ...current, completion: publicCompletion(current.completion) });
    for (const key of ['todayStatus', 'progress', 'observations', 'posterior', 'coreMetric', 'config']) {
      assert.deepEqual(dto[key], c.prediction[key], key);
    }
    for (const prediction of [c.prediction, dto]) {
      for (const unit of ['minutes', 'sessions']) {
        assertView(toForecastView(prediction, unit), prediction, unit, { a: 'RECORDS', b: 'RECORDS' }, null, c.input.goal.sessionAmount);
      }
    }
  });
}
