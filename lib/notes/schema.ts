import {z} from 'zod';
export const notesInputSchema=z.object({title:z.string().trim().min(2).max(200),subject:z.string().trim().min(1).max(100),grade:z.coerce.number().int().min(1).max(11),
 volume:z.enum(['short','normal','detailed']).default('normal'),sourceText:z.string().max(20000).default(''),focus:z.string().max(2000).default('')}).strict();
export type NotesInput=z.infer<typeof notesInputSchema>;
const notesSchema=z.object({schemaVersion:z.literal(2),kind:z.literal('notes'),demo:z.boolean(),summary:z.string().max(12000),
 concepts:z.array(z.object({term:z.string().max(300),definition:z.string().max(2000)}).strict()).max(40),
 theses:z.array(z.string().max(4000)).max(30),examples:z.array(z.object({title:z.string().max(300),body:z.string().max(8000)}).strict()).max(15),
 conclusion:z.string().max(12000),selfCheck:z.array(z.object({id:z.string().min(1).max(100),question:z.string().max(3000),answer:z.string().max(6000)}).strict()).max(5)}).strict();
export type NotesDocument=z.infer<typeof notesSchema>;
export function createNotesDraft():NotesDocument{return {schemaVersion:2,kind:'notes',demo:false,summary:'',concepts:[],theses:[],examples:[],conclusion:'',selfCheck:[]};}
export function validateNotes(raw:unknown,{ready}:{ready:boolean}):NotesDocument{
 const doc=notesSchema.parse(raw),issues:z.ZodIssue[]=[];
 const bad=(message:string,path:(string|number)[])=>issues.push({code:'custom',message,path});
 if(new Set(doc.selfCheck.map(q=>q.id)).size!==doc.selfCheck.length)bad('Вопросы самопроверки должны иметь разные id',['selfCheck']);
 if(ready){
  if(!doc.summary.trim())bad('Заполните краткую суть',['summary']);if(!doc.conclusion.trim())bad('Заполните итог',['conclusion']);
  if(!doc.concepts.length&&!doc.theses.length)bad('Добавьте понятия или тезисы',['concepts']);
  doc.concepts.forEach((c,i)=>{if(!c.term.trim()||!c.definition.trim())bad('Заполните понятие и объяснение',['concepts',i]);});
  doc.theses.forEach((t,i)=>{if(!t.trim())bad('Тезис не может быть пустым',['theses',i]);});
  doc.examples.forEach((e,i)=>{if(!e.title.trim()||!e.body.trim())bad('Заполните пример или удалите пустой блок',['examples',i]);});
  if(doc.selfCheck.length<3)bad('Для готового конспекта нужно 3–5 вопросов самопроверки',['selfCheck']);
  doc.selfCheck.forEach((q,i)=>{if(!q.question.trim()||!q.answer.trim())bad('Заполните вопрос и ответ',['selfCheck',i]);});
  const text=[doc.summary,doc.conclusion,...doc.theses,...doc.concepts.map(c=>c.definition)].filter(s=>s.trim());
  if(text.length&&text.every(s=>/^(?:\[(?:заполните|добавьте|укажите)[\s\S]*\]|(?:заполните|добавьте|укажите)(?:\s[\s\S]*)?|\.{3}|…|_{2,})$/iu.test(s.trim())))bad('Шаблон нужно содержательно заполнить перед отметкой готовности',['summary']);
 }
 if(issues.length)throw new z.ZodError(issues);return doc;
}
