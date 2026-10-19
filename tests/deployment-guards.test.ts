import {describe,it,expect} from 'vitest';
import {planDeployment,validateDeploymentFacts,runCutover,parseRuntimeEnv,serviceIsStopped} from '../scripts/ops/deploy-stage1.mjs';
import {execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const inputs={releasePath:'/opt/edupilot/releases/abcdef123456',dataPath:'/var/lib/edupilot/edupilot.db',storagePath:'/var/lib/edupilot/storage',runtimeEnvPath:'/etc/edupilot/runtime.env',priorRelease:'/opt/edupilot/releases/34a909'};
const proof=()=>({commit:'abcdef123456',buildPassed:true,testsPassed:true,archiveSha256:'a'.repeat(64),backupSha256:'b'.repeat(64),externalBackupSha256:'b'.repeat(64),rehearsalOk:true});
const facts=()=>({databaseExists:true,realDataPath:inputs.dataPath,realStoragePath:inputs.storagePath,realRuntimeEnvPath:inputs.runtimeEnvPath,realReleasePath:inputs.releasePath,realPriorRelease:inputs.priorRelease,databaseUrl:'file:'+inputs.dataPath,archiveSha256:'a'.repeat(64),backupSha256:'b'.repeat(64),proof:proof()});
describe('non-destructive deployment guards',()=>{
 it('rejects wrong paths, missing database, symlink escape, wrong runtime DB and unverified evidence before any cutover',()=>{
  const plan=planDeployment(inputs);expect(plan.releasePath).toBe(inputs.releasePath);
  for(const releasePath of ['/var/lib/edupilot/releases/abcdef','/opt/edupilot/releases/../current','/opt/edupilot/current'])expect(()=>planDeployment({...inputs,releasePath})).toThrow();
  for(const patch of [{databaseExists:false},{realDataPath:'/tmp/other.db'},{realStoragePath:'/tmp/storage'},{realReleasePath:'/var/lib/edupilot/release'},{databaseUrl:'file:/tmp/new.db'},{archiveSha256:'c'.repeat(64)},{backupSha256:'c'.repeat(64)},{proof:null},{proof:{...proof(),rehearsalOk:false}},{proof:{...proof(),externalBackupSha256:'c'.repeat(64)}},{proof:{...proof(),buildPassed:false}}])expect(()=>validateDeploymentFacts(plan,{...facts(),...patch})).toThrow();
  expect(()=>validateDeploymentFacts(plan,facts())).not.toThrow();
 });
 it('reads runtime values without shell expansion or disclosing them',()=>{
  expect(parseRuntimeEnv('DATABASE_URL="file:/var/lib/edupilot/edupilot.db"\nAI_API_KEY=synthetic-$literal\n')).toEqual({DATABASE_URL:'file:/var/lib/edupilot/edupilot.db',AI_API_KEY:'synthetic-$literal'});
  expect(()=>parseRuntimeEnv('export SECRET=x')).toThrow();
 });
 it('accepts systemd inactive exit3, but rejects missing or failed services',()=>{
  const read=(status:number,state:string)=>()=>execFileSync(process.execPath,['-e',`process.stdout.write(${JSON.stringify(state)});process.exit(${status})`],{encoding:'utf8'});
  expect(serviceIsStopped(read(3,'inactive\n'))).toBe(true);expect(serviceIsStopped(read(0,'active\n'))).toBe(false);expect(()=>serviceIsStopped(read(4,'inactive\n'))).toThrow();
 });
 it.each(['migrate','verifyPreservation','smoke'])('keeps maintenance and preserves current rows on %s failure; never restores old DB',async(stage)=>{
  const root=mkdtempSync(join(tmpdir(),'edupilot-cutover-')),file=join(root,'current.db'),snapshot=join(root,'failure.db'),sql=new Database(file);sql.exec('CREATE TABLE Account(id TEXT PRIMARY KEY); INSERT INTO Account VALUES(\'old\')');const state={maintenance:true,current:'old',opened:false,preserved:false};
  try{const op=async(name:string)=>{if(name===stage)throw Error('Injected failure');};
   await expect(runCutover(planDeployment(inputs),{
    assertQuiescent:async()=>{if(!state.maintenance)throw Error('Writes are open');},
    captureBaseline:async()=>{},migrate:async()=>{sql.exec("INSERT INTO Account VALUES('new-preserve-me')");await op('migrate');},verifyPreservation:()=>op('verifyPreservation'),
    switchRelease:async()=>{state.current='new';},start:async()=>{},smoke:()=>op('smoke'),open:async()=>{state.opened=true;state.maintenance=false;},
    preserveCurrent:async()=>{await sql.backup(snapshot);state.preserved=true;},leaveMaintenance:async()=>{state.maintenance=true;},
   })).rejects.toThrow();
   expect(state.opened).toBe(false);expect(state.maintenance).toBe(true);expect(state.preserved).toBe(true);expect(sql.prepare('SELECT count(*) n FROM Account').get()).toEqual({n:2});const saved=new Database(snapshot,{readonly:true,fileMustExist:true});try{expect(saved.prepare('SELECT count(*) n FROM Account').get()).toEqual({n:2});}finally{saved.close();}
  }finally{sql.close();rmSync(root,{recursive:true,force:true});}
 });
 it('opens writes only after preservation comparison and smoke pass',async()=>{
  const order:string[]=[];const operations=Object.fromEntries(['assertQuiescent','captureBaseline','migrate','verifyPreservation','switchRelease','start','smoke','open','preserveCurrent','leaveMaintenance'].map(name=>[name,async()=>{order.push(name);}])) as any;
  expect(await runCutover(planDeployment(inputs),operations)).toMatchObject({state:'open'});expect(order).toEqual(['assertQuiescent','captureBaseline','migrate','verifyPreservation','switchRelease','start','smoke','open']);
 });
});
