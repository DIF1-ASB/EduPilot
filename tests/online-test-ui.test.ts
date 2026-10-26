import type {MaterialRecord} from '../lib/domain';
import {describe,it,expect} from 'vitest';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {AppContext} from '../components/app-context';
import {CreateOnlineTest} from '../components/assessment/create-test';
import {OnlineTestEditor,editOnlineQuestion} from '../components/assessment/online-editor';
import {GenerationStatus} from '../components/generation/status';
import {quizFixture} from './helpers/online-content';
const render=(child:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(AppContext.Provider,{value:{user:{id:'teacher',role:'teacher',settings:{}},ai:{jobsAvailable:true,mode:'mock'},navigate:()=>{},refresh:async()=>{}}},child));
const material=():MaterialRecord=>({id:'quiz',title:'Уравнения',type:'test',subject:'Математика',grade:7,status:'ready',version:1,contentJson:quizFixture(),metadataJson:{onlineTestVersion:1,keysConfirmed:true},createdAt:'',updatedAt:''});
describe('short online test creation and teacher confirmation',()=>{
 it('asks for topic, subject, school grade and optional details rather than grading criteria or printed sheets',()=>{
  const html=render(createElement(CreateOnlineTest,{onCreated:()=>{}}));for(const name of ['title','subject','grade','clarifications','count','difficulty'])expect(html).toContain('name="'+name+'"');
  for(const name of ['criteria','questionTypes','answerLines','variants','maxScore'])expect(html).not.toContain('name="'+name+'"');expect(html).toContain('value="10"');expect(html).not.toMatch(/Скачать.*(?:DOCX|PDF)/);
 });
 it('shows a teacher-only draft preview and resets confirmation on every question edit',()=>{
  const m=material(),html=render(createElement(OnlineTestEditor,{material:m,onChange:()=>{},onSave:async()=>m}));expect(html).toContain('Перед выдачей');expect(html).toContain('Прибавляем единицу.');expect(html).not.toMatch(/Скачать.*(?:DOCX|PDF)|Строк для ответа/);
  const edited=editOnlineQuestion(m,'q0',{prompt:'Новое условие'});expect(edited.metadataJson.keysConfirmed).toBe(false);expect(edited.status).toBe('draft');expect(m.metadataJson.keysConfirmed).toBe(true);
 });
 it('offers completed background results explicitly instead of silently replacing the form',()=>{
  const html=renderToStaticMarkup(createElement(GenerationStatus,{jobs:[{id:'job',kind:'test',state:'completed',materialId:'quiz',createdAt:'2026-10-23T12:00:00Z',updatedAt:'2026-10-23T12:00:00Z'}],onOpen:()=>{},onCancel:async()=>{}}));expect(html).toContain('Открыть черновик');expect(html).not.toContain('correctOptionIds');
 });
});
