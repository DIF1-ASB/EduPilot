import type {MaterialRecord} from '../lib/domain';
import {describe,it,expect} from 'vitest';import {openPlatformFixture} from './helpers/platform';import {articleFixture} from './helpers/online-content';import {createNotesDraft} from '../lib/notes/schema';
describe('article ownership, compatibility and save conflicts',()=>{
 it('saves a v3 note only for its owner and preserves local text on a stale version',async()=>{
  const f=await openPlatformFixture('article-api');try{
   const payload={type:'notes',title:'Уравнения',subject:'Математика',grade:7,status:'draft',contentJson:articleFixture(),metadataJson:{}};
   const created=await f.call('materials','POST',payload,f.student.cookie);expect(created.status).toBe(201);const material=await created.json() as MaterialRecord;
   const changed={...payload,version:1,contentJson:{...payload.contentJson,bodyMarkdown:payload.contentJson.bodyMarkdown+'\n\nНовое пояснение.'}};expect((await f.call('materials/'+material.id,'PATCH',changed,f.outsider.cookie)).status).toBe(404);
   expect((await f.call('materials/'+material.id,'PATCH',changed,f.student.cookie)).status).toBe(200);expect((await f.call('materials/'+material.id,'PATCH',{...payload,version:1},f.student.cookie)).status).toBe(409);expect((await f.client.material.findUniqueOrThrow({where:{id:material.id}})).contentJson).toEqual(changed.contentJson);
   expect((await f.call('materials','POST',{...payload,status:'ready',contentJson:{...payload.contentJson,bodyMarkdown:'Короткий текст'}},f.student.cookie)).status).toBe(400);
   expect((await f.call('materials','POST',{...payload,type:'lesson'},f.teacher.cookie)).status).toBe(400);
  }finally{await f.close();}
 },20000);
 it('keeps v1/v2 contents exact on save and prevents accidental format conversion',async()=>{
  const f=await openPlatformFixture('article-legacy');try{
   for(const contentJson of [{demo:false,sections:[{id:'old',title:'Старый конспект',body:'Оригинальный текст',duration:15}]},createNotesDraft()]){
    const m=await f.client.material.create({data:{userId:f.student.id,type:'notes',title:'История',subject:'Математика',grade:7,contentJson}});
    const body={title:m.title,type:'notes',subject:m.subject,grade:m.grade,status:'draft',version:1,contentJson};expect((await f.call('materials/'+m.id,'PATCH',body,f.student.cookie)).status).toBe(200);expect((await f.client.material.findUniqueOrThrow({where:{id:m.id}})).contentJson).toEqual(contentJson);
   }
   const response=await f.call('materials','POST',{type:'notes',title:'Статья',subject:'Биология',grade:6,contentJson:articleFixture()},f.student.cookie);expect(response.status).toBe(201);const created=await response.json() as MaterialRecord;
   expect((await f.call('materials/'+created.id,'PATCH',{title:'Статья',type:'notes',subject:'Биология',grade:6,status:'draft',version:1,contentJson:createNotesDraft()},f.student.cookie)).status).toBe(400);
  }finally{await f.close();}
 },20000);
});
