import {describe,it,expect} from 'vitest';
import {assessmentHistoryFixture} from './helpers/assessment-history';
describe('assessment progress source of truth',()=>{
 it('uses the latest finalized attempt without double counters and excludes drafts or demos',async()=>{
  const f=await assessmentHistoryFixture('assessment-progress');try{
   const {studentAssessmentProgress}=await import('../lib/learning/assessment-progress');await f.seed(1,2);await f.seed(2,4);await f.seed(3,null,'in_progress');
   const demo=await f.client.assignment.create({data:{classId:f.group.id,materialId:f.material.id,title:'Демо',kind:'test',snapshotJson:{...f.doc,demo:true}}});await f.seed(1,5,'graded',f.student.id,demo.id);
   const dto=await studentAssessmentProgress(f.student.id);expect(dto.history).toHaveLength(2);expect(dto.latest).toHaveLength(1);expect(dto.totals.percentage).toBe(80);expect(dto.totals.score).toBe(4);expect(dto.totals.maxScore).toBe(5);expect(dto.totals.completedWorks).toBe(1);
   expect(await studentAssessmentProgress(f.student.id)).toEqual(dto);expect(JSON.stringify(dto)).not.toMatch(/PRIVATE_|correctOptionIds|submittedAnswersJson|explanation|criteria/);expect(await f.client.trainingAttempt.count()).toBe(0);
   await f.client.material.update({where:{id:f.material.id},data:{title:'Переименованный источник',subject:'Физика',grade:10}});const unchanged=await studentAssessmentProgress(f.student.id);expect(unchanged.history[0]).toMatchObject({topic:'Линейные уравнения',subject:'Математика',grade:7,contextSource:'snapshot'});
  }finally{await f.close();}
 },20000);
 it('does not replace pending review with an old grade or a zero and updates in place after review',async()=>{
  const f=await assessmentHistoryFixture('assessment-pending');try{
   const {studentAssessmentProgress}=await import('../lib/learning/assessment-progress');await f.seed(1,4);const pending=await f.seed(2,null);
   let dto=await studentAssessmentProgress(f.student.id);expect(dto.latest[0].percentage).toBeNull();expect(dto.totals.percentage).toBeNull();expect(dto.totals.maxScore).toBe(0);expect(dto.totals.awaitingReview).toBe(1);
   const {reviewAttempt}=await import('../lib/assessment/service');await reviewAttempt(f.teacher,f.assignment.id,pending.id,{version:1,marks:[{questionId:'open',points:3,comment:'Проверено'}]});
   dto=await studentAssessmentProgress(f.student.id);expect(dto.history).toHaveLength(2);expect(dto.latest[0].attemptId).toBe(pending.id);expect(dto.totals.percentage).toBe(60);expect(dto.totals.awaitingReview).toBe(0);
  }finally{await f.close();}
 },20000);
 it('keeps personal history after leaving the class and restricts teacher filters to owned classes',async()=>{
  const f=await assessmentHistoryFixture('assessment-history-access');try{
   const {studentAssessmentProgress,teacherAssessmentProgress}=await import('../lib/learning/assessment-progress');await f.seed(1,3);await f.client.enrollment.deleteMany({where:{classId:f.group.id,studentId:f.student.id}});
   expect((await studentAssessmentProgress(f.student.id)).totals.percentage).toBe(60);expect((await teacherAssessmentProgress(f.teacher.id,{classId:f.group.id,studentId:f.student.id})).history).toHaveLength(1);
   await expect(teacherAssessmentProgress(f.teacher.id,{studentId:f.outsider.id})).rejects.toMatchObject({status:403});await expect(teacherAssessmentProgress(f.outsider.id,{classId:f.group.id})).rejects.toMatchObject({status:403});
  }finally{await f.close();}
 },20000);
 it('reads 150 past students through bounded joins without a giant IN list',async()=>{
  const f=await assessmentHistoryFixture('assessment-many');try{
   const {teacherAssessmentProgress}=await import('../lib/learning/assessment-progress');const users=Array.from({length:150},(_,i)=>({id:'past-student-'+i,firstName:'Ученик',lastName:String(i),email:`past-${i}@example.invalid`,passwordHash:'synthetic-no-login',role:'student'}));await f.client.user.createMany({data:users});
   await f.client.assessmentAttempt.createMany({data:users.map(u=>({assignmentId:f.assignment.id,studentId:u.id,number:1,startRequestId:crypto.randomUUID(),variantId:'v1',startedAt:new Date('2026-10-20T10:00:00Z'),expiresAt:new Date('2026-10-20T10:45:00Z'),status:'graded',draftAnswersJson:{},submittedAt:new Date('2026-10-20T10:01:00Z'),completionKind:'submitted',resultJson:{score:3,maxScore:5}}))});
   const dto=await teacherAssessmentProgress(f.teacher.id,{});expect(dto.history).toHaveLength(150);expect(dto.totals.percentage).toBe(60);expect(dto.totals.completedWorks).toBe(150);
  }finally{await f.close();}
 },20000);
});
