import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
let f:PlatformFixture,service:typeof import('../lib/assessment/service'),assign:typeof import('../lib/assignments/service'),schoolId:string,materialId:string;
const now=new Date('2026-10-17T12:00:00Z'),clock=()=>now;
beforeAll(async()=>{f=await openPlatformFixture('assessment-start');service=await import('../lib/assessment/service');assign=await import('../lib/assignments/service');
 const c=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Math',enrollments:{create:{studentId:f.student.id}}}});schoolId=c.id;
 materialId=(await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Тест',subject:'Math',grade:7,contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'short',prompt:'2+2',points:1,answerLines:2,acceptedAnswers:['4']}]}]}}})).id;
});afterAll(async()=>{await f?.close();});
async function assignment(extra={}){return assign.createAssignment(f.teacher,schoolId,{materialId,title:'Тест',kind:'test',materialVersion:1,keysConfirmed:true,...extra});}
describe('atomic assessment admission',()=>{
 it('resumes two starts and remembers both request aliases after completion',async()=>{
  const a=await assignment(),requests=[crypto.randomUUID(),crypto.randomUUID()];
  const [one,two]=await Promise.all(requests.map(requestId=>service.startAttempt(f.student,a.id,{requestId},clock)));
  expect(one.id).toBe(two.id);expect(one.expiresAt).toEqual(two.expiresAt);expect(one.number).toBe(1);
  await f.client.assessmentAttempt.update({where:{id:one.id},data:{status:'graded'}});
  for(const requestId of requests)expect((await service.startAttempt(f.student,a.id,{requestId},clock)).id).toBe(one.id);
  await expect(service.startAttempt(f.student,a.id,{requestId:crypto.randomUUID()},clock)).rejects.toMatchObject({status:409});
 });
 it('uses deadline, blocks outsiders/teachers and rechecks closed assignment inside insert',async()=>{
  const a=await assignment({dueDate:'2026-10-17T12:06:00Z'});
  expect((await service.startAttempt(f.student,a.id,{requestId:crypto.randomUUID()},clock)).expiresAt.toISOString()).toBe('2026-10-17T12:06:00.000Z');
  await expect(service.startAttempt(f.outsider,a.id,{requestId:crypto.randomUUID()},clock)).rejects.toMatchObject({status:404});
  await expect(service.startAttempt(f.teacher,a.id,{requestId:crypto.randomUUID()},clock)).rejects.toMatchObject({status:403});
  const b=await assignment();
  const store=await import('../lib/assessment/store');const real=store.runAssessmentBatch;let once=true;
  const spy=vi.spyOn(store,'runAssessmentBatch').mockImplementation(async statements=>{if(once){once=false;await f.client.assignment.update({where:{id:b.id},data:{closedAt:now,version:{increment:1}}});}return real(statements);});
  try{await expect(service.startAttempt(f.student,b.id,{requestId:crypto.randomUUID()},clock)).rejects.toMatchObject({status:409});expect(await f.client.assessmentAttempt.count({where:{assignmentId:b.id}})).toBe(0);}finally{spy.mockRestore();}
 });
 it('serializes admission across real independent worker connections',async()=>{
  const a=await assignment(),store=await import('../lib/assessment/store');
  const require=createRequire(import.meta.url),{transformSync}=require('esbuild');
  const source=transformSync(readFileSync('lib/assessment/local-store.ts','utf8'),{loader:'ts',format:'cjs'}).code;
  const gate=new SharedArrayBuffer(4),control=new Int32Array(gate);
  const workers=[1,2].map(i=>new Worker(`const {parentPort,workerData}=require('node:worker_threads');${source};parentPort.postMessage('ready');Atomics.wait(new Int32Array(workerData.gate),0,0);try{parentPort.postMessage({result:module.exports.runLocalBatch(workerData.file,workerData.statements)})}catch(e){parentPort.postMessage({error:e.message})}`,{eval:true,workerData:{gate,file:f.file,statements:store.buildAdmissionBatch({id:crypto.randomUUID(),assignmentId:a.id,studentId:f.student.id,requestId:crypto.randomUUID(),variantId:'v',version:1,now})}}));
  await Promise.all(workers.map(w=>new Promise<void>((resolve,reject)=>{w.once('message',()=>resolve());w.once('error',reject);})));Atomics.store(control,0,1);Atomics.notify(control,0);
  const results=await Promise.all(workers.map(w=>new Promise<any>((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);})));await Promise.all(workers.map(w=>w.terminate()));
  expect(results.every(r=>!r.error)).toBe(true);expect(results[0].result.at(-1).rows[0].id).toBe(results[1].result.at(-1).rows[0].id);
  expect(await f.client.assessmentAttempt.count({where:{assignmentId:a.id}})).toBe(1);expect(await f.client.assessmentStartRequest.count({where:{assignmentId:a.id}})).toBe(2);
 });
});
