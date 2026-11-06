import assert from 'node:assert/strict';
import test from 'node:test';
import { selectE2eDatabaseUrl } from './e2e-database.mjs';

const service = 'postgres://futureroi:ci-only-placeholder@127.0.0.1:5432/futureroi';

test('E2E defaults to embedded PostgreSQL and accepts only the explicit disposable CI service', () => {
  assert.equal(selectE2eDatabaseUrl({}), undefined);
  assert.equal(selectE2eDatabaseUrl({ DATABASE_URL: '' }), undefined);
  assert.equal(selectE2eDatabaseUrl({ E2E_DATABASE_URL: service }), service);
  assert.equal(selectE2eDatabaseUrl({ E2E_DATABASE_URL: service, DATABASE_URL: service }), service);
});

test('E2E rejects an ambient application URL before any DB connection, including the CI URL without opt-in', () => {
  for (const DATABASE_URL of [service, 'postgres://app:private-value@production.example/app', 'postgres://app:private-value@127.0.0.1:5432/app']) {
    assert.throws(() => selectE2eDatabaseUrl({ DATABASE_URL }), /Refusing inherited DATABASE_URL/);
    if (DATABASE_URL !== service) {
      assert.throws(() => selectE2eDatabaseUrl({ E2E_DATABASE_URL: service, DATABASE_URL }), /Refusing inherited DATABASE_URL/);
    }
  }
});

test('E2E rejects other hosts, credentials, databases, ports and connection options without printing values', () => {
  const candidates = [
    service.replace('127.0.0.1', 'production.example'),
    service.replace('127.0.0.1', 'localhost'),
    service.replace('5432', '15432'),
    service.replace('/futureroi', '/production'),
    service.replace('futureroi:', 'app:'),
    service.replace('ci-only-placeholder', 'private-value'),
    service + '?host=production.example',
    service + '#private-value',
    'not a URL with private-value',
  ];
  for (const E2E_DATABASE_URL of candidates) {
    assert.throws(() => selectE2eDatabaseUrl({ E2E_DATABASE_URL }), error => {
      assert.equal(error.message, 'E2E_DATABASE_URL must identify the disposable CI PostgreSQL service');
      assert.ok(!error.message.includes(E2E_DATABASE_URL));
      assert.ok(!error.message.includes('private-value'));
      return true;
    });
  }
});

test('E2E rejects case-insensitive inherited names and conflicting environment aliases', () => {
  assert.throws(() => selectE2eDatabaseUrl({ database_url: 'postgres://app:private-value@production.example/app' }), /Refusing inherited DATABASE_URL/);
  assert.equal(selectE2eDatabaseUrl({ e2e_database_url: service }), service);
  assert.throws(() => selectE2eDatabaseUrl({ E2E_DATABASE_URL: service, e2e_database_url: 'private-value' }), /Conflicting E2E database environment settings/);
  assert.throws(() => selectE2eDatabaseUrl({ E2E_DATABASE_URL: service, DATABASE_URL: service, database_url: 'private-value' }), /Conflicting E2E database environment settings/);
});
