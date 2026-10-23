// Isolated acceptance harness: never opens an existing database or remote provider.
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';import {createServer} from 'node:http';
import Database from 'better-sqlite3';
import {quizFixture,articleFixture} from '../tests/helpers/online-content';
import {BANK} from '../lib/learning/bank';
const origin=new URL(process.env.EDUPILOT_TEST_URL||'http://127.0.0.1:3400');
if(origin.origin!=='http://127.0.0.1:3400'||process.env.EDUPILOT_QA_RELEASE)throw Error('Only isolated local acceptance is allowed.');
const root=mkdtempSync(join(tmpdir(),'edupilot-stage1-preview-')),file=join(root,'qa.db'),storage=join(root,'storage');mkdirSync(storage);
mkdirSync('work/online-learning-e2e',{recursive:true});writeFileSync('work/online-learning-e2e/runtime.json',JSON.stringify({file,root}));
const sql=new Database(file);try{for(const name of readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort())sql.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));}finally{sql.close();}
const upstream=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
 let raw='';for await(const bytes of req){raw+=bytes;if(raw.length>100000){res.writeHead(413).end();return;}}
 try{const request=JSON.parse(raw),system=String(request.messages?.[0]?.content||'');
  if(req.headers.authorization!=='Bearer synthetic-local-only')throw Error('Fixture credentials only');
  const user=String(request.messages.find((m:{role:string})=>m.role==='user').content),online=system.includes('онлайн-контрольную');
  const library=/Создай ОДНО учебное задание/.test(user),topic=/Тема (\w+), уровень ([123])/.exec(user);
  const content=system.includes('notes-article')?articleFixture():online?quizFixture(JSON.parse(user).count||10):library?{...BANK.find(q=>q.topic===topic?.[1]&&q.level===Number(topic?.[2])),id:'draft'}:request.response_format?{demo:false,totalDuration:Number(JSON.parse(user).duration)||45,sections:[{id:'fixture',title:'Учебный пример',body:'Демонстрационный учебный материал',duration:Number(JSON.parse(user).duration)||45}]}:'### Как складывать дроби\n\nСинтетический ответ для проверки интерфейса. Приведите дроби к общему знаменателю и сложите числители.';
  // Delay proves that work survives navigation and is completed by the separate worker.
  setTimeout(()=>{if(!res.destroyed)res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:typeof content==='string'?content:JSON.stringify(content)}}]}));},600);
 }catch{res.writeHead(400).end();}
});
await new Promise<void>((ok,bad)=>{upstream.once('error',bad);upstream.listen(3401,'127.0.0.1',ok);});
const env:NodeJS.ProcessEnv={...process.env,DATABASE_URL:'file:'+file.replaceAll('\\','/'),STORAGE_DIRECTORY:storage,APP_ORIGIN:origin.origin,AI_MODE:'live',AI_API_KEY:'synthetic-local-only',AI_BASE_URL:'http://127.0.0.1:3401/v1',AI_MODEL:'synthetic-fixture',GENERATION_JOBS_ENABLED:'true',NODE_ENV:'production'};
const children:ChildProcess[]=[];let closing=false;
const start=(args:string[])=>{const p=spawn(process.execPath,args,{cwd:resolve('.'),env,stdio:['ignore','inherit','inherit'],windowsHide:true});children.push(p);p.once('exit',()=>{if(!closing){console.error('Isolated acceptance process exited.');void stop(1);}});return p;};
async function stop(code=0){if(closing)return;closing=true;for(const p of children)p.kill();upstream.closeAllConnections();upstream.close();await Promise.all(children.map(p=>p.exitCode!==null?Promise.resolve():new Promise<void>(ok=>p.once('exit',()=>ok()))));if(!root.startsWith(join(tmpdir(),'edupilot-stage1-preview-')))throw Error('Unsafe fixture cleanup');rmSync(root,{recursive:true,force:true});process.exit(code);}
for(const event of ['SIGINT','SIGTERM'] as const)process.once(event,()=>void stop());
start(['--import','tsx','scripts/generation-worker.ts']);
start(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3400']);
console.log('Isolated local acceptance app and worker started; fixture provider only.');
