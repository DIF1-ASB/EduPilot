import {authorizedAssignment} from './service';
import type {Actor} from '../materials/policy';
import {getStudentAttemptView} from '../assessment/service';
import {buildAllAnswerSheets,buildStudentAnswerSheet} from '../assessment/sheet';
import type {MaterialRecord} from '../domain';
import {fail} from '../security';
export async function getAssignmentSheets(actor:Actor,id:string,options:{attemptId?:string|null,includeTeacherKeys?:boolean}){
 const assignment=await authorizedAssignment(actor,id);if(assignment.kind!=='test'||!assignment.snapshotJson)fail(422,'Бланк доступен только для контрольной.');
 const meta={title:assignment.title,subject:assignment.class.subject,grade:assignment.material.grade};
 if(actor.role==='student'){
  if(!options.attemptId)fail(400,'Выберите собственную завершённую попытку.');
  const view=await getStudentAttemptView(actor,id,options.attemptId);if(view.status==='in_progress')fail(409,'Скачивание доступно после завершения попытки.');
  return [buildStudentAnswerSheet(meta,view)];
 }
 return buildAllAnswerSheets({...assignment.material,...meta,contentJson:assignment.snapshotJson} as unknown as MaterialRecord,options.includeTeacherKeys===true);
}
