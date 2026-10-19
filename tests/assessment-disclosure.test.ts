import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
import {canRevealSolutions,toStudentAttempt,toLegacyAttempt} from '../lib/assessment/projection';
let f:PlatformFixture,s:typeof import('../lib/assessment/service'),a:typeof import('../lib/assignments/service'),classId:string,materialId:string;
const now=new Date('2026-10-17T12:00:00Z'),clock=()=>now;
beforeAll(async()=>{f=await openPlatformFixture('disclosure');s=await import('../lib/assessment/service');a=await import('../lib/assignments/service');
 classId=(await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Math',enrollments:{create:{studentId:f.student.id}}}})).id;
 materialId=(await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Secrets',subject:'Math',grade:7,contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'single',prompt:'Выбор',points:2,options:[{id:'a',label:'Первый'},{id:'b',label:'Второй'}],correctOptionIds:['a'],explanation:'SECRET_KEY_EXPLANATION'},{id:'o',kind:'open',prompt:'Объяснение',points:3,criteria:'SECRET_KEY_CRITERIA'}]}]}}})).id;
});afterAll(async()=>{await f?.close();});
async function issued(extra={}){return a.createAssignment(f.teacher,classId,{materialId,materialVersion:1,keysConfirmed:true,title:'Secrets',kind:'test',...extra});}
async function finished(extra={}){const assignment=await issued(extra);const p=await s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock);const done=await s.submitAttempt(f.student,assignment.id,p.id,{version:1,answers:{q:'b',o:'Мой ответ'}},clock);return {assignment,done};}
const hidden=(value:unknown)=>{const text=JSON.stringify(value);expect(text).not.toContain('SECRET_KEY');for(const name of ['correctOptionIds','acceptedAnswers','criteria','explanation','"correct"','snapshotJson','reviewJson','resultJson'])expect(text).not.toContain(name);};
describe('server controlled solution disclosure',()=>{
 it('whitelists hidden results, including pending score and own answers',async()=>{
  const {assignment,done}=await finished();const view=await s.getStudentAttemptView(f.student,assignment.id,done.id,clock);
  hidden(view);expect(view.result).toMatchObject({score:null,autoScore:0,maxScore:5});expect(view.answers).toEqual({q:'b',o:'Мой ответ'});
  expect(view.questions[0]).toEqual({id:'q',kind:'single',prompt:'Выбор',points:2,answerLines:1,options:[{id:'a',label:'Первый'},{id:'b',label:'Второй'}]});
 });
 it('manually publishes only with no active work and permanently closes new starts/quota increases',async()=>{
  const assignment=await issued();const p=await s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock);
  await expect(a.releaseSolutions(f.teacher,assignment.id,{version:1},clock)).rejects.toMatchObject({status:409});
  await s.submitAttempt(f.student,assignment.id,p.id,{version:1,answers:{q:'b'}},clock);
  await a.releaseSolutions(f.teacher,assignment.id,{version:1},clock);
  const view=await s.getStudentAttemptView(f.student,assignment.id,p.id,clock);expect(JSON.stringify(view)).toContain('SECRET_KEY_EXPLANATION');
  await expect(a.updateAssignment(f.teacher,assignment.id,{version:2,maxAttempts:2})).rejects.toMatchObject({status:409});
  await expect(s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock)).rejects.toMatchObject({status:409});
 });
 it('reveals after_due exactly at deadline, never to an active attempt',async()=>{
  const {assignment,done}=await finished({answerPolicy:'after_due',dueDate:'2026-10-17T12:05:00Z'});
  hidden(await s.getStudentAttemptView(f.student,assignment.id,done.id,clock));
  const view=await s.getStudentAttemptView(f.student,assignment.id,done.id,()=>new Date('2026-10-17T12:05:00Z'));expect(view.result?.solutions).toHaveLength(2);
  const row=await f.client.assignment.findUniqueOrThrow({where:{id:assignment.id}});expect(row.disclosureLockedAt).not.toBeNull();expect(row.solutionsReleasedAt).toBeNull();
 });
 it('after_last is personal, does not expose previous attempts while the final one is active',async()=>{
  const {assignment,done}=await finished({answerPolicy:'after_last',maxAttempts:2});
  hidden(await s.getStudentAttemptView(f.student,assignment.id,done.id,clock));
  const active=await s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock);
  hidden(await s.getStudentAttemptView(f.student,assignment.id,active.id,clock));hidden(await s.getStudentAttemptView(f.student,assignment.id,done.id,clock));
  await s.submitAttempt(f.student,assignment.id,active.id,{version:1,answers:{q:'b'}},clock);
  expect((await s.getStudentAttemptView(f.student,assignment.id,active.id,clock)).result?.solutions).toHaveLength(2);
  await expect(a.updateAssignment(f.teacher,assignment.id,{version:1,maxAttempts:3})).rejects.toMatchObject({status:409});
  await f.client.enrollment.create({data:{classId,studentId:f.outsider.id}});
  const other=await s.startAttempt(f.outsider,assignment.id,{requestId:crypto.randomUUID()},clock);
  hidden(await s.getStudentAttemptView(f.outsider,assignment.id,other.id,clock));
 });
 it('cannot reopen deadline-disclosed keys by extending the deadline or changing the disclosure policy',async()=>{
  const {assignment,done}=await finished({answerPolicy:'after_due',maxAttempts:2,dueDate:'2026-10-17T12:05:00Z'});
  const after=()=>new Date('2026-10-17T12:05:00Z');
  expect((await s.getStudentAttemptView(f.student,assignment.id,done.id,after)).result?.solutions).toHaveLength(2);
  const row=await f.client.assignment.findUniqueOrThrow({where:{id:assignment.id}});
  expect(row.closedAt).not.toBeNull();
  await expect(a.updateAssignment(f.teacher,assignment.id,{version:row.version,closed:false,dueDate:'2026-10-20T12:00:00Z',answerPolicy:'manual'})).rejects.toMatchObject({status:409});
  await expect(s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},after)).rejects.toMatchObject({status:409});
 });
 it('allows new-attempt policy changes without extending a started timer or deleting old attempts',async()=>{
  const assignment=await issued({maxAttempts:2});const active=await s.startAttempt(f.student,assignment.id,{requestId:crypto.randomUUID()},clock);
  await a.updateAssignment(f.teacher,assignment.id,{version:1,maxAttempts:1,durationMinutes:90,dueDate:'2026-10-18T12:00:00Z'});
  expect((await s.loadAttempt(f.student,assignment.id,active.id,clock)).expiresAt).toEqual(active.expiresAt);
  expect(await f.client.assessmentAttempt.count({where:{assignmentId:assignment.id}})).toBe(1);
 });
 it('rechecks policy changed between load and disclosure gate without returning stale keys',async()=>{
  const {assignment,done}=await finished({answerPolicy:'after_last'});const store=await import('../lib/assessment/store'),real=store.runAssessmentBatch;let change=true;
  const spy=vi.spyOn(store,'runAssessmentBatch').mockImplementation(async statements=>{if(change){change=false;await f.client.assignment.update({where:{id:assignment.id},data:{answerPolicy:'manual',version:{increment:1}}});}return real(statements);});
  try{hidden(await s.getStudentAttemptView(f.student,assignment.id,done.id,clock));}finally{spy.mockRestore();}
 });
 it('serializes disclosure with quota changes and release with admission',async()=>{
  const {assignment,done}=await finished({answerPolicy:'after_last'});
  const race=await Promise.allSettled([s.getStudentAttemptView(f.student,assignment.id,done.id,clock),a.updateAssignment(f.teacher,assignment.id,{version:1,maxAttempts:2})]);
  const row=await f.client.assignment.findUniqueOrThrow({where:{id:assignment.id}});
  const view=race[0];if(row.maxAttempts===2){expect(row.disclosureLockedAt).toBeNull();if(view.status==='fulfilled')hidden(view.value);}else{expect(row.disclosureLockedAt).not.toBeNull();expect(race[1].status).toBe('rejected');}
  const second=await issued();const races=await Promise.allSettled([a.releaseSolutions(f.teacher,second.id,{version:1},clock),s.startAttempt(f.student,second.id,{requestId:crypto.randomUUID()},clock)]);
  expect(races.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 });
 it('never returns raw historical answer/result keys and never treats a lock flag as global permission',()=>{
  const legacy=toLegacyAttempt({id:'old',score:2,createdAt:now,materialId:'m',material:{title:'Старая'},answersJson:{answers:{q:'Свой ввод'},maxScore:5,result:[{answer:'SECRET_KEY_OLD',correct:true}]}});
  hidden(legacy);expect(legacy.answers).toEqual({q:'Свой ввод'});expect(legacy.maxScore).toBe(5);
  const assignment:any={answerPolicy:'after_last',maxAttempts:2,disclosureLockedAt:now,solutionsReleasedAt:null,assessmentAttempts:[]};
  expect(canRevealSolutions(assignment,{status:'graded',studentId:'s'} as any,1,now)).toBe(false);
  expect(canRevealSolutions(assignment,{status:'in_progress',studentId:'s'} as any,2,now)).toBe(false);
 });
});
