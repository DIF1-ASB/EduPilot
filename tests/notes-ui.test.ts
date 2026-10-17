import {describe,it,expect} from 'vitest';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {NotesForm} from '../components/notes/form';import {NotesEditor} from '../components/notes/editor';import {NotesPreview} from '../components/notes/preview';
import {AppContext} from '../components/app-context';import {createNotesDraft} from '../lib/notes/schema';import type {MaterialRecord} from '../lib/domain';
const render=(child:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(AppContext.Provider,{value:{user:{id:'student',role:'student',settings:{}},navigate:()=>{},refresh:async()=>{},ai:{mode:'mock'}}},child));
const material=():MaterialRecord=>({id:'notes',type:'notes',title:'Мой конспект',subject:'Математика',grade:7,status:'draft',version:1,contentJson:createNotesDraft(),metadataJson:{},createdAt:'',updatedAt:'',canEdit:true});
describe('specialized notes UI',()=>{
 it('has independent topic/volume/source fields and manual creation, not lesson fields',()=>{
  const html=render(createElement(NotesForm,{onCreated:()=>{}}));
  for(const text of ['Тема','Объём','Исходный текст','Заполнить вручную'])expect(html).toContain(text);
  for(const name of ['duration','equipment','lessonType'])expect(html).not.toContain('name="'+name+'"');
 });
 it('renders legacy notes without minutes or rewriting and v2 with proper editable blocks',()=>{
  const legacy={...material(),contentJson:{demo:false,totalDuration:45,sections:[{id:'old',title:'Тема',body:'Исторический текст',duration:15}]}};
  const html=render(createElement(NotesEditor,{material:legacy,onSave:async m=>m}));expect(html).toContain('Исторический текст');expect(html).not.toContain('Минут');expect(html).not.toContain('name="duration"');
  const modern=render(createElement(NotesEditor,{material:material(),onSave:async m=>m}));for(const text of ['Суть темы','Добавить понятие','Добавить тезис','Добавить вопрос самопроверки'])expect(modern).toContain(text);
 });
 it('keeps self-check answers behind a separate disclosure in the on-screen preview',()=>{
  const doc={...createNotesDraft(),summary:'Суть',conclusion:'Итог',selfCheck:[{id:'q',question:'Вопрос?',answer:'Ответ для проверки'}]};
  const html=renderToStaticMarkup(createElement(NotesPreview,{document:doc}));expect(html).toContain('<details');expect(html).toContain('Показать ответ');expect(html).toContain('Ответ для проверки');
 });
});
