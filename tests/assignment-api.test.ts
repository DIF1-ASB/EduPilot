import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
let f:PlatformFixture,classId:string,materialId:string,assignmentId:string,attemptId:string;
beforeAll(async()=>{f=await openPlatformFixture('assignment-api');
 classId=(await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Math',enrollments:{create:{studentId:f.student.id}}}})).id;
 materialId=(await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Secrets',subject:'Math',grade:7,metadataJson:{secret:'SECRET_METADATA'},contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'single',prompt:'PRIVATE_BEFORE_START',points:2,options:[{id:'a',label:'Первый'},{id:'b',label:'Второй'}],correctOptionIds:['a'],explanation:'SECRET_API_KEY'}]}]}}})).id;
});afterAll(async()=>{await f?.close();});
const body=()=>({materialId,materialVersion:1,keysConfirmed:true,title:'Назначение',kind:'test'});
const noSecret=(x:unknown)=>{expect(JSON.stringify(x)).not.toContain('SECRET_');expect(JSON.stringify(x)).not.toContain('correctOptionIds');};
describe('assignment HTTP boundary',()=>{
 it('protects creation and listing by role, authentication and csrf',async()=>{
  expect((await f.call('assignments')).status).toBe(401);
  expect((await f.call(`classes/${classId}/assignment`,'POST',body(),f.student.cookie)).status).toBe(403);
  const response=await f.call(`classes/${classId}/assignment`,'POST',body(),f.teacher.cookie);expect(response.status).toBe(201);assignmentId=(await response.json() as any).id;
  const list=await f.call('assignments?kind=test','GET',undefined,f.student.cookie);expect(list.status).toBe(200);expect(list.headers.get('cache-control')).toBe('no-store');
  const data:any=await list.json();expect(data[0].id).toBe(assignmentId);noSecret(data);expect(JSON.stringify(data)).not.toContain('PRIVATE_BEFORE_START');
  expect((await f.call('assignments?kind=bad','GET',undefined,f.student.cookie)).status).toBe(400);
  expect((await f.call('assignments/'+assignmentId,'GET',undefined,f.outsider.cookie)).status).toBe(404);
  const {POST}=await import('../app/api/[...path]/route');expect((await POST(new Request(`http://127.0.0.1:3000/api/assignments/${assignmentId}/start`,{method:'POST',headers:{Origin:'https://evil.invalid',Cookie:f.student.cookie,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID()})}))).status).toBe(403);
 });
 it('closes legacy start/submit for both roles without writing and protects pre-start material paths',async()=>{
  const before=await f.client.quizSession.count(),attempts=await f.client.quizAttempt.count();
  for(const actor of [f.teacher,f.student])for(const action of ['quiz-start','quiz'])expect((await f.call(`materials/${materialId}/${action}`,'POST',{answers:{q:'a'}},actor.cookie)).status).toBe(410);
  expect(await f.client.quizSession.count()).toBe(before);expect(await f.client.quizAttempt.count()).toBe(attempts);
  const detail=await f.call('materials/'+materialId,'GET',undefined,f.student.cookie);expect(detail.status).toBe(200);const ref:any=await detail.json();
  expect(ref.assignments).toEqual([{id:assignmentId,title:'Назначение',kind:'test'}]);expect(JSON.stringify(ref)).not.toContain('PRIVATE_BEFORE_START');noSecret(ref);
  expect((await f.call(`materials/${materialId}/export?answers=true&format=docx`,'GET',undefined,f.student.cookie)).status).toBe(409);
  const second=await f.call(`classes/${classId}/assignment`,'POST',body(),f.teacher.cookie);expect(second.status).toBe(201);
  const multiple:any=await(await f.call('materials/'+materialId,'GET',undefined,f.student.cookie)).json();expect(multiple.assignments).toHaveLength(2);expect(multiple).not.toHaveProperty('redirect');
 });
 it('returns only gated DTO for start, draft, submit, detail and history; rejects impersonation',async()=>{
  expect((await f.call(`assignments/${assignmentId}/start`,'POST',{requestId:crypto.randomUUID()},f.teacher.cookie)).status).toBe(403);
  const start=await f.call(`assignments/${assignmentId}/start`,'POST',{requestId:crypto.randomUUID(),studentId:f.outsider.id,score:99,variantId:'evil',expiresAt:'2100-01-01'},f.student.cookie);expect(start.status).toBe(200);
  const started:any=await start.json();attemptId=started.id;expect(started.variantId).toBe('v');expect(started.questions[0].prompt).toBe('PRIVATE_BEFORE_START');noSecret(started);
  expect((await f.call(`assignments/${assignmentId}/attempts/${attemptId}`,'GET',undefined,f.outsider.cookie)).status).toBe(404);
  expect((await f.call(`assignments/${assignmentId}/attempts/${attemptId}/draft`,'PATCH',{version:1,answers:{q:'unknown'}},f.student.cookie)).status).toBe(400);
  const draft=await f.call(`assignments/${assignmentId}/attempts/${attemptId}/draft`,'PATCH',{version:1,answers:{q:'b'}},f.student.cookie);expect(draft.status).toBe(200);noSecret(await draft.json());
  expect((await f.call(`assignments/${assignmentId}/export?attemptId=${attemptId}&format=pdf&answers=true`,'GET',undefined,f.student.cookie)).status).toBe(409);
  expect((await f.call(`assignments/${assignmentId}/attempts/${attemptId}/submit`,'POST',{version:2,answers:{}},f.student.cookie)).status).toBe(422);
  const submit=await f.call(`assignments/${assignmentId}/attempts/${attemptId}/submit`,'POST',{version:2,answers:{q:'b'}},f.student.cookie);expect(submit.status).toBe(200);const result:any=await submit.json();expect(result.result.score).toBe(0);noSecret(result);
  const retry=await f.call(`assignments/${assignmentId}/attempts/${attemptId}/submit`,'POST',{version:1,answers:{q:'a'}},f.student.cookie);expect((await retry.json() as any).result.score).toBe(0);
  for(const path of [`assignments/${assignmentId}/attempts`, `assignments/${assignmentId}/attempts/${attemptId}`,`assignments/${assignmentId}`]){const r=await f.call(path,'GET',undefined,f.student.cookie);expect(r.status).toBe(200);noSecret(await r.json());}
  expect((await f.call(`assignments/${assignmentId}/start`,'POST',{requestId:crypto.randomUUID()},f.student.cookie)).status).toBe(409);
 });
 it('protects settings/review/release and sanitizes historical records',async()=>{
  expect((await f.call(`assignments/${assignmentId}`,'PATCH',{version:1,maxAttempts:2},f.student.cookie)).status).toBe(403);
  expect((await f.call(`assignments/${assignmentId}/release`,'POST',{version:1},f.outsider.cookie)).status).toBe(403);
  expect((await f.call(`assignments/${assignmentId}/attempts/${attemptId}/review`,'POST',{version:1,marks:[]},f.student.cookie)).status).toBe(403);
  await f.client.quizAttempt.create({data:{userId:f.student.id,materialId,score:1,answersJson:{maxScore:2,answers:{old:'Мой ответ'},result:[{answer:'SECRET_LEGACY',correct:true}]}}});
  const history=await f.call('attempts','GET',undefined,f.student.cookie);expect(history.status).toBe(200);noSecret(await history.json());
  expect((await f.call(`assignments/${assignmentId}/release`,'POST',{version:1},f.teacher.cookie)).status).toBe(200);
  const revealed:any=await(await f.call(`assignments/${assignmentId}/attempts/${attemptId}`,'GET',undefined,f.student.cookie)).json();expect(revealed.result.solutions[0].answer).toEqual(['a']);
 });
});
