import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';import {Worker} from 'node:worker_threads';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
let f:PlatformFixture,s:typeof import('../lib/assessment/service'),a:typeof import('../lib/assignments/service'),store:typeof import('../lib/assessment/store'),classId:string,materialId:string;
const now=new Date(),clock=()=>now;
beforeAll(async()=>{f=await openPlatformFixture('concurrency');s=await import('../lib/assessment/service');a=await import('../lib/assignments/service');store=await import('../lib/assessment/store');
 classId=(await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'Parallel',subject:'Math',enrollments:{create:{studentId:f.student.id}}}})).id;
 materialId=(await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Parallel',subject:'Math',grade:7,contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'numeric',prompt:'Половина',points:2,acceptedAnswers:['1/2'],explanation:'SECRET_CONCURRENT_KEY'},{id:'o',kind:'open',prompt:'Объясните',points:3,criteria:'SECRET_CONCURRENT_CRITERIA'}]}]}}})).id;
});afterAll(async()=>{await f?.close();});
const issued=()=>a.createAssignment(f.teacher,classId,{materialId,title:'Parallel',kind:'test',materialVersion:1,keysConfirmed:true});
describe('concurrent assessment regression',()=>{
 it('admits twenty real worker connections once and stores one of twenty competing submissions',async()=>{
  const assignment=await issued(),require=createRequire(import.meta.url),{transformSync}=require('esbuild');
  const source=transformSync(readFileSync('lib/assessment/local-store.ts','utf8'),{loader:'ts',format:'cjs'}).code;
  const shared=new SharedArrayBuffer(4),control=new Int32Array(shared);
  const workers=Array.from({length:20},()=>new Worker(`const {parentPort,workerData}=require('node:worker_threads');${source};parentPort.postMessage('ready');Atomics.wait(new Int32Array(workerData.shared),0,0);try{parentPort.postMessage({result:module.exports.runLocalBatch(workerData.file,workerData.statements)})}catch(e){parentPort.postMessage({error:e.message})}`,{eval:true,workerData:{shared,file:f.file,statements:store.buildAdmissionBatch({id:crypto.randomUUID(),assignmentId:assignment.id,studentId:f.student.id,requestId:crypto.randomUUID(),variantId:'v',version:1,now})}}));
  try{
   await Promise.all(workers.map(w=>new Promise<void>((resolve,reject)=>{w.once('message',()=>resolve());w.once('error',reject);})));const waiting=workers.map(w=>new Promise<any>((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));Atomics.store(control,0,1);Atomics.notify(control,0);
   const values=await Promise.all(waiting);expect(values.every(v=>!v.error)).toBe(true);expect(new Set(values.map(v=>v.result.at(-1).rows[0].id)).size).toBe(1);
   const id=values[0].result.at(-1).rows[0].id;expect(await f.client.assessmentAttempt.count({where:{assignmentId:assignment.id}})).toBe(1);expect(await f.client.assessmentStartRequest.count({where:{assignmentId:assignment.id}})).toBe(20);
   const results=await Promise.all(Array.from({length:20},(_,i)=>s.submitAttempt(f.student,assignment.id,id,{version:1,answers:{q:i%2?'0':'0.5'}},clock)));
   expect(new Set(results.map(r=>JSON.stringify(r.submittedAnswersJson))).size).toBe(1);expect(new Set(results.map(r=>JSON.stringify(r.resultJson))).size).toBe(1);
   const view=await s.getStudentAttemptView(f.student,assignment.id,id,clock);expect(JSON.stringify(view)).not.toContain('SECRET_CONCURRENT');
   for(const path of [`assignments/${assignment.id}/attempts?answers=true`,`assignments/${assignment.id}/attempts/${id}?answers=true`]){const r=await f.call(path,'GET',undefined,f.student.cookie);expect(r.status).toBe(200);expect(JSON.stringify(await r.json())).not.toContain('SECRET_CONCURRENT');}
  }finally{await Promise.all(workers.map(w=>w.terminate()));}
 },20000);
 it('CAS permits one draft and one manual review across twenty competing versions',async()=>{
  const assignment=await issued(),p=await s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock);
  const drafts=await Promise.allSettled(Array.from({length:20},(_,i)=>s.saveDraft(f.student,assignment.id,p.id,{version:1,answers:{o:'Текст '+i}},clock)));expect(drafts.filter(d=>d.status==='fulfilled')).toHaveLength(1);
  const current=await s.loadAttempt(f.student,assignment.id,p.id,clock),done=await s.submitAttempt(f.student,assignment.id,p.id,{version:current.version,answers:current.draftAnswersJson},clock);
  const reviews=await Promise.allSettled(Array.from({length:20},(_,i)=>s.reviewAttempt(f.teacher,assignment.id,p.id,{version:done.version,marks:[{questionId:'o',points:i%4,comment:'Рецензия '+i}]})));expect(reviews.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await s.loadAttempt(f.teacher,assignment.id,p.id,clock)).version).toBe(4);
 });
 it('publication and admission have only one winning side',async()=>{
  const assignment=await issued();const results=await Promise.allSettled(Array.from({length:20},(_,i)=>i%2?a.releaseSolutions(f.teacher,assignment.id,{version:1},clock):s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock)));
  const row=await f.client.assignment.findUniqueOrThrow({where:{id:assignment.id}}),count=await f.client.assessmentAttempt.count({where:{assignmentId:assignment.id}});
  if(row.solutionsReleasedAt){expect(count).toBe(0);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);}else{expect(count).toBe(1);expect(results.filter((r,i)=>i%2&&r.status==='fulfilled')).toHaveLength(0);}
 });
 it('revocation between read and atomic write cannot create an attempt or disclose a result',async()=>{
  const assignment=await issued(),real=store.runAssessmentBatch;let once=true;
  const spy=vi.spyOn(store,'runAssessmentBatch').mockImplementation(async statements=>{if(once){once=false;await f.client.enrollment.deleteMany({where:{classId,studentId:f.student.id}});}return real(statements);});
  try{await expect(s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock)).rejects.toMatchObject({status:409});expect(await f.client.assessmentAttempt.count({where:{assignmentId:assignment.id}})).toBe(0);expect((await f.call('assignments/'+assignment.id,'GET',undefined,f.student.cookie)).status).toBe(404);}finally{spy.mockRestore();await f.client.enrollment.create({data:{classId,studentId:f.student.id}});}
 });
});
