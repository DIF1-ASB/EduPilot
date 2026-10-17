import { isCreationEnabled } from '../domain';
export type Actor={id:string,role:'teacher'|'student'};
export function canCreateMaterial(actor:Actor,type:string):boolean {
  return isCreationEnabled(type)&&(actor.role==='teacher'||actor.role==='student'&&type==='notes');
}
export function canEditMaterial(actor:Actor,material:{userId:string,type:string}):boolean {
  return material.userId===actor.id&&(actor.role==='teacher'||actor.role==='student'&&material.type==='notes');
}
