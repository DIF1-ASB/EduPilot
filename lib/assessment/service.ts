import {z} from 'zod';
import {db} from '../database';
import {fail} from '../security';
import type {Actor} from '../materials/policy';
import {authorizedAssignment,type AssignmentRow} from '../assignments/service';
import {validateAssessment,type AssessmentDocument} from './schema';
import {buildAdmissionBatch,runAssessmentBatch} from './store';
import type {AssessmentAttempt} from '@prisma/client';
export type Clock=()=>Date;
export type PrivateAttempt=AssessmentAttempt&{assignment:AssignmentRow,snapshot:AssessmentDocument};
export async function loadAttempt(actor:Actor,assignmentId:string,attemptId:string,_clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 const assignment=await authorizedAssignment(actor,assignmentId);
 const attempt=await(await db()).assessmentAttempt.findFirst({where:{id:attemptId,assignmentId,...(actor.role==='student'?{studentId:actor.id}:{})}});
 if(!attempt)fail(404,'Попытка не найдена.');
 const snapshot=validateAssessment(assignment.snapshotJson,{publishable:true});
 return {...attempt,assignment,snapshot};
}
export async function startAttempt(actor:Actor,assignmentId:string,raw:unknown,clock:Clock=()=>new Date()):Promise<PrivateAttempt>{
 if(actor.role!=='student')fail(403,'Преподавателю доступен предпросмотр без попытки.');
 const parsed=z.object({requestId:z.string().uuid()}).safeParse(raw);if(!parsed.success)fail(400,'Нужен уникальный идентификатор старта.');
 const assignment=await authorizedAssignment(actor,assignmentId);if(assignment.kind!=='test')fail(422,'Это домашнее задание.');
 const snapshot=validateAssessment(assignment.snapshotJson,{publishable:true});
 const random=new Uint32Array(1);crypto.getRandomValues(random);const variant=snapshot.variants[random[0]%snapshot.variants.length];
 const statements=buildAdmissionBatch({id:crypto.randomUUID(),assignmentId,studentId:actor.id,requestId:parsed.data.requestId,variantId:variant.id,version:assignment.version,now:clock()});
 const result=await runAssessmentBatch(statements),id=result.at(-1)?.rows[0]?.id;
 if(typeof id!=='string')fail(409,'Нельзя начать: работа закрыта, истёк срок, изменены настройки или исчерпаны попытки.');
 return loadAttempt(actor,assignmentId,id,clock);
}
