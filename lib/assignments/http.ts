import {readJson,fail} from '../security';
import type {Actor} from '../materials/policy';
import {authorizedAssignment,createAssignment,listAssignments,readAssignment,updateAssignment,submitHomework,releaseSolutions} from './service';
import {startAttempt,loadAttempt,saveDraft,submitAttempt,reviewAttempt,getStudentAttemptView,type PrivateAttempt} from '../assessment/service';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function teacherAttempt(attempt:PrivateAttempt){
 return {id:attempt.id,assignmentId:attempt.assignmentId,studentId:attempt.studentId,number:attempt.number,variantId:attempt.variantId,status:attempt.status,version:attempt.version,
  startedAt:attempt.startedAt.toISOString(),expiresAt:attempt.expiresAt.toISOString(),submittedAt:attempt.submittedAt?.toISOString()??null,completionKind:attempt.completionKind,
  answers:attempt.submittedAnswersJson??attempt.draftAnswersJson,questions:attempt.snapshot.variants.find(v=>v.id===attempt.variantId)!.questions,result:attempt.resultJson,review:attempt.reviewJson};
}
async function view(actor:Actor,id:string,attemptId:string){return actor.role==='student'?getStudentAttemptView(actor,id,attemptId):teacherAttempt(await loadAttempt(actor,id,attemptId));}
export async function handleAssignmentRequest(req:Request,actor:Actor):Promise<Response|null>{
 const url=new URL(req.url),parts=url.pathname.split('/').slice(2).filter(Boolean),[area,id,action,attemptId,operation]=parts,method=req.method;
 if(area==='classes'&&id&&action==='assignment'&&parts.length===3&&method==='POST')return json(await createAssignment(actor,id,await readJson(req)),201);
 if(area!=='assignments')return null;
 if(!id&&parts.length===1&&method==='GET')return json(await listAssignments(actor,url.searchParams.get('kind')??undefined));
 if(!id)fail(404,'Маршрут не найден.');
 if(parts.length===2){
  if(method==='GET')return json(await readAssignment(actor,id));
  if(method==='PATCH')return json(await updateAssignment(actor,id,await readJson(req)));
 }
 if(action==='start'&&parts.length===3&&method==='POST'){
  const started=await startAttempt(actor,id,await readJson(req));return json(await getStudentAttemptView(actor,id,started.id));
 }
 if(action==='release'&&parts.length===3&&method==='POST')return json(await releaseSolutions(actor,id,await readJson(req)));
 if(action==='homework'&&parts.length===3&&method==='POST')return json(await submitHomework(actor,id,await readJson(req)));
 if(action==='export'&&parts.length===3&&method==='GET'){
  await authorizedAssignment(actor,id);
  if(!['docx','pdf'].includes(url.searchParams.get('format')??'docx'))fail(400,'Неподдерживаемый формат.');
  if(actor.role==='student'){
   const attemptId=url.searchParams.get('attemptId');if(!attemptId)fail(400,'Выберите собственную завершённую попытку.');
   const attempt=await getStudentAttemptView(actor,id,attemptId);if(attempt.status==='in_progress')fail(409,'Скачивание доступно после завершения попытки.');
  }
  // Replaced with the shared, role-safe document renderer in task B2 before rollout.
  fail(503,'Экспорт бланка временно недоступен. Работа и ответы сохранены.');
 }
 if(action==='attempts'){
  if(parts.length===3&&method==='GET'){
   const assignment=await authorizedAssignment(actor,id),attempts=assignment.assessmentAttempts.filter(a=>actor.role==='teacher'||a.studentId===actor.id);
   return json(await Promise.all(attempts.sort((a,b)=>a.number-b.number).map(a=>view(actor,id,a.id))));
  }
  if(attemptId&&parts.length===4&&method==='GET')return json(await view(actor,id,attemptId));
  if(attemptId&&parts.length===5){
   if(operation==='draft'&&method==='PATCH'){await saveDraft(actor,id,attemptId,await readJson(req));return json(await getStudentAttemptView(actor,id,attemptId));}
   if(operation==='submit'&&method==='POST'){await submitAttempt(actor,id,attemptId,await readJson(req));return json(await getStudentAttemptView(actor,id,attemptId));}
   if(operation==='review'&&method==='POST')return json(teacherAttempt(await reviewAttempt(actor,id,attemptId,await readJson(req))));
  }
 }
 fail(404,'Маршрут не найден.');
}
