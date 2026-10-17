import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { openPlatformFixture, type PlatformFixture } from './helpers/platform';
import {createNotesDraft} from '../lib/notes/schema';
let f:PlatformFixture;
const content={demo:false,sections:[{id:'old',title:'Тема',body:'Текст',answer:'PRIVATE_OLD_KEY'}]};
const input=(type:string)=>({title:'Проверка прав',type,subject:'Математика',grade:7,contentJson:type==='notes'?createNotesDraft():content});
beforeAll(async()=>{f=await openPlatformFixture('material-policy');});afterAll(async()=>{await f?.close();});
describe('material authorization',()=>{
 it.each(['lesson','worksheet','test','review'])('rejects student creation/generation/edit/copy of %s before external AI',async type=>{
  const {call,client,student}=f;
  const old=await client.material.create({data:{...input(type),userId:student.id}});
  const before=await client.material.count();
  expect((await call('generate','POST',{...input(type),role:'teacher'},student.cookie)).status).toBe(403);
  expect((await call('materials','POST',input(type),student.cookie)).status).toBe(403);
  expect((await call('materials/'+old.id,'PATCH',{...input(type),version:1},student.cookie)).status).toBe(403);
  expect((await call('materials/'+old.id+'/duplicate','POST',{},student.cookie)).status).toBe(403);
  expect((await call('materials/'+old.id,'DELETE',undefined,student.cookie)).status).toBe(403);
  expect(await client.material.count()).toBe(before);
  const read=await call('materials/'+old.id,'GET',undefined,student.cookie);expect(read.status).toBe(200);
  const body:any=await read.json();expect(body.canEdit).toBe(false);expect(JSON.stringify(body)).not.toContain('PRIVATE_OLD_KEY');
  expect((await client.material.findUniqueOrThrow({where:{id:old.id}})).contentJson).toEqual(content);
 });
 it('allows own notes but denies foreign records and immutable type changes',async()=>{
  const create=await f.call('materials','POST',input('notes'),f.student.cookie);expect(create.status).toBe(201);const m:any=await create.json();
  expect((await f.call('materials/'+m.id,'PATCH',{...input('notes'),version:1},f.student.cookie)).status).toBe(200);
  expect((await f.call('materials/'+m.id+'/duplicate','POST',{},f.student.cookie)).status).toBe(201);
  expect((await f.call('materials/'+m.id,'GET',undefined,f.outsider.cookie)).status).toBe(404);
  expect((await f.call('materials/'+m.id,'PATCH',{...input('lesson'),version:2},f.student.cookie)).status).toBe(403);
  const library:any=await (await f.call('materials','GET',undefined,f.student.cookie)).json();
  expect(JSON.stringify(library.filter((m:any)=>m.type!=='notes'))).not.toContain('PRIVATE_OLD_KEY');
 });
 it('keeps teacher legacy media editable while disabled creation remains unavailable',async()=>{
  const old=await f.client.material.create({data:{...input('presentation'),userId:f.teacher.id}});
  expect((await f.call('materials/'+old.id,'PATCH',{...input('presentation'),version:1},f.teacher.cookie)).status).toBe(200);
  expect((await f.call('generate','POST',input('presentation'),f.teacher.cookie)).status).toBe(410);
 });
});
