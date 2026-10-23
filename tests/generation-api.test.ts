import {describe,it,expect} from 'vitest';
import {openPlatformFixture} from './helpers/platform';
const enabled=async<T>(fn:()=>T)=>(await import('../lib/runtime')).withRuntime({GENERATION_JOBS_ENABLED:'true'},fn);
const payload=()=>({requestId:crypto.randomUUID(),kind:'test',input:{title:'Уравнения',subject:'Математика',grade:7}});
describe('private durable generation API',()=>{
 it('enforces roles, owner access, idempotency, active limit and cancellation',async()=>{
  const f=await openPlatformFixture('generation-api');
  try{await enabled(async()=>{
   const input=payload();expect((await f.call('generation-jobs','POST',input,f.student.cookie)).status).toBe(403);
   const first=await f.call('generation-jobs','POST',input,f.teacher.cookie);expect(first.status).toBe(201);const job:any=await first.json();expect(job.state).toBe('queued');
   const repeated=await f.call('generation-jobs','POST',input,f.teacher.cookie);expect((await repeated.json() as any).id).toBe(job.id);
   expect((await f.call('generation-jobs','POST',{...input,input:{...input.input,title:'Другой запрос'}},f.teacher.cookie)).status).toBe(409);
   expect((await f.call('generation-jobs','POST',payload(),f.teacher.cookie)).status).toBe(409);
   expect((await f.call('generation-jobs/'+job.id,'GET',undefined,f.outsider.cookie)).status).toBe(403);
   const list:any=await(await f.call('generation-jobs','GET',undefined,f.teacher.cookie)).json();expect(list).toHaveLength(1);expect(JSON.stringify(list)).not.toMatch(/inputJson|rawReply|correctOptionIds|API_KEY/);
   const cancel:any=await(await f.call('generation-jobs/'+job.id+'/cancel','POST',{},f.teacher.cookie)).json();expect(cancel.state).toBe('cancelled');
   expect((await f.call('generation-jobs','POST',payload(),f.teacher.cookie)).status).toBe(201);
   const notes=await f.call('generation-jobs','POST',{requestId:crypto.randomUUID(),kind:'notes',input:{title:'Клетка',subject:'Биология',grade:6}},f.student.cookie);expect(notes.status).toBe(201);
  });}finally{await f.close();}
 },20000);
 it('is opt-in and explicitly unavailable on cloud rather than leaving a queued job',async()=>{
  const f=await openPlatformFixture('generation-disabled');try{
   const {withRuntime}=await import('../lib/runtime');const {getGeneration}=await import('../lib/generation/service');
   expect((await withRuntime({GENERATION_JOBS_ENABLED:'false'},()=>f.call('generation-jobs','POST',payload(),f.teacher.cookie))).status).toBe(503);
   await expect(withRuntime({DB:{} as D1Database,GENERATION_JOBS_ENABLED:'true'},()=>getGeneration(f.teacher,'x'))).rejects.toMatchObject({status:503});
  }finally{await f.close();}
 });
});
