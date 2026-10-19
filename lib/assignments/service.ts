import { z } from 'zod';
import { db } from '../database';
import { fail } from '../security';
import { parseMaterialContent, materialSections } from '../materials/content';
import { validateAssessment } from '../assessment/schema';
import type { Actor } from '../materials/policy';
import type { AssignmentPolicy,AssignmentStudentDTO,TeacherAssignmentDTO,SubmissionDTO } from './contracts';
import type { Prisma } from '@prisma/client';
import {runAssessmentBatch,epochSql,sqlDate} from '../assessment/store';
const due=z.string().datetime({offset:true}).nullable().optional();
export const assignmentPolicySchema=z.object({maxAttempts:z.number().int().min(1).max(10).default(1),durationMinutes:z.number().int().min(5).max(240).default(45),answerPolicy:z.enum(['manual','after_due','after_last']).default('manual'),dueDate:due});
const createSchema=assignmentPolicySchema.extend({materialId:z.string().min(1),title:z.string().trim().min(1).max(200),kind:z.enum(['homework','test']).default('homework'),materialVersion:z.number().int().positive().optional(),keysConfirmed:z.boolean().default(false)});
function parse<T>(schema:z.ZodType<T,any,any>,raw:unknown):T {const r=schema.safeParse(raw);if(!r.success)fail(400,r.error.issues.map(i=>i.message).join('; '));return r.data;}
export function validatePolicy(policy:{answerPolicy:string,dueDate?:string|null}){if(policy.answerPolicy==='after_due'&&!policy.dueDate)fail(400,'Для раскрытия после срока нужен дедлайн.');}
export const assignmentInclude={class:{include:{teacher:{select:{firstName:true,lastName:true}},enrollments:{select:{studentId:true}}}},material:true,
 submissions:{include:{grade:true,student:{select:{firstName:true,lastName:true}}}},assessmentAttempts:{include:{student:{select:{firstName:true,lastName:true}}}}} satisfies Prisma.AssignmentInclude;
