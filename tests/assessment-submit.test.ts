import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
let f:PlatformFixture,s:typeof import('../lib/assessment/service'),a:typeof import('../lib/assignments/service'),classId:string,materialId:string;
const start=new Date('2026-10-17T12:00:00Z'),clock=()=>start;
beforeAll(async()=>{f=await openPlatformFixture('assessment-submit');s=await import('../lib/assessment/service');a=await import('../lib/assignments/service');
 classId=(await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Math',enrollments:{create:{studentId:f.student.id}}}})).id;
 materialId=(await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Mixed',subject:'Math',grade:7,contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'numeric',prompt:'Половина',points:2,acceptedAnswers:['0.5']},{id:'o',kind:'open',prompt:'Почему',points:3,criteria:'Обоснование'}]}]}}})).id;
});afterAll(async()=>{await f?.close();});
async function attempt(){const assignment=await a.createAssignment(f.teacher,classId,{materialId,materialVersion:1,keysConfirmed:true,title:'Mixed',kind:'test'});const attempt=await s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock);return {id:assignment.id,attempt};}
describe('durable attempt lifecycle',()=>{
 it('keeps empty manual submission active and restores draft after reload with CAS conflict protection',async()=>{
  const {id,attempt:p}=await attempt();
  await expect(s.submitAttempt(f.student,id,p.id,{version:1,answers:{}},clock)).rejects.toMatchObject({status:422});
  expect((await s.loadAttempt(f.student,id,p.id,clock)).status).toBe('in_progress');
  const saved=await s.saveDraft(f.student,id,p.id,{version:1,answers:{q:'1/2'}},clock);expect(saved.version).toBe(2);
  await expect(s.saveDraft(f.student,id,p.id,{version:1,answers:{q:'bad'}},clock)).rejects.toMatchObject({status:409});
  expect((await s.loadAttempt(f.student,id,p.id,clock)).draftAnswersJson).toEqual({q:'1/2'});
 });
 it('finalizes once, returns recorded result on lost response retry and rejects late autosave',async()=>{
  const {id,attempt:p}=await attempt();
  const final=await s.submitAttempt(f.student,id,p.id,{version:1,answers:{q:'0,5'}},clock);
  expect(final).toMatchObject({status:'graded',completionKind:'submitted',resultJson:{autoScore:2,score:2,maxScore:5}});
  const retry=await s.submitAttempt(f.student,id,p.id,{version:999,answers:{q:'0'}},clock);
  expect(retry.resultJson).toEqual(final.resultJson);expect(retry.submittedAnswersJson).toEqual({q:'0,5'});
  await expect(s.saveDraft(f.student,id,p.id,{version:1,answers:{q:'0'}},clock)).rejects.toMatchObject({status:409});
 });
 it('expires at the exact server boundary using only saved draft, including empty zero attempts',async()=>{
  const {id,attempt:p}=await attempt();await s.saveDraft(f.student,id,p.id,{version:1,answers:{q:'1/2'}},clock);
  const final=await s.submitAttempt(f.student,id,p.id,{version:2,answers:{q:'0',o:'Unsaved late text'}},()=>p.expiresAt);
  expect(final).toMatchObject({status:'graded',completionKind:'expired',submittedAnswersJson:{q:'1/2'},resultJson:{score:2}});
  const empty=await attempt(),expired=await s.loadAttempt(f.student,empty.id,empty.attempt.id,()=>empty.attempt.expiresAt);
  expect(expired).toMatchObject({status:'graded',completionKind:'expired',resultJson:{score:0}});
  await expect(s.startAttempt(f.student,empty.id,{requestId:crypto.randomUUID()},()=>empty.attempt.expiresAt)).rejects.toMatchObject({status:409});
 });
 it('requires bounded manual marks by owning teacher and rejects racing/stale reviews',async()=>{
  const {id,attempt:p}=await attempt();const pending=await s.submitAttempt(f.student,id,p.id,{version:1,answers:{q:'1/2',o:'Объяснение'}},clock);
  expect(pending).toMatchObject({status:'pending_review',resultJson:{score:null,autoScore:2,pendingQuestionIds:['o']}});
  expect((await a.readAssignment(f.student,id) as any).bestScore).toBeNull();
  expect((await a.readAssignment(f.teacher,id) as any).attempts[0].score).toBeNull();
  await expect(s.reviewAttempt(f.student,id,p.id,{version:pending.version,marks:[{questionId:'o',points:3,comment:'X'}]})).rejects.toMatchObject({status:403});
  for(const marks of [[{questionId:'o',points:4,comment:''}],[{questionId:'q',points:2,comment:''}],[]])await expect(s.reviewAttempt(f.teacher,id,p.id,{version:pending.version,marks})).rejects.toMatchObject({status:400});
  const graded=await s.reviewAttempt(f.teacher,id,p.id,{version:pending.version,marks:[{questionId:'o',points:2,comment:'Нужен пример'}]});
  expect(graded).toMatchObject({status:'graded',resultJson:{score:4,maxScore:5}});
  await expect(s.reviewAttempt(f.teacher,id,p.id,{version:pending.version,marks:[{questionId:'o',points:0,comment:'Race'}]})).rejects.toMatchObject({status:409});
  expect((await a.readAssignment(f.student,id) as any).bestScore).toBe(4);
  expect((await a.readAssignment(f.teacher,id) as any).attempts[0]).toMatchObject({score:4,maxScore:5});
 });
 it('admits only one concurrent review and one concurrent final answer',async()=>{
  const {id,attempt:p}=await attempt();
  const submissions=await Promise.allSettled([{q:'0.5',o:'Текст'},{q:'0',o:'Другой текст'}].map(answers=>s.submitAttempt(f.student,id,p.id,{version:1,answers},clock)));
  expect(submissions.every(r=>r.status==='fulfilled')).toBe(true);
  const pending=await s.loadAttempt(f.teacher,id,p.id,clock);
  const original=pending.submittedAnswersJson;
  const reviews=await Promise.allSettled([1,3].map(points=>s.reviewAttempt(f.teacher,id,p.id,{version:pending.version,marks:[{questionId:'o',points,comment:'Проверка'}]})));
  expect(reviews.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(reviews.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await s.loadAttempt(f.student,id,p.id,clock)).submittedAnswersJson).toEqual(original);
 });
});
