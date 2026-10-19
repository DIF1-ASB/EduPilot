import {z} from 'zod';
import {db} from '../database';
import {fail} from '../security';
import type {Actor} from '../materials/policy';
import {authorizedAssignment,type AssignmentRow} from '../assignments/service';
import {validateAssessment,validateAnswers,type AssessmentDocument} from './schema';
import {buildAdmissionBatch,runAssessmentBatch,epochSql,sqlDate} from './store';
import {gradeVariant,hasAnswers,type GradeResult} from './grading';
import {canRevealSolutions,toStudentAttempt} from './projection';
import type {AttemptDTO} from './public';
import type {AssessmentAttempt} from '@prisma/client';
export type Clock=()=>Date;
export type PrivateAttempt=AssessmentAttempt&{assignment:AssignmentRow,snapshot:AssessmentDocument};
async function readPrivateAttempt(actor:Actor,assignmentId:string,attemptId:string):Promise<PrivateAttempt>{
 const assignment=await authorizedAssignment(actor,assignmentId);
 const attempt=await(await db()).assessmentAttempt.findFirst({where:{id:attemptId,assignmentId,...(actor.role==='student'?{studentId:actor.id}:{})}});
 if(!attempt)fail(404,'Попытка не найдена.');
 const snapshot=validateAssessment(assignment.snapshotJson,{publishable:true});
 return {...attempt,assignment,snapshot};
}
export async function loadAttempt(actor:Actor,assignmentId:string,attemptId:string,clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 const attempt=await readPrivateAttempt(actor,assignmentId,attemptId);
 return attempt.status==='in_progress'&&attempt.expiresAt<=clock()?expireAttempt(actor,assignmentId,attemptId,clock):attempt;
}
export async function startAttempt(actor:Actor,assignmentId:string,raw:unknown,clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 if(actor.role!=='student')fail(403,'Преподавателю доступен предпросмотр без попытки.');
 const parsed=z.object({requestId:z.string().uuid()}).safeParse(raw);if(!parsed.success)fail(400,'Нужен уникальный идентификатор старта.');
 const assignment=await authorizedAssignment(actor,assignmentId);if(assignment.kind!=='test')fail(422,'Это домашнее задание.');
 for(const active of assignment.assessmentAttempts.filter(a=>a.studentId===actor.id&&a.status==='in_progress'&&a.expiresAt<=clock()))await expireAttempt(actor,assignmentId,active.id,clock);
 const snapshot=validateAssessment(assignment.snapshotJson,{publishable:true});
 const random=new Uint32Array(1);crypto.getRandomValues(random);const variant=snapshot.variants[random[0]%snapshot.variants.length];
 const statements=buildAdmissionBatch({id:crypto.randomUUID(),assignmentId,studentId:actor.id,requestId:parsed.data.requestId,variantId:variant.id,version:assignment.version,now:clock()});
 const result=await runAssessmentBatch(statements),id=result.at(-1)?.rows[0]?.id;
 if(typeof id!=='string')fail(409,'Нельзя начать: работа закрыта, истёк срок, изменены настройки или исчерпаны попытки.');
 return loadAttempt(actor,assignmentId,id,clock);
}
const requestSchema=z.object({version:z.number().int().positive(),answers:z.unknown()});
function request(raw:unknown){const r=requestSchema.safeParse(raw);if(!r.success)fail(400,'Нужны версия и ответы.');return r.data;}
function access(actor:Actor){return actor.role==='teacher'?{
 sql:'EXISTS(SELECT 1 FROM Assignment x JOIN SchoolClass c ON c.id=x.classId WHERE x.id=AssessmentAttempt.assignmentId AND c.teacherId=?)',params:[actor.id]
 }:{sql:"EXISTS(SELECT 1 FROM Assignment x JOIN Enrollment e ON e.classId=x.classId JOIN User u ON u.id=e.studentId WHERE x.id=AssessmentAttempt.assignmentId AND e.studentId=? AND AssessmentAttempt.studentId=e.studentId AND u.role='student')",params:[actor.id]};}