export type AssignmentRow=Prisma.AssignmentGetPayload<{include:typeof assignmentInclude}>;
export async function authorizedAssignment(actor:Actor,id:string):Promise<AssignmentRow>{
 const row=await (await db()).assignment.findUnique({where:{id},include:assignmentInclude});
 if(!row || (actor.role==='teacher'?row.class.teacherId!==actor.id:actor.role!=='student'||!row.class.enrollments.some(e=>e.studentId===actor.id)))fail(404,'Задание не найдено.');
 return row;
}
export function assignmentPolicy(row:AssignmentRow):AssignmentPolicy{return {maxAttempts:row.maxAttempts,durationMinutes:row.durationMinutes,answerPolicy:row.answerPolicy as AssignmentPolicy['answerPolicy'],dueDate:row.dueDate?.toISOString()??null};}
export function toSubmission(row:AssignmentRow['submissions'][number]):SubmissionDTO {
 const content=row.contentJson as {text?:unknown};
 return {id:row.id,assignmentId:row.assignmentId,studentId:row.studentId,studentName:row.student.firstName+' '+row.student.lastName,text:typeof content?.text==='string'?content.text:'',submittedAt:row.submittedAt.toISOString(),
 grade:row.grade?{score:row.grade.score,maxScore:row.grade.maxScore,teacherComment:row.grade.teacherComment,approvedAt:row.grade.approvedAt.toISOString()}:null};
}
export function toAssignment(actor:Actor,row:AssignmentRow):AssignmentStudentDTO|TeacherAssignmentDTO{
 const kind=row.kind as 'homework'|'test',policy=assignmentPolicy(row);
 if(actor.role==='teacher')return {id:row.id,kind,title:row.title,classId:row.classId,className:row.class.name,materialId:row.materialId,materialVersion:row.materialVersion,
  policy,version:row.version,snapshot:row.snapshotJson?parseMaterialContent(row.snapshotJson):null,solutionsReleasedAt:row.solutionsReleasedAt?.toISOString()??null,disclosureLockedAt:row.disclosureLockedAt?.toISOString()??null,closedAt:row.closedAt?.toISOString()??null,
  submissions:row.submissions.map(toSubmission),attempts:row.assessmentAttempts.map(a=>{const result=a.resultJson as {score?:number,maxScore?:number}|null;return {id:a.id,studentId:a.studentId,studentName:a.student.firstName+' '+a.student.lastName,number:a.number,status:a.status,score:a.status==='graded'&&typeof result?.score==='number'?result.score:null,maxScore:typeof result?.maxScore==='number'?result.maxScore:null};})};
 const attempts=row.assessmentAttempts.filter(a=>a.studentId===actor.id);
 const scores=attempts.filter(a=>a.status==='graded').map(a=>(a.resultJson as {score?:number}|null)?.score).filter((v):v is number=>typeof v==='number');
 const content=kind==='homework'?materialSections(parseMaterialContent(row.snapshotJson??row.material.contentJson),false):undefined;
 return {id:row.id,kind,title:row.title,classId:row.classId,className:row.class.name,materialId:row.materialId,subject:row.class.subject,teacherName:row.class.teacher.firstName+' '+row.class.teacher.lastName,
  dueDate:policy.dueDate,policy,usedAttempts:attempts.length,bestScore:scores.length?Math.max(...scores):null,version:row.version,closed:!!row.closedAt,
  ...(content?{content:{...content,sections:content.sections.map(({answer,...q})=>q)}}:{}),submission:row.submissions.filter(s=>s.studentId===actor.id).map(toSubmission)[0]??null,
  attempts:attempts.map(a=>({id:a.id,number:a.number,status:a.status}))};
}
export async function readAssignment(actor:Actor,id:string){return toAssignment(actor,await authorizedAssignment(actor,id));}
export async function listAssignments(actor:Actor,kind?:string){
 if(kind!==undefined&&!['homework','test'].includes(kind))fail(400,'Неизвестный тип задания.');
 const rows=await(await db()).assignment.findMany({where:{...(kind?{kind}:{}),class:actor.role==='teacher'?{teacherId:actor.id}:{enrollments:{some:{studentId:actor.id}}}},include:assignmentInclude,orderBy:{id:'desc'}});
 return rows.map(row=>toAssignment(actor,row));
}
export async function createAssignment(actor:Actor,classId:string,raw:unknown){
 if(actor.role!=='teacher')fail(403,'Доступно только преподавателям.');
 const input=parse(createSchema,raw);validatePolicy(input);const client=await db();
 const school=await client.schoolClass.findFirst({where:{id:classId,teacherId:actor.id}});if(!school)fail(404,'Класс не найден.');
 const material=await client.material.findFirst({where:{id:input.materialId,userId:actor.id}});if(!material)fail(404,'Материал не найден.');
 if(material.type==='test'&&input.kind!=='test')fail(422,'Контрольную назначают только как контрольную, с лимитом попыток.');
 let snapshot=parseMaterialContent(material.contentJson);
 if(input.kind==='test'){
  if(material.type!=='test'&&material.type!=='worksheet')fail(422,'Для контрольной нужен тест или рабочий лист.');
  if(!('schemaVersion' in snapshot))fail(422,'Разметьте вопросы старого материала перед назначением.');
  if(input.materialVersion!==material.version)fail(409,'Материал изменён. Проверьте новую редакцию.');
  if(!input.keysConfirmed)fail(422,'Подтвердите ключи и критерии.');
  snapshot=validateAssessment(snapshot,{publishable:true});
 }
 const id=crypto.randomUUID();
 // Conditional INSERT closes the material edit/class ownership race without rewriting the source.
 const inserted=await client.$executeRawUnsafe(`INSERT INTO Assignment(id,classId,materialId,title,dueDate,kind,maxAttempts,durationMinutes,answerPolicy,snapshotJson,materialVersion)
 SELECT ?,?,?,?,?,?,?,?,?,?,? FROM Material m JOIN SchoolClass c ON c.id=?
 WHERE m.id=? AND m.userId=? AND m.version=? AND c.teacherId=?`,id,classId,material.id,input.title,input.dueDate?new Date(input.dueDate).toISOString().replace('Z','+00:00'):null,
 input.kind,input.maxAttempts,input.durationMinutes,input.answerPolicy,JSON.stringify(snapshot),material.version,classId,material.id,actor.id,material.version,actor.id);
 if(!inserted)fail(409,'Материал или класс изменён. Обновите страницу.');
 return readAssignment(actor,id);
}
export async function submitHomework(actor:Actor,id:string,raw:unknown):Promise<SubmissionDTO>{
 if(actor.role!=='student')fail(403,'Отправка доступна ученикам.');
 const input=parse(z.object({text:z.string().trim().min(1).max(20000)}),raw),row=await authorizedAssignment(actor,id);
 if(row.kind!=='homework')fail(422,'Контрольную выполняют в интерфейсе попытки.');
 const now=new Date();if(row.dueDate&&row.dueDate<=now||row.closedAt)fail(422,'Срок сдачи истёк или работа закрыта.');
 const existing=row.submissions.find(s=>s.studentId===actor.id);if(existing?.grade)fail(409,'Работа уже оценена. Обсудите исправления с преподавателем.');
 const client=await db(),submissionId=existing?.id??crypto.randomUUID();
 // A single guarded UPSERT prevents grade/deadline/enrollment races.
 const changed=await client.$executeRawUnsafe(`INSERT INTO Submission(id,assignmentId,studentId,contentJson,submittedAt)
 SELECT ?,a.id,?,?,? FROM Assignment a JOIN Enrollment e ON e.classId=a.classId AND e.studentId=?
 WHERE a.id=? AND a.kind='homework' AND a.closedAt IS NULL AND a.version=?
 AND (a.dueDate IS NULL OR (CASE WHEN typeof(a.dueDate) IN ('integer','real') THEN a.dueDate ELSE (julianday(a.dueDate)-2440587.5)*86400000 END)>?)
 AND NOT EXISTS(SELECT 1 FROM Submission s JOIN Grade g ON g.submissionId=s.id WHERE s.assignmentId=a.id AND s.studentId=?)
 ON CONFLICT(assignmentId,studentId) DO UPDATE SET contentJson=excluded.contentJson,submittedAt=excluded.submittedAt
 WHERE NOT EXISTS(SELECT 1 FROM Grade g WHERE g.submissionId=Submission.id)`,submissionId,actor.id,JSON.stringify({text:input.text}),now.toISOString().replace('Z','+00:00'),actor.id,id,row.version,now.getTime(),actor.id);
 if(!changed)fail(409,'Задание изменено или уже оценено.');
 const result=await client.submission.findUniqueOrThrow({where:{assignmentId_studentId:{assignmentId:id,studentId:actor.id}},include:{grade:true,student:{select:{firstName:true,lastName:true}}}});
 return toSubmission(result);
}
export async function updateAssignment(actor:Actor,id:string,raw:unknown):Promise<TeacherAssignmentDTO>{
 if(actor.role!=='teacher')fail(403,'Настройки меняет преподаватель.');
 const input=parse(assignmentPolicySchema.partial().extend({version:z.number().int().positive(),title:z.string().trim().min(1).max(200).optional(),closed:z.boolean().optional()}).strict(),raw);
 const row=await authorizedAssignment(actor,id);
 const next={maxAttempts:input.maxAttempts??row.maxAttempts,durationMinutes:input.durationMinutes??row.durationMinutes,answerPolicy:input.answerPolicy??row.answerPolicy,dueDate:input.dueDate===undefined?row.dueDate?.toISOString()??null:input.dueDate};validatePolicy(next);
 if(next.maxAttempts>row.maxAttempts&&(row.disclosureLockedAt||row.closedAt))fail(409,'После раскрытия решений или закрытия создайте новое назначение.');
 if(input.closed===false&&(row.solutionsReleasedAt||row.closedAt&&row.disclosureLockedAt))fail(409,'Опубликованные решения нельзя отозвать и открыть повторную сдачу.');
 const closed=input.closed===true?(row.closedAt??new Date()):input.closed===false?null:row.closedAt;
 const changed=await runAssessmentBatch([{sql:`UPDATE Assignment SET title=?,maxAttempts=?,durationMinutes=?,answerPolicy=?,dueDate=?,closedAt=?,version=version+1
  WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM SchoolClass WHERE id=Assignment.classId AND teacherId=?)
  AND (?<=maxAttempts OR (disclosureLockedAt IS NULL AND closedAt IS NULL))
  AND (solutionsReleasedAt IS NULL OR ? IS NOT NULL)
  AND (closedAt IS NULL OR disclosureLockedAt IS NULL OR ? IS NOT NULL)`,params:[input.title??row.title,next.maxAttempts,next.durationMinutes,next.answerPolicy,next.dueDate?sqlDate(new Date(next.dueDate)):null,closed?sqlDate(closed):null,id,input.version,actor.id,next.maxAttempts,closed?sqlDate(closed):null,closed?sqlDate(closed):null]}]);
 if(!changed[0].changes)fail(409,'Настройки изменены или решения уже раскрыты.');
 return await readAssignment(actor,id) as TeacherAssignmentDTO;
}
export async function releaseSolutions(actor:Actor,id:string,raw:unknown,clock:()=>Date=()=>new Date()):Promise<TeacherAssignmentDTO>{
 if(actor.role!=='teacher')fail(403,'Решения публикует преподаватель.');
 const {version}=parse(z.object({version:z.number().int().positive()}).strict(),raw),row=await authorizedAssignment(actor,id);
 if(row.kind!=='test')fail(422,'Домашнее задание не имеет этой политики решений.');
 const {expireAttempt}=await import('../assessment/service');
 for(const active of row.assessmentAttempts.filter(a=>a.status==='in_progress'&&a.expiresAt<=clock()))await expireAttempt(actor,id,active.id,clock);
 const now=clock();
 const changed=await runAssessmentBatch([{sql:`UPDATE Assignment SET answerPolicy='manual',solutionsReleasedAt=COALESCE(solutionsReleasedAt,?),disclosureLockedAt=COALESCE(disclosureLockedAt,?),closedAt=COALESCE(closedAt,?),version=version+1
  WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM SchoolClass WHERE id=Assignment.classId AND teacherId=?)
  AND NOT EXISTS(SELECT 1 FROM AssessmentAttempt WHERE assignmentId=Assignment.id AND status='in_progress')`,params:[sqlDate(now),sqlDate(now),sqlDate(now),id,version,actor.id]}]);
 if(!changed[0].changes)fail(409,'Есть активные попытки или настройки изменены. Дождитесь завершения и обновите страницу.');
 return await readAssignment(actor,id) as TeacherAssignmentDTO;
}
