import {afterEach,describe,it,expect,vi} from 'vitest';
import {LiveAIProvider,MockAIProvider} from '../lib/ai';
import {notesArticleInputSchema,validateNotesArticle,parseArticleReply,buildArticleMessages} from '../lib/notes/article';
import {parseMaterialContent} from '../lib/materials/content';
import {createNotesDraft} from '../lib/notes/schema';
import {articleFixture} from './helpers/online-content';
import {withoutAnswers} from '../lib/domain';
afterEach(()=>vi.unstubAllGlobals());
describe('coherent prose notes contract',()=>{
 it('rejects an English connector in Russian prose without rejecting equations, code or quotations',()=>{
  const good=articleFixture(),context={subject:'Математика'};
  expect(()=>parseArticleReply(JSON.stringify({...good,bodyMarkdown:good.bodyMarkdown+'\nВыполните проверку within исходного уравнения.'}),context)).toThrow(/языков/);
  for(const extra of ['\nФормула $x \\in A$.','\n\n    within the loop','\nСлово «within» переводится как «внутри».'])expect(()=>parseArticleReply(JSON.stringify({...good,bodyMarkdown:good.bodyMarkdown+extra}),context)).not.toThrow();
  expect(()=>parseArticleReply(JSON.stringify({...good,bodyMarkdown:good.bodyMarkdown+'\nRead within the text.'}),{subject:'Английский язык'})).not.toThrow();
 });
 it('preserves the article discriminator for a safe student export instead of flattening Markdown',()=>{
  const content=articleFixture(),safe=withoutAnswers({contentJson:content,metadataJson:{privateField:'must-not-leak'}});expect(safe.contentJson).toEqual(content);expect(safe.metadataJson).toEqual({});
 });
 it('returns the new article from the provider and marks its mock as unfinished',async()=>{
  const params=notesArticleInputSchema.parse({title:'Клетка',subject:'Биология',grade:6});
  vi.stubGlobal('fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify(articleFixture())}}]}));
  expect(await new LiveAIProvider().generateArticle(params)).toEqual(articleFixture());expect((await new MockAIProvider().generateArticle(params)).demo).toBe(true);
 });
 it('sends the rejected article as assistant history and its validation problem as repair feedback',async()=>{
  const previousReply=JSON.stringify({schemaVersion:3,kind:'notes-article',demo:false,bodyMarkdown:'## Уравнение\n\nСлишком короткое объяснение.'});
  const validationError='Конспект должен содержать 700–1100 слов; сейчас 425.';
  let sent:any;
  vi.stubGlobal('fetch',async(_url:unknown,init:RequestInit)=>{sent=JSON.parse(String(init.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(articleFixture())}}]});});
  const result=await new LiveAIProvider().generateArticle({title:'Линейные уравнения',subject:'Математика',grade:7,clarifications:''},undefined,JSON.stringify({previousReply,validationError}));
  expect(result).toEqual(articleFixture());
  expect(sent.messages.at(-2)).toEqual({role:'assistant',content:previousReply});
  expect(sent.messages.at(-1).role).toBe('user');expect(sent.messages.at(-1).content).toContain(validationError);
  expect(sent.messages[0].content).not.toContain(validationError);
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
