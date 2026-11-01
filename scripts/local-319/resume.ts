// Resume only the explicitly verified local DB; never seed, migrate, create or delete a DB.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { startStack } from '../../apps/api/tests/helpers/stack.ts';
delete process.env.DATABASE_URL;
const config=JSON.parse(readFileSync(new URL('../../.local/319/preserved-runtime.json',import.meta.url),'utf8'));
const url=new URL(config.connectionString);
if(url.hostname!=='127.0.0.1' || !/^\/t_[0-9a-f]{12}$/.test(url.pathname) || url.username!=='futureroi_test' || config.port!==4319 || config.origin!=='http://127.0.0.1:5319')throw new Error('Verified local DB required');
const pool=new pg.Pool({connectionString:config.connectionString,max:3});
let localPostgres: { stop: () => Promise<unknown> } | undefined;
try { await pool.query('select 1'); } catch (error) {
  if ((error as NodeJS.ErrnoException).code!=='ECONNREFUSED') throw error;
  const localRoot=fileURLToPath(new URL('../../apps/api/.local/',import.meta.url));
  const cluster=resolve(config.cluster);
  if(!cluster.startsWith(join(localRoot,'pg-test-')) || !existsSync(join(cluster,'data/PG_VERSION')))throw new Error('Existing owned cluster required');
  const credential=JSON.parse(readFileSync(join(cluster,'credential.json'),'utf8'));
  if(credential.user!==url.username || credential.password!==decodeURIComponent(url.password))throw new Error('Local cluster identity mismatch');
  const {default: EmbeddedPostgres}=await import('embedded-postgres');
  const {pg_ctl}=await import(`@embedded-postgres/windows-${process.arch}`) as {pg_ctl:string};
  const {createWindowsEmbeddedStop}=await import('../../apps/api/tests/helpers/windows-embedded-stop.ts');
  const server=new EmbeddedPostgres({databaseDir:join(cluster,'data'),user:credential.user,password:credential.password,port:Number(url.port),persistent:true,onLog:()=>{},onError:()=>{}});
  server.stop=createWindowsEmbeddedStop(pg_ctl,join(cluster,'data'));
  await server.start();
  localPostgres=server;
}
const count=(await pool.query('select (select count(*) from goal)::int as goals,(select count(*) from action_log)::int as logs')).rows[0];
const stack=await startStack({connectionString:config.connectionString,pool,close:()=>pool.end()},{baseURL:config.origin});
await stack.app.listen({host:'127.0.0.1',port:config.port});
console.log('Resumed local API with preserved data at 127.0.0.1:'+config.port+'; goals='+count.goals+' logs='+count.logs);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void(async()=>{await stack.close();await pool.end();await localPostgres?.stop();process.exit(0)})());
