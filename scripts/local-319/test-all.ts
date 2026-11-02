// Every existing test file is run. Milestone's own DB guard requires an unset
// DATABASE_URL locally, so that file retains its separate embedded database.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTestDatabase } from '../../apps/api/tests/helpers/database.ts';
delete process.env.DATABASE_URL;
const db = await createTestDatabase();
if (!['127.0.0.1','localhost'].includes(new URL(db.connectionString).hostname)) throw new Error('Local DB required');
const npm = join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const files = readdirSync('apps/api/tests',{recursive:true}).map(String).filter(file=>file.endsWith('.test.ts')).map(file=>'apps/api/tests/'+file.replaceAll('\\','/')).sort();
const milestone = files.filter(file=>file==='apps/api/tests/milestone.test.ts');
const shared = files.filter(file=>!milestone.includes(file));
if (milestone.length!==1 || new Set([...shared,...milestone]).size!==files.length) throw new Error('Incomplete test inventory');
const run = async (name: string,args: string[],localOnly=false) => {
  console.log('Running '+name);
  const env={...process.env};
  if(!localOnly) env.DATABASE_URL=db.connectionString;
  else delete env.DATABASE_URL;
  const child=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true});
  const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code ?? 1))});
  if(code!==0)throw new Error(name+' failed with exit '+code);
};
try {
  await run('prediction build',[npm,'run','build:prediction']);
  await run('prediction tests',[npm,'run','test','--workspace=@futureroi/prediction']);
  await run('API tests ('+shared.length+' files)',['--test','--test-concurrency=1',...shared]);
  await run('milestone tests (unchanged local DB guard)',['--test',...milestone],true);
  await run('web tests',[npm,'run','test','--workspace=@futureroi/web']);
  console.log('All '+files.length+' API test files and prediction/web tests completed.');
} finally { await db.close(); }
