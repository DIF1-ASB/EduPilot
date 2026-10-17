import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { openPlatformFixture, type PlatformFixture } from './helpers/platform';
let f:PlatformFixture,service:typeof import('../lib/assignments/service'),classId:string,materialId:string;
const assessment={schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[{id:'q',kind:'short',prompt:'2+2',points:2,answerLines:2,acceptedAnswers:['4'],explanation:'PRIVATE_SNAPSHOT'}]}]};
beforeAll(async()=>{
 f=await openPlatformFixture('assignments');service=await import('../lib/assignments/service');
 const c=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Математика',enrollments:{create:{studentId:f.student.id}}}});classId=c.id;
 const m=await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Тест',subject:'Математика',grade:7,status:'ready',contentJson:assessment}});materialId=m.id;
});afterAll(async()=>{await f?.close();});
const createInput=()=>({materialId,title:'Назначенная работа',kind:'test',materialVersion:1,keysConfirmed:true});
describe('assignment ownership and snapshots',()=>{
 it('creates distinct immutable snapshots and projects no test questions before start',async()=>{
  const a=await service.createAssignment(f.teacher,classId,createInput());const b=await service.createAssignment(f.teacher,classId,createInput());
  expect(a.id).not.toBe(b.id);expect((a as any).snapshot).toEqual(assessment);
  const student=await service.readAssignment(f.student,a.id);
  expect(student).toMatchObject({id:a.id,kind:'test',policy:{maxAttempts:1,durationMinutes:45,answerPolicy:'manual'}});
  expect(JSON.stringify(student)).not.toContain('2+2');expect(JSON.stringify(student)).not.toContain('PRIVATE_SNAPSHOT');
  await f.client.material.update({where:{id:materialId},data:{version:2,contentJson:{...assessment,instructions:'Новая редакция'}}});
  expect((await service.readAssignment(f.teacher,a.id) as any).snapshot.instructions).toBe('Решите');
  await expect(service.createAssignment(f.teacher,classId,createInput())).rejects.toMatchObject({status:409});
 });
 it('validates date, answer policy, role and explicit teacher key confirmation',async()=>{
  for(const change of [{dueDate:'bad'},{answerPolicy:'after_due'},{keysConfirmed:false},{kind:'homework'}])
   await expect(service.createAssignment(f.teacher,classId,{...createInput(),materialVersion:2,...change})).rejects.toMatchObject({status:expect.any(Number)});
  await expect(service.createAssignment(f.student,classId,{...createInput(),materialVersion:2})).rejects.toMatchObject({status:403});
  const foreign=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'Другой',subject:'Math'}});
  await expect(service.createAssignment(f.outsider,foreign.id,createInput())).rejects.toMatchObject({status:403});
 });
 it('rechecks enrollment for each read and keeps same material assignments isolated',async()=>{
  const a=await service.createAssignment(f.teacher,classId,{...createInput(),materialVersion:2});
  await expect(service.readAssignment(f.outsider,a.id)).rejects.toMatchObject({status:404});
  await f.client.enrollment.deleteMany({where:{classId,studentId:f.student.id}});
  await expect(service.readAssignment(f.student,a.id)).rejects.toMatchObject({status:404});
  expect(await service.listAssignments(f.student)).toEqual([]);
  await f.client.enrollment.create({data:{classId,studentId:f.student.id}});
 });
 it('allows homework replacement before grading/deadline, not test bypass or another student submission',async()=>{
  const m=await f.client.material.create({data:{userId:f.teacher.id,type:'worksheet',title:'Домашняя',subject:'Math',grade:7,contentJson:{demo:false,sections:[{id:'s',title:'Задание',body:'Решите',answer:'PRIVATE_HOMEWORK'}]}}});
  const a=await service.createAssignment(f.teacher,classId,{materialId:m.id,title:'ДЗ',kind:'homework'});
  const first=await service.submitHomework(f.student,a.id,{text:'Первый ответ'});const second=await service.submitHomework(f.student,a.id,{text:'Исправление'});
  expect(first.id).toBe(second.id);expect(second.text).toBe('Исправление');
  await expect(service.submitHomework(f.outsider,a.id,{text:'Чужой'})).rejects.toMatchObject({status:404});
  const view=await service.readAssignment(f.student,a.id);expect(JSON.stringify(view)).not.toContain('PRIVATE_HOMEWORK');
  expect((await service.readAssignment(f.teacher,a.id) as any).submissions[0].studentName).toBe('student Synthetic');
  await f.client.grade.create({data:{submissionId:second.id,score:1,maxScore:2,teacherComment:'Проверено',approvedAt:new Date()}});
  await expect(service.submitHomework(f.student,a.id,{text:'Позднее'})).rejects.toMatchObject({status:409});
  const test=await service.createAssignment(f.teacher,classId,{...createInput(),materialVersion:2});
  await expect(service.submitHomework(f.student,test.id,{text:'Обход'})).rejects.toMatchObject({status:422});
  const overdue=await service.createAssignment(f.teacher,classId,{materialId:m.id,title:'Срок',kind:'homework',dueDate:'2020-01-01T00:00:00Z'});
  await expect(service.submitHomework(f.student,overdue.id,{text:'Поздно'})).rejects.toMatchObject({status:422});
 });
});
