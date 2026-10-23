import {describe,it,expect} from 'vitest';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {NotesForm} from '../components/notes/form';import {NotesArticlePreview} from '../components/notes/article-preview';import {NotesArticleEditor} from '../components/notes/article-editor';
import {AppContext} from '../components/app-context';import {articleFixture} from './helpers/online-content';
const render=(child:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(AppContext.Provider,{value:{user:{id:'student',role:'student',settings:{}},ai:{mode:'mock',jobsAvailable:true},navigate:()=>{},refresh:async()=>{}}},child));
describe('full prose notes interface',()=>{
 it('uses topic, subject, grade and optional clarifications, not lesson or thesis fields',()=>{
  const html=render(createElement(NotesForm,{onCreated:()=>{}}));for(const name of ['title','subject','grade','clarifications'])expect(html).toContain('name="'+name+'"');for(const name of ['volume','sourceText','focus','theses','duration','equipment','selfCheck'])expect(html).not.toContain('name="'+name+'"');expect(html).toContain('700–1000');expect(html).toContain('Заполнить вручную');
 });
 it('renders an article with headings, paragraphs and mathematics and keeps export actions',()=>{
  const doc={...articleFixture(),bodyMarkdown:articleFixture().bodyMarkdown+'\n\nПример: \\(x=2\\).'},html=renderToStaticMarkup(createElement(NotesArticlePreview,{document:doc as any}));expect(html).toContain('<h2>Раздел 1</h2>');expect(html).toContain('katex');expect(html).not.toContain('Минут');
  const material={id:'article',title:'Уравнения',type:'notes',subject:'Математика',grade:7,status:'draft',version:1,contentJson:doc,metadataJson:{generated:true},createdAt:'',updatedAt:''} as any;
  const editor=render(createElement(NotesArticleEditor,{material,onSave:async m=>m}));expect(editor).toContain('Редактировать текст');expect(editor).toContain('DOCX');expect(editor).toContain('PDF');expect(editor).toContain('ИИ может ошибаться');expect(editor).not.toMatch(/Добавить тезис|Самопроверка|Критерии ручной/);
 });
});
