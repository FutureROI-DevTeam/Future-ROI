import assert from 'node:assert/strict';
import test from 'node:test';
import { afterAuthTarget, authSearch } from '../src/auth/redirect.ts';

test('戻り先なしの登録・ログインはGoal一覧へ進み、アプリ内の明示した戻り先はそのまま保つ', () => {
  assert.deepEqual(authSearch({}), { redirect: '/goals' });
  for (const redirect of ['/', '/goals', '/goals/new', '/goals/goal-id?view=r11#today']) {
    assert.deepEqual(authSearch({ redirect }), { redirect });
  }
});

test('外部URLや戻り先の型違反は認証後の転送先にせずGoal一覧へ進む', () => {
  for (const redirect of ['https://example.test', '//example.test', '', null, 42]) {
    assert.deepEqual(authSearch({ redirect }), { redirect: '/goals' });
  }
});

test('#264: スラッシュとバックスラッシュで始まる戻り先はGoal一覧へ戻す', () => {
  for (const redirect of ['/\\example.test', '/\\', '/\\\\example.test']) {
    assert.deepEqual(authSearch({ redirect }), { redirect: '/goals' });
    assert.deepEqual(authSearch({ redirect, reason: 'expired' }), { redirect: '/goals', reason: 'expired' });
  }
});

test('ログイン切れで来たときの理由（expired）だけを残し、知らない値は捨てる', () => {
  assert.deepEqual(authSearch({ redirect: '/goals/x', reason: 'expired' }), { redirect: '/goals/x', reason: 'expired' });
  assert.deepEqual(authSearch({ reason: 'other' }), { redirect: '/goals' });
});

test('新規登録の後は戻り先に関係なくGoal一覧へ、ログインの後は戻り先へ進む（#249）', () => {
  for (const redirect of ['/goals/someone-elses-goal', '/goals/new', '/goals', '/']) {
    assert.equal(afterAuthTarget('register', redirect), '/goals');
    assert.equal(afterAuthTarget('login', redirect), redirect);
  }
});
