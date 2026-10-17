import assert from 'node:assert/strict';
import {withRuntime} from '../../lib/runtime';import {db} from '../../lib/database';
import {createAssignment,releaseSolutions,readAssignment} from '../../lib/assignments/service';
import {startAttempt,loadAttempt,saveDraft,submitAttempt,reviewAttempt,getStudentAttemptView} from '../../lib/assessment/service';
import {runAssessmentBatch} from '../../lib/assessment/store';
export async function runAssessmentD1Contract(binding:D1Database){
 return withRuntime({DB:binding,AI_MODE:'mock'},async()=>{
  const client=await db(),teacher={id:'d1-teacher',role:'teacher' as const},student={id:'d1-student',role:'student' as const},now=new Date('2026-10-17T12:00:00Z'),clock=()=>now;
  try{
   for(const actor of [teacher,student])await client.user.create({data:{id:actor.id,firstName:actor.role,lastName:'Synthetic',email:actor.id+'@example.invalid',role:actor.role,passwordHash:'synthetic-no-login'}});
   const school=await client.schoolClass.create({data:{teacherId:teacher.id,name:'D1 fixture',subject:'Math',enrollments:{create:{studentId:student.id}}}});
   const material=await client.material.create({data:{userId:teacher.id,type:'test',title:'D1 contract',subject:'Math',grade:7,contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'numeric',prompt:'Половина',points:2,acceptedAnswers:['1/2'],explanation:'SECRET_D1_KEY'},{id:'o',kind:'open',prompt:'Почему',points:3,criteria:'SECRET_D1_CRITERIA'}]}]}}});
   const issued=()=>createAssignment(teacher,school.id,{materialId:material.id,materialVersion:1,keysConfirmed:true,title:'D1 test',kind:'test',durationMinutes:5});
   const assignment=await issued(),requests=Array.from({length:20},()=>crypto.randomUUID());
   const admitted=await Promise.all(requests.map(requestId=>startAttempt(student,assignment.id,{requestId},clock)));
   assert.equal(new Set(admitted.map(a=>a.id)).size,1);assert.equal(await client.assessmentAttempt.count(),1);assert.equal(await client.assessmentStartRequest.count(),20);
   const p=admitted[0];assert.equal(p.expiresAt.getTime()-p.startedAt.getTime(),300000);
   const raw=await binding.prepare('SELECT startedAt FROM AssessmentAttempt WHERE id=?').bind(p.id).first<{startedAt:string}>();assert.equal(raw?.startedAt,now.toISOString().replace('Z','+00:00'));
   const drafts=await Promise.allSettled(Array.from({length:20},(_,i)=>saveDraft(student,assignment.id,p.id,{version:1,answers:{q:'0.5',o:'Ответ '+i}},clock)));assert.equal(drafts.filter(r=>r.status==='fulfilled').length,1);
   const current=await loadAttempt(student,assignment.id,p.id,clock);
   const submitted=await Promise.all(Array.from({length:20},()=>submitAttempt(student,assignment.id,p.id,{version:current.version,answers:current.draftAnswersJson},clock)));
   assert.equal(new Set(submitted.map(r=>JSON.stringify(r.submittedAnswersJson))).size,1);assert.equal(submitted[0].status,'pending_review');
   const hidden=await getStudentAttemptView(student,assignment.id,p.id,clock);assert.equal(hidden.result?.score,null);assert.ok(!JSON.stringify(hidden).includes('SECRET_D1'));
   const reviews=await Promise.allSettled(Array.from({length:20},(_,i)=>reviewAttempt(teacher,assignment.id,p.id,{version:submitted[0].version,marks:[{questionId:'o',points:i%4,comment:'Ручная проверка'}]})));assert.equal(reviews.filter(r=>r.status==='fulfilled').length,1);
   const graded=await loadAttempt(student,assignment.id,p.id,clock);assert.equal(graded.status,'graded');assert.equal((await readAssignment(student,assignment.id) as any).bestScore,(graded.resultJson as any).score);
   for(const requestId of requests)assert.equal((await startAttempt(student,assignment.id,{requestId},clock)).id,p.id);
   await assert.rejects(()=>startAttempt(student,assignment.id,{requestId:crypto.randomUUID()},clock),{status:409});
   await releaseSolutions(teacher,assignment.id,{version:1},clock);assert.equal((await getStudentAttemptView(student,assignment.id,p.id,clock)).result?.solutions?.length,2);
   const second=await issued(),active=await startAttempt(student,second.id,{requestId:crypto.randomUUID()},clock);
   await assert.rejects(()=>releaseSolutions(teacher,second.id,{version:1},clock),{status:409});
   const expired=await submitAttempt(student,second.id,active.id,{version:1,answers:{q:'0.5',o:'Late unsaved answer'}},()=>active.expiresAt);assert.equal(expired.completionKind,'expired');assert.deepEqual(expired.submittedAnswersJson,{});assert.equal((expired.resultJson as any).score,0);
   await assert.rejects(()=>runAssessmentBatch([{sql:'INSERT INTO RateLimit(key,count,expiresAt) VALUES(?,?,?)',params:['d1-must-rollback',1,1900000000000]},{sql:'INSERT INTO MissingContractTable(id) VALUES(?)',params:['bad']} ]));
   assert.equal(await client.rateLimit.findUnique({where:{key:'d1-must-rollback'}}),null);
   await client.enrollment.deleteMany({where:{classId:school.id,studentId:student.id}});await assert.rejects(()=>getStudentAttemptView(student,assignment.id,p.id,clock),{status:404});
   const fk=await binding.prepare('PRAGMA foreign_key_check').all();assert.equal(fk.results.length,0);
   return {admissions:20,uniqueAttempts:1,aliases:20,draftCAS:true,submitIdempotent:true,reviewCAS:true,expiry:true,disclosure:true,rollback:true,revocation:true,timestamps:'ISO8601 +00:00',foreignKeys:true};
  }finally{await client.$disconnect();}
 });
}
