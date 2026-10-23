import {describe,it,expect} from 'vitest';
import {openPlatformFixture} from './helpers/platform';
import {quizFixture,articleFixture} from './helpers/online-content';
import {spawnSync} from 'node:child_process';
const enabled=async<T>(fn:()=>T)=>(await import('../lib/runtime')).withRuntime({GENERATION_JOBS_ENABLED:'true'},fn);
describe('bounded persistent generation worker',()=>{
 it('runs the CLI once against an isolated fixture using its explicit mock provider',async()=>{
  const f=await openPlatformFixture('generation-cli');try{await enabled(async()=>{
   const {createGeneration,getGeneration}=await import('../lib/generation/service');const job=await createGeneration(f.teacher,{requestId:crypto.randomUUID(),kind:'test',input:{title:'Уравнения',subject:'Математика',grade:7}});
   const result=spawnSync(process.execPath,['--import','tsx','scripts/generation-worker.ts','--once'],{encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,DATABASE_URL:'file:'+f.file.replaceAll('\\','/'),STORAGE_DIRECTORY:f.storagePath,AI_MODE:'mock',AI_API_KEY:'',GENERATION_JOBS_ENABLED:'true'}});
   expect(result.stderr).not.toContain('API_KEY');expect(result.status,result.stderr).toBe(0);expect((await getGeneration(f.teacher,job.id)).state).toBe('completed');
  });}finally{await f.close();}
 },30000);
 it('makes one draft atomically, remains idempotent, and repairs invalid replies only once',async()=>{
  const f=await openPlatformFixture('generation-worker');try{await enabled(async()=>{
   const {createGeneration,getGeneration}=await import('../lib/generation/service');const {processGenerationBatch}=await import('../lib/generation/worker');const {MockAIProvider,InvalidGeneratedContent}=await import('../lib/ai');
   class ValidProvider extends MockAIProvider {demo=false;async generateOnlineTest(){return quizFixture() as any;}}
   const job=await createGeneration(f.teacher,{requestId:crypto.randomUUID(),kind:'test',input:{title:'Уравнения',subject:'Математика',grade:7}});
   expect(await processGenerationBatch({provider:new ValidProvider()})).toBe(1);expect(await processGenerationBatch({provider:new ValidProvider()})).toBe(0);
   const result=await getGeneration(f.teacher,job.id);expect(result.state).toBe('completed');expect(result.materialId).toBeTruthy();expect(await f.client.material.count()).toBe(1);expect((await f.client.material.findFirst())?.status).toBe('draft');
   let calls=0;class InvalidProvider extends MockAIProvider {demo=false;async generateOnlineTest():Promise<any>{calls++;throw new InvalidGeneratedContent('{}','Количество вопросов');}}
   const bad=await createGeneration(f.teacher,{requestId:crypto.randomUUID(),kind:'test',input:{title:'Уравнения',subject:'Математика',grade:7}});await processGenerationBatch({provider:new InvalidProvider()});expect(calls).toBe(2);expect((await getGeneration(f.teacher,bad.id)).state).toBe('failed');expect(await f.client.material.count()).toBe(1);
  });}finally{await f.close();}
 });
 it('caps concurrency across two worker processes and never persists a cancelled result',async()=>{
  const f=await openPlatformFixture('generation-concurrency');try{await enabled(async()=>{
   const {createGeneration,cancelGeneration,getGeneration}=await import('../lib/generation/service');const {processGenerationBatch}=await import('../lib/generation/worker');const {MockAIProvider}=await import('../lib/ai');
   const jobs=[];for(const actor of [f.teacher,f.student,f.outsider])jobs.push(await createGeneration(actor,{requestId:crypto.randomUUID(),kind:'notes',input:{title:'Клетка',subject:'Биология',grade:6}}));
   let calls=0,release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),twoStarted=new Promise<void>(r=>started=r);
   class SlowProvider extends MockAIProvider {demo=false;async generateArticle(){calls++;if(calls===2)started();await gate;return articleFixture() as any;}}
   const workers=Promise.all([processGenerationBatch({provider:new SlowProvider()}),processGenerationBatch({provider:new SlowProvider()})]);await twoStarted;
   expect(calls).toBe(2);expect(await f.client.generationJob.count({where:{state:{in:['running','validating']}}})).toBe(2);
   const running=await f.client.generationJob.findFirst({where:{state:'running'}});const owner=[f.teacher,f.student,f.outsider].find(a=>a.id===running!.ownerId)!;await cancelGeneration(owner,running!.id);
   class FastProvider extends MockAIProvider {demo=false;async generateArticle(){return articleFixture() as any;}}
   const additional=await processGenerationBatch({provider:new FastProvider()});release();await workers;
   expect(additional).toBe(0);
   expect((await getGeneration(owner,running!.id)).state).toBe('cancelled');expect(await f.client.material.count()).toBe(1);
  });}finally{await f.close();}
 });
 it('turns an abandoned lease into a retryable failure without replaying upstream',async()=>{
  const f=await openPlatformFixture('generation-recovery');try{await enabled(async()=>{
   const {createGeneration,getGeneration}=await import('../lib/generation/service');const {recoverExpiredJobs}=await import('../lib/generation/worker');const job=await createGeneration(f.teacher,{requestId:crypto.randomUUID(),kind:'test',input:{title:'Уравнения',subject:'Математика',grade:7}});
   await f.client.generationJob.update({where:{id:job.id},data:{state:'running',leaseUntil:new Date(0),deadlineAt:new Date(0)}});expect(await recoverExpiredJobs(()=>new Date())).toBe(1);const result=await getGeneration(f.teacher,job.id);expect(result.state).toBe('failed');expect(result.error?.retryable).toBe(true);expect(await f.client.material.count()).toBe(0);
  });}finally{await f.close();}
 });
});
