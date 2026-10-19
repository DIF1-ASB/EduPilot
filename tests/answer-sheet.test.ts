import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import JSZip from 'jszip';
import {buildAnswerSheet} from '../lib/assessment/sheet';
import {SheetPreview} from '../components/assessment/sheet-preview';
import {validateAssessment} from '../lib/assessment/schema';
import {editAssessmentQuestion} from '../components/assessment/editor';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
const content=()=>validateAssessment({schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите самостоятельно',variants:[{id:'v1',label:'Первый',questions:[{id:'open',kind:'open',prompt:'Объясните ход решения',points:2,criteria:'CANARY_KEY'}]},{id:'v2',label:'Второй',questions:[{id:'number',kind:'numeric',prompt:'Вычислите 1/2 − 0,5',points:2,acceptedAnswers:['0']}]}]},{publishable:true});
const material=()=>({id:'m',userId:'teacher',title:'Дроби',type:'test',subject:'Математика',grade:7,status:'draft',version:1,metadataJson:{},contentJson:content()} as any);
describe('answer sheet public contract',()=>{
 it('keeps defaults and explicit answer-space edits, isolates variants and puts keys after blanks',()=>{
  const m=material();expect(buildAnswerSheet(m,{variantId:'v1',includeTeacherKeys:false}).blocks[0].answerLines).toBe(6);
  const edited=editAssessmentQuestion(m,'v1','open',{answerLines:12});const sheet=buildAnswerSheet(edited,{variantId:'v1',includeTeacherKeys:true});expect(sheet.blocks[0].answerLines).toBe(12);
  const html=renderToStaticMarkup(createElement(SheetPreview,{sheet}));expect(html.match(/class="answer-line"/g)).toHaveLength(12);expect(html.indexOf('CANARY_KEY')).toBeGreaterThan(html.lastIndexOf('class="answer-line"'));expect(html).toContain('ФИО');expect(html).toContain('Дата');
  const other=buildAnswerSheet(m,{variantId:'v2',includeTeacherKeys:false});expect(other.blocks.map(b=>b.id)).toEqual(['number']);expect(JSON.stringify(other)).not.toContain('CANARY_KEY');expect(()=>buildAnswerSheet(m,{variantId:'wrong',includeTeacherKeys:false})).toThrow();
 });
 it('preserves an unstructured historical section exactly and adds writable space without guessing questions',()=>{
  const m=material();m.contentJson={demo:false,sections:[{id:'old',title:'Шесть вопросов',body:'1. A? 2. B? 3. C? 4. D? 5. E? 6. F?',duration:5,answer:'CANARY_KEY'},{id:'empty',title:'Пустой раздел',body:''}]};const before=structuredClone(m.contentJson);
  const sheet=buildAnswerSheet(m,{includeTeacherKeys:false});expect(sheet.blocks).toHaveLength(2);expect(sheet.blocks[0].answerLines).toBe(6);expect(sheet.blocks[1].answerLines).toBe(6);expect(m.contentJson).toEqual(before);expect(renderToStaticMarkup(createElement(SheetPreview,{sheet}))).not.toContain('CANARY_KEY');
 });
});
describe('assignment sheet authorization and snapshot',()=>{
 let f:PlatformFixture,id:string,attemptId:string;
 beforeAll(async()=>{f=await openPlatformFixture('sheet');const c=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Математика',enrollments:{create:{studentId:f.student.id}}}});const m=await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Дроби',subject:'Математика',grade:7,contentJson:content()}});const r=await f.call(`classes/${c.id}/assignment`,'POST',{materialId:m.id,materialVersion:1,keysConfirmed:true,title:'Работа',kind:'test'},f.teacher.cookie);expect(r.status).toBe(201);id=(await r.json() as any).id;
 const start=await f.call(`assignments/${id}/start`,'POST',{requestId:crypto.randomUUID()},f.student.cookie);const dto:any=await start.json();attemptId=dto.id;expect(dto.instructions).toBe('Решите самостоятельно');expect(dto.variantLabel).toMatch(/Первый|Второй/);
 await f.client.material.update({where:{id:m.id},data:{contentJson:{demo:false,sections:[{id:'changed',title:'CHANGED',body:'CHANGED'}]}}});});
 afterAll(async()=>{await f?.close();});
 it('rejects active/foreign attempts and ignores a student request for keys even after release',async()=>{
  const {getAssignmentSheets}=await import('../lib/assignments/sheets');
  await expect(getAssignmentSheets(f.student,id,{attemptId,includeTeacherKeys:true})).rejects.toMatchObject({status:409});
  await expect(getAssignmentSheets(f.outsider,id,{attemptId,includeTeacherKeys:true})).rejects.toMatchObject({status:404});
  await expect(getAssignmentSheets(f.student,id,{attemptId:'foreign',includeTeacherKeys:true})).rejects.toMatchObject({status:404});
  const dto:any=await(await f.call(`assignments/${id}/attempts/${attemptId}`,'GET',undefined,f.student.cookie)).json();const q=dto.questions[0];expect((await f.call(`assignments/${id}/attempts/${attemptId}/submit`,'POST',{version:dto.version,answers:{[q.id]:q.kind==='numeric'?'0':'Решение'}},f.student.cookie)).status).toBe(200);
  const sheets=await getAssignmentSheets(f.student,id,{attemptId,includeTeacherKeys:true});expect(sheets).toHaveLength(1);expect(sheets[0].blocks.map(b=>b.id)).toEqual([q.id]);expect(sheets[0].instructions).toBe('Решите самостоятельно');expect(JSON.stringify(sheets)).not.toContain('CANARY_KEY');expect(sheets[0]).not.toHaveProperty('teacherKeys');
  expect((await f.call(`assignments/${id}/release`,'POST',{version:1},f.teacher.cookie)).status).toBe(200);expect(JSON.stringify(await getAssignmentSheets(f.student,id,{attemptId,includeTeacherKeys:true}))).not.toContain('CANARY_KEY');
  const teacher=await getAssignmentSheets(f.teacher,id,{includeTeacherKeys:true});expect(teacher).toHaveLength(2);expect(JSON.stringify(teacher)).toContain('CANARY_KEY');expect(JSON.stringify(teacher)).not.toContain('CHANGED');
  for(const actor of [f.student,f.teacher]){const download=await f.call(`assignments/${id}/export?format=docx&answers=true&attemptId=${attemptId}`,'GET',undefined,actor.cookie);expect(download.status).toBe(200);const zip=await JSZip.loadAsync(await download.arrayBuffer()),xml=await zip.file('word/document.xml')!.async('string');expect(xml.includes('CANARY_KEY')).toBe(actor.role==='teacher');expect(xml).toContain('ФИО');expect(xml).not.toContain('CHANGED');}
 });
 it('keeps original variants and configured lines on a blank material download and returns actionable PDF errors',async()=>{
  const document=content();document.variants[0].questions[0].answerLines=12;
  const m=await f.client.material.create({data:{userId:f.teacher.id,type:'worksheet',title:'Бланк',subject:'Математика',grade:7,contentJson:document}});
  const blank=await f.call(`materials/${m.id}/export?format=docx`,'GET',undefined,f.teacher.cookie);expect(blank.status).toBe(200);const zip=await JSZip.loadAsync(await blank.arrayBuffer()),xml=await zip.file('word/document.xml')!.async('string');expect(xml.match(/<w:pBdr>/g)).toHaveLength(14);expect(xml).toContain('Второй');expect(xml).not.toContain('CANARY_KEY');
  document.variants[0].questions[0].prompt='Символ 🧑';await f.client.material.update({where:{id:m.id},data:{contentJson:document}});
  const unsupported=await f.call(`materials/${m.id}/export?format=pdf`,'GET',undefined,f.teacher.cookie);expect(unsupported.status).toBe(422);expect(JSON.stringify(await unsupported.json())).toMatch(/U\+1F9D1.*DOCX/);
 });
});
