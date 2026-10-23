import {db} from '../database';
import {config,getRuntime} from '../runtime';
import {digest,fail,rateLimit} from '../security';
import type {Actor} from '../materials/policy';
import type {GenerationJob} from '@prisma/client';
import {createGenerationSchema,generationErrorMessages,type GenerationJobDTO} from './contracts';
export function jobsAvailable():boolean{return config('GENERATION_JOBS_ENABLED')==='true'&&!getRuntime()?.DB;}
export function requireJobs():void{if(!jobsAvailable())fail(503,'Фоновая генерация не включена для этого сервера. Доступны сохранённые материалы.');}
export function generationDTO(row:GenerationJob):GenerationJobDTO{
 return {id:row.id,kind:row.kind as GenerationJobDTO['kind'],state:row.state as GenerationJobDTO['state'],...(row.resultMaterialId?{materialId:row.resultMaterialId}:{}),...(row.errorCode?{error:{code:row.errorCode,message:generationErrorMessages[row.errorCode]??generationErrorMessages.provider_unavailable,retryable:true}}:{}),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
}
export async function createGeneration(actor:Actor,raw:unknown):Promise<GenerationJobDTO>{
 requireJobs();const input=createGenerationSchema.parse(raw);
 if(input.kind==='test'&&actor.role!=='teacher')fail(403,'Контрольные создаёт преподаватель.');
 const client=await db(),inputHash=await digest(JSON.stringify({kind:input.kind,input:input.input}));
 const existing=await client.generationJob.findUnique({where:{ownerId_requestId:{ownerId:actor.id,requestId:input.requestId}}});
 if(existing){if(existing.inputHash!==inputHash)fail(409,'Этот идентификатор запроса уже использован с другими параметрами.');return generationDTO(existing);}
 await rateLimit(`ai:${actor.id}`,20,3600);
 try{return generationDTO(await client.generationJob.create({data:{id:crypto.randomUUID(),ownerId:actor.id,requestId:input.requestId,kind:input.kind,inputHash,inputJson:input.input}}));}
 catch(error){
  const duplicate=await client.generationJob.findUnique({where:{ownerId_requestId:{ownerId:actor.id,requestId:input.requestId}}});
  if(duplicate){if(duplicate.inputHash!==inputHash)fail(409,'Параметры запроса изменились.');return generationDTO(duplicate);}
  if(await client.generationJob.count({where:{ownerId:actor.id,state:{in:['queued','running','validating']}}}))fail(409,'Дождитесь завершения текущей генерации или отмените её.');throw error;
 }
}
async function owned(actor:Actor,id:string){
 requireJobs();const row=await(await db()).generationJob.findUnique({where:{id}});if(!row)fail(404,'Генерация не найдена.');if(row.ownerId!==actor.id)fail(403,'Недоступная генерация.');return row;
}
export async function getGeneration(actor:Actor,id:string):Promise<GenerationJobDTO>{return generationDTO(await owned(actor,id));}
export async function listGenerations(actor:Actor):Promise<GenerationJobDTO[]>{requireJobs();return(await(await db()).generationJob.findMany({where:{ownerId:actor.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50})).map(generationDTO);}
export async function cancelGeneration(actor:Actor,id:string):Promise<GenerationJobDTO>{
 // Keep a running lease until its upstream call stops: cancellation must not free
 // a global slot while a provider is still executing the request.
 await owned(actor,id);await(await db()).generationJob.updateMany({where:{id,ownerId:actor.id,state:{in:['queued','running','validating']}},data:{state:'cancelled'}});return getGeneration(actor,id);
}
