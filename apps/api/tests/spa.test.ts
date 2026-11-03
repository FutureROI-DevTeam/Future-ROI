import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { buildApp } from '../src/app.ts';

// SPA配信の規則だけを確かめる。DBには接続しない。
async function appWithSpa(t: test.TestContext) {
  const webDist = mkdtempSync(join(tmpdir(), 'futureroi-web-'));
  mkdirSync(join(webDist, 'assets'));
  writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>spa</title>');
  writeFileSync(join(webDist, 'assets', 'app-abc123.js'), 'console.log(1)');
  mkdirSync(join(webDist, 'assets', 'nested'));
  writeFileSync(join(webDist, 'assets', 'nested', '資料-[v1].txt'), 'nested asset');
  writeFileSync(join(webDist, 'assets', 'nested', '.private.txt'), 'must stay private');
  const pool = new pg.Pool({ connectionString: 'postgres://nobody:nothing@127.0.0.1:1/none' });
  const app = await buildApp({ pool, webDist, logger: false });
  t.after(async () => {
    await app.close();
    await pool.end();
    rmSync(webDist, { recursive: true, force: true });
  });
  return app;
}

test('GET / と深いURLへの直接アクセスはindex.htmlを返し、再検証を求める', async (t) => {
  const app = await appWithSpa(t);
  for (const url of ['/', '/goals/9f1c', '/login?next=%2Fgoals']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, url);
    assert.match(res.headers['content-type']?.toString() ?? '', /^text\/html/, url);
    assert.equal(res.headers['cache-control'], 'no-cache', url);
    assert.match(res.body, /<title>spa<\/title>/, url);
  }
});

test('hash付きassetsは長期キャッシュできる', async (t) => {
  const app = await appWithSpa(t);
  const res = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('静的配信は入れ子・Unicode・記号を含むassetを列挙し、dotfileを公開しない', async (t) => {
  const app = await appWithSpa(t);
  const url = `/assets/nested/${encodeURIComponent('資料-[v1].txt')}`;
  const res = await app.inject({ method: 'GET', url });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'nested asset');
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
  const head = await app.inject({ method: 'HEAD', url });
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], String(Buffer.byteLength('nested asset')));
  const hidden = await app.inject({ method: 'GET', url: '/assets/nested/.private.txt' });
  assert.equal(hidden.statusCode, 404);
  assert.deepEqual(hidden.json(), { error: { code: 'NOT_FOUND', message: 'No such route.' } });
});

test('存在しないAPI、対象外のmethod、拡張子付きの未知ファイルにはHTMLを返さない', async (t) => {
  const app = await appWithSpa(t);
  const cases = [
    { method: 'GET', url: '/api/nope' },
    { method: 'POST', url: '/api/nope' },
    { method: 'POST', url: '/goals' },
    { method: 'DELETE', url: '/' },
    { method: 'GET', url: '/assets/old-build.js' },
    // API namespaceの境界とpercent-encodingされた要求（レビュー指摘の回帰例）
    { method: 'GET', url: '/api' },
    { method: 'GET', url: '/api?x=1' },
    { method: 'GET', url: '/api%2Fnope' },
    { method: 'GET', url: '/assets/old%2Ejs' },
    { method: 'GET', url: '/assets/no-extension' },
  ] as const;
  for (const c of cases) {
    const res = await app.inject(c);
    assert.equal(res.statusCode, 404, `${c.method} ${c.url}`);
    assert.match(res.headers['content-type']?.toString() ?? '', /^application\/json/, `${c.method} ${c.url}`);
    assert.deepEqual(res.json(), { error: { code: 'NOT_FOUND', message: 'No such route.' } }, `${c.method} ${c.url}`);
  }
});

test('不正なpercent-encodingのURLはrouterが拒否し、共通のJSON形式で400を返す', async (t) => {
  const app = await appWithSpa(t);
  const res = await app.inject({ method: 'GET', url: '/%E0%A4%A' });
  assert.equal(res.statusCode, 400);
  assert.match(res.headers['content-type']?.toString() ?? '', /^application\/json/);
  const body = res.json<{ error: { code: string; message: string } }>();
  assert.equal(body.error.code, 'BAD_REQUEST');
  assert.equal(Object.keys(body).join(), 'error');
});
