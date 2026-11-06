// E2E uses a newly created synthetic database. Never inherit the application's DB.
// The only external admin connection accepted here is the workflow's disposable
// PostgreSQL service, with its public CI-only credential. Local runs use embedded PG.
const CI_DATABASE_URL = 'postgres://futureroi:ci-only-placeholder@127.0.0.1:5432/futureroi';

function setting(env, name) {
  // Windows environment names are case-insensitive; reject conflicting aliases
  // in supplied environments as well instead of choosing an arbitrary value.
  const values = Object.entries(env).filter(([key]) => key.toUpperCase() === name)
    .map(([, value]) => value).filter(value => value !== undefined && value !== '');
  if (new Set(values).size > 1) throw new Error('Conflicting E2E database environment settings');
  return values[0];
}

export function selectE2eDatabaseUrl(env = process.env) {
  const selected = setting(env, 'E2E_DATABASE_URL');
  const inherited = setting(env, 'DATABASE_URL');
  if (selected !== undefined && selected !== CI_DATABASE_URL) {
    throw new Error('E2E_DATABASE_URL must identify the disposable CI PostgreSQL service');
  }
  if (inherited !== undefined && inherited !== selected) {
    throw new Error('Refusing inherited DATABASE_URL; E2E requires an isolated database');
  }
  return selected;
}
