import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { ErrorBody, Goal, GoalCreate, GoalList, GoalParams, GoalPatch, GoalR11, R11ViewQuery } from '../contracts/index.ts';
import { errorBody } from '../http/errors.ts';
import { requireUserId } from '../http/guards.ts';
import { GoalFieldsInvalid } from './target-date-policy.ts';
import { createGoalOnce, deleteGoal, getGoal, listGoals, updateGoal } from './store.ts';

export type GoalRouteDeps = {
  pool: Pool;
  /** 現在時刻。Goalのtimezoneでの「今日」と記録開始日の算出に使う（テストでは固定する）。 */
  now: () => Date;
};

const CreateHeaders = Type.Object({
  'x-create-owner': Type.Optional(Type.String()),
  'idempotency-key': Type.String({
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  }),
});
const GOAL_NOT_FOUND = errorBody('NOT_FOUND', 'Goal not found.');

/** 到達予定日の検査に通らなかった（#157）。契約違反と同じ形の422で返す。 */
const invalidFields = (error: GoalFieldsInvalid) => errorBody('VALIDATION_ERROR', 'Request does not match the goal contract.', error.fields);

// Goal API（R-02、#76）。`/api/*`共通hook（guards.ts）の内側に置くため、ここでは認証済みのrequest.userIdを前提にする。
// 他人のGoalは存在を明かさず404。契約違反は共通のerror handlerが422へ変換する。
export async function registerGoalRoutes(app: FastifyInstance, deps: GoalRouteDeps): Promise<void> {
  await app.register(async (instance) => {
    requireUserId(instance);
    const api = instance.withTypeProvider<TypeBoxTypeProvider>();

    api.get('/api/goals', { schema: { response: { 200: GoalList } } }, async (request) => listGoals(deps.pool, request.userId, deps.now));

    api.post('/api/goals', { schema: { body: GoalCreate, headers: CreateHeaders, response: { 200: Goal, 201: Goal, 409: ErrorBody, 410: ErrorBody, 422: ErrorBody } } }, async (request, reply) => {
      try {
        if (
          request.headers['x-create-owner'] !== undefined &&
          request.headers['x-create-owner'] !== request.userId
        ) {
          return reply.code(409).send(errorBody(
            'CREATE_OWNER_CHANGED',
            'Sign in with the account that started this create operation.',
          ));
        }
        const result = await createGoalOnce(
          deps.pool, request.userId, request.body, deps.now, request.headers['idempotency-key'],
        );
        if (result.kind === 'conflict') {
          return reply.code(409).send(errorBody(
            'IDEMPOTENCY_CONFLICT', 'This key was used for a different create request.',
          ));
        }
        if (result.kind === 'deleted') {
          return reply.code(410).send(errorBody('CREATE_RESULT_DELETED', 'The created goal was deleted.'));
        }
        if (!('goal' in result)) throw new Error('Unexpected create result');
        if (result.kind === 'replayed') reply.header('Idempotency-Replayed', 'true');
        return reply.code(result.kind === 'created' ? 201 : 200).send(result.goal);
      } catch (error) {
        if (error instanceof GoalFieldsInvalid) return reply.code(422).send(invalidFields(error));
        throw error;
      }
    });

    api.get('/api/goals/:goalId', { schema: { params: GoalParams, querystring: R11ViewQuery,
      response: { 200: Type.Union([GoalR11, Goal]), 404: ErrorBody, 422: ErrorBody } } }, async (request, reply) => {
      const goal = await getGoal(deps.pool, request.userId, request.params.goalId, deps.now);
      if (!goal) return reply.code(404).send(GOAL_NOT_FOUND);
      if (request.query.view === 'r11') return { ...goal, schemaVersion: 'r11-v1' as const };
      // unionの候補照合にも旧schemaを満たす値を渡す。内部の回答欄は旧表現へ含めない。
      const { questionPrior: _answers, answerRevision: _revision, historyRevision: _history, historyFingerprint: _fingerprint, ...legacyGoal } = goal;
      return legacyGoal;
    });

    api.patch(
      '/api/goals/:goalId',
      { schema: { params: GoalParams, body: GoalPatch, response: { 200: Goal, 404: ErrorBody, 409: ErrorBody, 422: ErrorBody } } },
      async (request, reply) => {
        let result: Awaited<ReturnType<typeof updateGoal>>;
        try {
          result = await updateGoal(deps.pool, request.userId, request.params.goalId, request.body, deps.now);
        } catch (error) {
          if (error instanceof GoalFieldsInvalid) return reply.code(422).send(invalidFields(error));
          throw error;
        }
        if (result.kind === 'not_found') return reply.code(404).send(GOAL_NOT_FOUND);
        if (result.kind === 'settings_conflict') {
          return reply.code(409).send(errorBody(
            'GOAL_SETTINGS_CONFLICT', 'Settings changed. Reload before explicitly saving again.',
          ));
        }
        if (result.kind === 'unit_locked') {
          return reply.code(422).send(errorBody(
            'GOAL_UNIT_LOCKED',
            'Unit cannot change after past DONE amounts or while initial progress is positive.',
            [{ path: 'body/unit', message: 'create a new goal for a different unit' }],
          ));
        }
        if (result.kind === 'revision_exhausted') {
          return reply.code(422).send(errorBody(
            'GOAL_SETTINGS_REVISION_EXHAUSTED', 'Settings revision cannot increase further.',
          ));
        }
        if (result.kind === 'answer_conflict') {
          return reply.code(409).send(errorBody(
            'ANSWER_CONFLICT', 'The answer context changed. Reload the goal before editing the answers.',
          ));
        }
        if (result.kind === 'invalid_question_patch') {
          return reply.code(422).send(errorBody(
            'VALIDATION_ERROR', 'Request does not match the question contract.',
            [{
              path: `body/${result.field}`,
              message: result.field === 'questionPrior'
                ? 'clear the answers when changing unit or sessionAmount; answer again after reloading'
                : 'include the current answer revision with answer or context updates',
            }],
          ));
        }
        if (result.kind === 'locked') {
          return reply.code(422).send(
            errorBody(
              'GOAL_HAS_LOGS',
              'timezone cannot be changed once the goal has record history.',
              result.fields.map((field) => ({ path: `body/${field}`, message: 'cannot be changed once the goal has logs' })),
            ),
          );
        }
        if (!('goal' in result)) throw new Error('Unexpected update result');
        return result.goal;
      },
    );

    // 成功はbodyなしの204（Fastifyは204の応答からbodyとcontent-typeを外す）。
    api.delete('/api/goals/:goalId', { schema: { params: GoalParams, response: { 204: Type.Null(), 404: ErrorBody } } }, async (request, reply) => {
      const deleted = await deleteGoal(deps.pool, request.userId, request.params.goalId);
      return deleted ? reply.code(204).send(null) : reply.code(404).send(GOAL_NOT_FOUND);
    });
  });
}
