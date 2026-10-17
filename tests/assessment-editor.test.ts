import {describe,it,expect} from 'vitest';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {AssessmentEditor,editAssessmentQuestion,convertLegacyAssessment} from '../components/assessment/editor';
import type {MaterialRecord} from '../lib/domain';
const material=():MaterialRecord=>({id:'m',title:'Работа',type:'test',subject:'Математика',grade:7,status:'draft',version:1,createdAt:'',updatedAt:'',metadataJson:{keysConfirmed:true},contentJson:{schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'Вариант 1',questions:[{id:'q',kind:'short',prompt:'2+2',points:1,answerLines:2,acceptedAnswers:['4']}]}]}});
describe('assessment authoring',()=>{
 it('preserves stable ids, zero points and answer lines while resetting key confirmation',()=>{
  const original=material();const edited=editAssessmentQuestion(original,'v','q',{points:0,answerLines:8,prompt:'Новая формулировка'});
  expect(edited.contentJson).toMatchObject({variants:[{id:'v',questions:[{id:'q',kind:'short',points:0,answerLines:8}]}]});
  expect(edited.metadataJson.keysConfirmed).toBe(false);expect(original.metadataJson.keysConfirmed).toBe(true);
 });
 it('has separated fields for questions, keys, points, answer lines and safe preview',()=>{
  const html=renderToStaticMarkup(createElement(AssessmentEditor,{material:material(),onChange:()=>{},onSave:async()=>{},onPreview:()=>{}}));
  for(const label of ['Условие','Правильные ответы','Баллы','Строк для ответа','Бланк ученика','Ключи преподавателя'])expect(html).toContain(label);
  expect(html).not.toContain('quiz-start');
 });
 it('explicitly converts one legacy section into one open question without guessing its key or mutating original',()=>{
  const old={...material(),contentJson:{demo:false,sections:[{id:'old',title:'Раздел',body:'1. Первый вопрос\n2. Второй вопрос',answer:'Не угадывать 1,2',points:2}]}};
  const copy=JSON.stringify(old),converted=convertLegacyAssessment(old);
  expect(converted.contentJson).toMatchObject({schemaVersion:2,variants:[{questions:[{kind:'open',criteria:'',points:2,answerLines:6}]}]});
  expect(JSON.stringify(converted.contentJson)).not.toContain('Не угадывать');expect(JSON.stringify(old)).toBe(copy);expect(converted.status).toBe('draft');
 });
});
