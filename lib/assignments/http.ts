import {readJson,fail} from '../security';
import type {Actor} from '../materials/policy';
import {authorizedAssignment,createAssignment,listAssignments,readAssignment,updateAssignment,submitHomework,releaseSolutions} from './service';
import {startAttempt,loadAttempt,saveDraft,submitAttempt,reviewAttempt,getStudentAttemptView,type PrivateAttempt} from '../assessment/service';
import {exportMaterial} from '../export';
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
  const format=url.searchParams.get('format')??'docx';if(!['docx','pdf'].includes(format))fail(400,'Неподдерживаемый формат.');
  const assignment=await authorizedAssignment(actor,id);
  if(assignment.kind==='homework'){
   const result=await exportMaterial({...assignment.material,title:assignment.title,contentJson:assignment.snapshotJson??assignment.material.contentJson},format,actor.role==='teacher'&&url.searchParams.get('answers')==='true');
   return new Response(result.bytes as BodyInit,{headers:{'Content-Type':result.mime,'Content-Disposition':`attachment; filename="EduPilot.${format}"; filename*=UTF-8''${encodeURIComponent(assignment.title)}.${format}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  fail(410,'Контрольные выполняются только на сайте. Word/PDF для них отключены.');
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