function answersFor(attempt:PrivateAttempt,raw:unknown){try{return validateAnswers(attempt.snapshot,attempt.variantId,raw);}catch{fail(400,'Ответы содержат неизвестный вопрос, вариант или неверный формат.');}}
export async function saveDraft(actor:Actor,assignmentId:string,attemptId:string,raw:unknown,clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 if(actor.role!=='student')fail(403,'Черновик сохраняет ученик.');
 const attempt=await loadAttempt(actor,assignmentId,attemptId,clock);if(attempt.status!=='in_progress')fail(409,'Попытка завершена. Черновик не изменён.');
 const input=request(raw),answers=answersFor(attempt,input.answers),guard=access(actor),now=clock();
 const result=await runAssessmentBatch([{sql:`UPDATE AssessmentAttempt SET draftAnswersJson=?,version=version+1 WHERE id=? AND assignmentId=? AND status='in_progress' AND version=? AND ${epochSql('expiresAt')}>? AND ${guard.sql}`,
  params:[JSON.stringify(answers),attemptId,assignmentId,input.version,now.getTime(),...guard.params]}]);
 if(!result[0].changes)fail(409,'Черновик изменён в другой вкладке или время истекло. Скопируйте свой ответ перед обновлением.');
 return loadAttempt(actor,assignmentId,attemptId,clock);
}
async function finalize(actor:Actor,attempt:PrivateAttempt,answers:unknown,completion:'submitted'|'expired',now:Date,version:number){
 const valid=answersFor(attempt,answers),result=gradeVariant(attempt.snapshot,attempt.variantId,valid),guard=access(actor);
 const changed=await runAssessmentBatch([{sql:`UPDATE AssessmentAttempt SET submittedAnswersJson=?,draftAnswersJson=?,submittedAt=?,completionKind=?,status=?,resultJson=?,version=version+1
  WHERE id=? AND assignmentId=? AND status='in_progress' AND version=? AND ${epochSql('expiresAt')}${completion==='expired'?'<=':'>'}? AND ${guard.sql}`,
  params:[JSON.stringify(valid),JSON.stringify(valid),sqlDate(now),completion,result.pendingQuestionIds.length?'pending_review':'graded',JSON.stringify(result),attempt.id,attempt.assignmentId,version,now.getTime(),...guard.params]}]);
 return !!changed[0].changes;
}
export async function expireAttempt(actor:Actor,assignmentId:string,attemptId:string,clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 for(let i=0;i<3;i++){
  const attempt=await readPrivateAttempt(actor,assignmentId,attemptId),now=clock();
  if(attempt.status!=='in_progress'||attempt.expiresAt>now)return attempt;
  if(await finalize(actor,attempt,attempt.draftAnswersJson,'expired',now,attempt.version))return readPrivateAttempt(actor,assignmentId,attemptId);
 }
 fail(409,'Попытка изменяется. Обновите результат.');
}
export async function submitAttempt(actor:Actor,assignmentId:string,attemptId:string,raw:unknown,clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 if(actor.role!=='student')fail(403,'Работу сдаёт ученик.');
 const attempt=await loadAttempt(actor,assignmentId,attemptId,clock);if(attempt.status!=='in_progress')return attempt;
 const input=request(raw),answers=answersFor(attempt,input.answers),now=clock();
 if(attempt.expiresAt<=now)return expireAttempt(actor,assignmentId,attemptId,clock);
 if(!hasAnswers(answers))fail(422,'Нет ответов. Заполните хотя бы одно задание.');
 if(!await finalize(actor,attempt,answers,'submitted',now,input.version)){
  const current=await loadAttempt(actor,assignmentId,attemptId,clock);if(current.status!=='in_progress')return current;
  fail(409,'Попытка изменена в другой вкладке. Скопируйте ответы и обновите страницу.');
 }
 return readPrivateAttempt(actor,assignmentId,attemptId);
}
export async function reviewAttempt(actor:Actor,assignmentId:string,attemptId:string,raw:unknown):Promise<PrivateAttempt>{
 if(actor.role!=='teacher')fail(403,'Проверка доступна преподавателю.');
 const attempt=await readPrivateAttempt(actor,assignmentId,attemptId);
 if(attempt.status!=='pending_review')fail(409,'Работа не ожидает проверки или уже проверена.');
 const parsed=z.object({version:z.number().int().positive(),marks:z.array(z.object({questionId:z.string(),points:z.number().finite().min(0).max(1000),comment:z.string().max(5000)})).max(30)}).safeParse(raw);
 if(!parsed.success)fail(400,'Некорректные баллы или комментарии.');const {version,marks}=parsed.data;
 const result=attempt.resultJson as unknown as GradeResult;
 const pending=new Set(result.pendingQuestionIds);
 if(marks.length!==pending.size||new Set(marks.map(m=>m.questionId)).size!==marks.length||marks.some(m=>!pending.has(m.questionId)||m.points>(result.items.find(i=>i.questionId===m.questionId)?.maxPoints??-1)))fail(400,'Оцените все ожидающие развёрнутые ответы в пределах максимума.');
 const score=result.autoScore+marks.reduce((n,m)=>n+m.points,0),reviewed={...result,score,pendingQuestionIds:[],items:result.items.map(i=>{const mark=marks.find(m=>m.questionId===i.questionId);return mark?{...i,points:mark.points,correct:mark.points===i.maxPoints}:i;})};
 const guard=access(actor),now=new Date();
 const changed=await runAssessmentBatch([{sql:`UPDATE AssessmentAttempt SET status='graded',resultJson=?,reviewJson=?,reviewedAt=?,version=version+1 WHERE id=? AND assignmentId=? AND status='pending_review' AND version=? AND ${guard.sql}`,
  params:[JSON.stringify(reviewed),JSON.stringify(marks),sqlDate(now),attemptId,assignmentId,version,...guard.params]}]);
 if(!changed[0].changes)fail(409,'Другой запрос уже проверил эту работу.');
 return readPrivateAttempt(actor,assignmentId,attemptId);
}
export async function getStudentAttemptView(actor:Actor,assignmentId:string,attemptId:string,clock:Clock=()=>new Date()):Promise<AttemptDTO>{
 if(actor.role!=='student')fail(403,'Ученический результат доступен ученику.');
 const row=await authorizedAssignment(actor,assignmentId);
 for(const active of row.assessmentAttempts.filter(a=>a.studentId===actor.id&&a.status==='in_progress'&&a.expiresAt<=clock()))await expireAttempt(actor,assignmentId,active.id,clock);
 for(let retry=0;retry<2;retry++){
  const attempt=await loadAttempt(actor,assignmentId,attemptId,clock),assignment=attempt.assignment,now=clock();
  const used=assignment.assessmentAttempts.filter(a=>a.studentId===actor.id).length;
  if(!canRevealSolutions(assignment,attempt,used,now))return toStudentAttempt(assignment,attempt,used,now);
  const due=epochSql('Assignment.dueDate');
  const gate=await runAssessmentBatch([{sql:`UPDATE Assignment SET disclosureLockedAt=COALESCE(disclosureLockedAt,?),
   closedAt=CASE WHEN answerPolicy='after_due' THEN COALESCE(closedAt,?) ELSE closedAt END
   WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM Enrollment WHERE classId=Assignment.classId AND studentId=?)
   AND EXISTS(SELECT 1 FROM AssessmentAttempt p WHERE p.id=? AND p.assignmentId=Assignment.id AND p.studentId=? AND p.status IN ('graded','pending_review'))
   AND NOT EXISTS(SELECT 1 FROM AssessmentAttempt p WHERE p.assignmentId=Assignment.id AND p.studentId=? AND p.status='in_progress')
   AND ((answerPolicy='manual' AND solutionsReleasedAt IS NOT NULL)
    OR (answerPolicy='after_due' AND dueDate IS NOT NULL AND ${due}<=?)
    OR (answerPolicy='after_last' AND (SELECT COUNT(*) FROM AssessmentAttempt p WHERE p.assignmentId=Assignment.id AND p.studentId=?)>=maxAttempts))`,
   params:[sqlDate(now),sqlDate(now),assignmentId,assignment.version,actor.id,attemptId,actor.id,actor.id,now.getTime(),actor.id]}]);
  if(gate[0].changes)return toStudentAttempt(assignment,attempt,used,now);
 }
 fail(409,'Настройки работы изменились. Обновите результат.');
}
