import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const DATA='/var/lib/edupilot/edupilot.db',STORAGE='/var/lib/edupilot/storage',ENV='/etc/edupilot/runtime.env',CURRENT='/opt/edupilot/current',NGINX='/etc/nginx/conf.d/edupilot.conf',NODE='/opt/node-v22.23.3-linux-x64/bin/node';
const release=p=>typeof p==='string'&&/^\/opt\/edupilot\/releases\/[a-f0-9]{6,40}$/.test(p);
const demand=(ok,message)=>{if(!ok)throw Error(message);};
export function planDeployment(input){
 demand(release(input.releasePath)&&release(input.priorRelease)&&input.releasePath!==input.priorRelease,'Invalid release paths');
 demand(input.dataPath===DATA&&input.storagePath===STORAGE&&input.runtimeEnvPath===ENV,'Unexpected persistent paths');
 return {...input,currentPath:CURRENT,states:['verified','quiescent','migrated','preserved','switched','smoke','open']};
}
export function validateDeploymentFacts(plan,facts){
 demand(facts.databaseExists&&facts.realDataPath===plan.dataPath&&facts.realStoragePath===plan.storagePath&&facts.realRuntimeEnvPath===plan.runtimeEnvPath&&facts.realReleasePath===plan.releasePath&&facts.realPriorRelease===plan.priorRelease,'Missing path or symlink escape');
 demand(facts.databaseUrl==='file:'+plan.dataPath,'Unexpected DATABASE_URL');const p=facts.proof;
 demand(p&&p.commit===path.posix.basename(plan.releasePath)&&p.buildPassed===true&&p.testsPassed===true&&p.rehearsalOk===true,'Missing build/test/rehearsal evidence');
 for(const key of ['archiveSha256','backupSha256'])demand(/^[a-f0-9]{64}$/.test(p[key]??'')&&p[key]===facts[key],'Archive or backup checksum differs');
 demand(p.externalBackupSha256===p.backupSha256,'No independently verified external backup');return true;
}
export function parseRuntimeEnv(source){
 const result=Object.create(null);for(const raw of source.split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);demand(match,'Unsupported runtime environment syntax');let value=match[2];if(value.startsWith('"')||value.startsWith("'")){demand(value.length>=2&&value.at(-1)===value[0],'Unclosed environment quote');value=value.slice(1,-1);}result[match[1]]=value;}return result;
}
export async function runCutover(plan,ops){
 let state='verified';try{await ops.assertQuiescent();state='quiescent';await ops.captureBaseline();await ops.migrate();state='migrated';await ops.verifyPreservation();state='preserved';await ops.switchRelease();state='switched';await ops.start();await ops.smoke();state='smoke';await ops.open();return {state:'open',release:plan.releasePath};}
 catch(error){try{await ops.leaveMaintenance();}finally{await ops.preserveCurrent();}throw Error(`Deployment stopped at ${state}; current data preserved, maintenance retained.`,{cause:error});}
}
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const command=(bin,args,options={})=>execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
export function serviceIsStopped(read=()=>command('systemctl',['is-active','edupilot'])){try{return read().trim()==='inactive';}catch(error){if(error.status===3&&String(error.stdout).trim()==='inactive')return true;throw error;}}
function protectedFile(file,prefix){demand(typeof file==='string'&&file.startsWith(prefix)&&!file.includes('/../'),'Unsafe evidence path');demand(fs.realpathSync(file)===file,'Evidence symlink');const s=fs.statSync(file);demand(s.isFile()&&s.uid===0&&(s.mode&0o077)===0,'Evidence must be root-only');return fs.readFileSync(file);}
async function main(){
 demand(process.platform==='linux'&&process.getuid()===0,'Run as root on the approved Linux VPS');const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];demand(args.includes('--release')&&args.includes('--proof')&&(args.includes('--dry-run')!==args.includes('--apply')),'Required: --release --proof and exactly one of --dry-run/--apply');
 const proofPath=get('--proof'),proof=JSON.parse(protectedFile(proofPath,'/root/edupilot-deploy/').toString()),releasePath=get('--release'),priorRelease=fs.realpathSync(CURRENT),plan=planDeployment({releasePath,priorRelease,dataPath:DATA,storagePath:STORAGE,runtimeEnvPath:ENV});
 const runtime=parseRuntimeEnv(protectedFile(ENV,'/etc/edupilot/').toString());
 const build=JSON.parse(fs.readFileSync(path.join(releasePath,'.stage1-build.json'),'utf8'));demand(build.commit===proof.commit&&build.archiveSha256===proof.archiveSha256&&build.passed===true,'Release build evidence differs');
 const stat=fs.statSync(releasePath);demand(stat.uid===0&&(stat.mode&0o022)===0&&fs.existsSync(path.join(releasePath,'.next/BUILD_ID')),'Release is unbuilt or writable');
 protectedFile(proof.archivePath,'/root/edupilot-deploy/');protectedFile(proof.backupPath,'/var/backups/edupilot/');
 const report=JSON.parse(protectedFile(proof.rehearsalReportPath,'/root/edupilot-deploy/').toString());demand(report.ok===true,'Rehearsal failed');
 validateDeploymentFacts(plan,{databaseExists:fs.existsSync(DATA)&&fs.statSync(DATA).isFile(),realDataPath:fs.realpathSync(DATA),realStoragePath:fs.realpathSync(STORAGE),realRuntimeEnvPath:fs.realpathSync(ENV),realReleasePath:fs.realpathSync(releasePath),realPriorRelease:priorRelease,databaseUrl:runtime.DATABASE_URL,archiveSha256:sha(proof.archivePath),backupSha256:sha(proof.backupPath),proof});
 demand(sha(proof.nginxOriginalPath)===proof.nginxOriginalSha256,'Original Nginx config changed');const original=protectedFile(proof.nginxOriginalPath,'/root/edupilot-deploy/'),maintenance=fs.readFileSync(NGINX);demand(createHash('sha256').update(maintenance).digest('hex')===proof.maintenanceSha256,'Maintenance configuration differs');
 demand(serviceIsStopped(),'Service must already be stopped after maintenance/drain');
 const require=createRequire(import.meta.url),{captureManifest,compareManifest}=require('./data-manifest.cjs'),Database=require('better-sqlite3'),key=protectedFile(proof.keyPath,'/root/edupilot-deploy/');demand(key.length===32,'Bad manifest key');const before=JSON.parse(protectedFile(proof.beforeManifestPath,'/root/edupilot-deploy/').toString()),columnsByTable=Object.fromEntries(before.tables.map(t=>[t.name,t.columns]));
 const capture=()=>captureManifest(DATA,{storagePath:STORAGE,key,columnsByTable});demand(compareManifest(before,capture()).ok,'Live state differs from the final rehearsed backup');
 if(args.includes('--dry-run')){console.log(JSON.stringify({state:'verified',release:releasePath,priorRelease}));return;}
 const writeNginx=bytes=>{fs.writeFileSync(NGINX,bytes,{mode:0o644});command('nginx',['-t']);command('systemctl',['reload','nginx']);};
 const result=await runCutover(plan,{
  assertQuiescent:async()=>{demand(sha(NGINX)===proof.maintenanceSha256,'Writes may be open');demand(serviceIsStopped(),'Service active');},
  captureBaseline:async()=>{demand(compareManifest(before,capture()).ok,'Final baseline mismatch');},
  migrate:async()=>{command('runuser',['-u','edupilot','--',NODE,path.join(releasePath,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:releasePath,env:{...process.env,...runtime,PATH:path.dirname(NODE)+':'+process.env.PATH},maxBuffer:4*1024*1024});},
  verifyPreservation:async()=>{const after=capture(),result=compareManifest(before,after);fs.writeFileSync(proofPath+'.comparison.json',JSON.stringify(result),{mode:0o600,flag:'wx'});demand(result.ok,'Migration changed historical data');},
  switchRelease:async()=>{const next='/opt/edupilot/.stage1-next-'+proof.commit;demand(!fs.existsSync(next),'Temporary link exists');fs.symlinkSync(releasePath,next);fs.renameSync(next,CURRENT);},
  start:async()=>{command('systemctl',['start','edupilot']);},
  smoke:async()=>{let ready=false;for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:3000/',{headers:{Host:'edupilotmfua.ru','X-Forwarded-Proto':'https'}});if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}demand(ready,'Application did not become ready');const r=await fetch('http://127.0.0.1:3000/api/assignments',{headers:{Host:'edupilotmfua.ru','X-Forwarded-Proto':'https'}});demand(r.status===401,'Anonymous authorization smoke failed');},
  open:async()=>{writeNginx(original);},
  leaveMaintenance:async()=>{writeNginx(maintenance);command('systemctl',['stop','edupilot']);},
  preserveCurrent:async()=>{const dir=fs.mkdtempSync('/var/backups/edupilot/stage1-failed-');fs.chmodSync(dir,0o700);const db=new Database(DATA,{readonly:true,fileMustExist:true});try{await db.backup(path.join(dir,'edupilot.db'));}finally{db.close();}fs.cpSync(STORAGE,path.join(dir,'storage'),{recursive:true,errorOnExist:true,force:false});},
 });
 fs.writeFileSync(proofPath+'.result.json',JSON.stringify({...result,completedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});console.log(JSON.stringify(result));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(()=>{console.error('Stage1 deployment refused or stopped. Do not restore an old database over live data; inspect protected evidence.');process.exitCode=1;});
