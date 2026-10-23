import {authorizedAssignment} from './service';
import type {Actor} from '../materials/policy';
import {fail} from '../security';
export async function getAssignmentSheets(actor:Actor,id:string,_options:{attemptId?:string|null;includeTeacherKeys?:boolean}):Promise<never>{
 await authorizedAssignment(actor,id);
 fail(410,'Контрольные выполняются только на сайте. Word/PDF для них отключены.');
}
