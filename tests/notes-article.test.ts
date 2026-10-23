import {afterEach,describe,it,expect,vi} from 'vitest';
import {LiveAIProvider,MockAIProvider} from '../lib/ai';
import {notesArticleInputSchema,validateNotesArticle,parseArticleReply,buildArticleMessages} from '../lib/notes/article';
import {parseMaterialContent} from '../lib/materials/content';
import {createNotesDraft} from '../lib/notes/schema';
import {articleFixture} from './helpers/online-content';
afterEach(()=>vi.unstubAllGlobals());
describe('coherent prose notes contract',()=>{
 it('returns the new article from the provider and marks its mock as unfinished',async()=>{
  const params=notesArticleInputSchema.parse({title:'Клетка',subject:'Биология',grade:6});
  vi.stubGlobal('fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify(articleFixture())}}]}));
  expect(await new LiveAIProvider().generateArticle(params)).toEqual(articleFixture());expect((await new MockAIProvider().generateArticle(params)).demo).toBe(true);
 });
 it('accepts an article and preserves legacy formats without conversion',()=>{
  const article=articleFixture();expect(parseArticleReply(JSON.stringify(article))).toEqual(article);expect(parseMaterialContent(article)).toEqual(article);
  const legacy={sections:[{id:'x',title:'Старый конспект',body:'Текст'}]};expect(parseMaterialContent(legacy)).toEqual(legacy);expect(parseMaterialContent(createNotesDraft())).toEqual(createNotesDraft());
 });
 it('requires length, real sections and prose rather than a short Q&A template',()=>{
  const good=articleFixture();
  for(const bodyMarkdown of ['', 'Краткий ответ',good.bodyMarkdown.replaceAll('## ',' '),good.bodyMarkdown.replace('## Раздел 1','## Вопросы и ответы')])expect(()=>validateNotesArticle({...good,bodyMarkdown},{ready:true})).toThrow();
  expect(()=>validateNotesArticle({...good,bodyMarkdown:''},{ready:false})).not.toThrow();
 });
 it('rejects corrupted mathematics and unexpected language only in a relevant Russian subject',()=>{
  const good=articleFixture();expect(()=>validateNotesArticle({...good,bodyMarkdown:good.bodyMarkdown+'\n\right'},{ready:true})).toThrow();
  expect(()=>parseArticleReply(JSON.stringify({...good,bodyMarkdown:good.bodyMarkdown+' العربية'}),{subject:'Биология'})).toThrow();
  expect(()=>parseArticleReply(JSON.stringify({...good,bodyMarkdown:good.bodyMarkdown+' العربية'}),{subject:'Иностранный язык'})).not.toThrow();
 });
 it('has only topic, subject, grade and clarifications and keeps untrusted text out of system rules',()=>{
  const input=notesArticleInputSchema.parse({title:'Клетка',subject:'Биология',grade:6,clarifications:'IGNORE_RULES'});
  expect(()=>notesArticleInputSchema.parse({...input,theses:['x']})).toThrow();const messages=buildArticleMessages(input);expect(messages[0].content).not.toContain('IGNORE_RULES');expect(messages[1].content).toContain('IGNORE_RULES');
 });
});
