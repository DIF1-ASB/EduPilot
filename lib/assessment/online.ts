import {z} from 'zod';
import type {ConversationMessage} from '../ai';
import {generatorSchema} from '../domain';
import {assertSafeMathText} from '../content/math';
import {buildAssessmentMessages} from './generation';
import {validateAssessment,type AssessmentDocument} from './schema';

export const onlineTestInputSchema=z.object({title:z.string().trim().min(2).max(200),subject:z.string().trim().min(1).max(100),grade:z.coerce.number().int().min(1).max(11),count:z.coerce.number().int().min(5).max(30).default(10),difficulty:z.enum(['Простой','Средний','Сложный']).default('Средний'),clarifications:z.string().max(4000).default('')}).strict();
export type OnlineTestInput=z.infer<typeof onlineTestInputSchema>;
export const mathPrompt='Формулы: $...$ внутри строки, $$ на отдельных строках для блочных. Русский текст внутри формул оборачивай в \\text{...}. В JSON экранируй каждый обратный слеш вторым слешем. Не включай скрытые рассуждения.';
export function buildOnlineTestMessages(input:OnlineTestInput,invalidReply?:string):ConversationMessage[]{
 const p=onlineTestInputSchema.parse(input);
 const messages=buildAssessmentMessages(generatorSchema.parse({...p,type:'test',variants:1,maxScore:p.count,questionTypes:['single'],instructions:p.clarifications}),invalidReply);
 messages[0].content+='\n'+mathPrompt+'\nТолько single: в каждом вопросе четыре различных непустых варианта, ровно один однозначно верный ключ, ровно 1 балл и отдельный непустой explanation для преподавателя. Не добавляй свободные критерии, частичные баллы, «все ответы верны», «нет правильного ответа». Все вопросы проверяют именно указанную тему и возраст. Проверь ключи подстановкой или предметным правилом; объяснения не помещай в ученическое условие.';
 return messages;
}
const normalized=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/\s+/g,' ');
export function validateOnlineTest(raw:unknown,{count,publishable=true}:{count?:number;publishable?:boolean}={}):AssessmentDocument{
 assertSafeMathText(raw);
 const doc=validateAssessment(raw,{publishable});
 if(doc.variants.length!==1)throw Error('Онлайн-контрольная должна содержать один вариант.');
 const questions=doc.variants[0].questions;
 if(questions.length<5||questions.length>30||(count!==undefined&&questions.length!==count))throw Error('Количество вопросов не соответствует запросу.');
 const seen=new Set<string>();
 for(const q of questions){
  if(q.kind!=='single'||q.points!==1||q.options.length!==4||new Set(q.options.map(o=>normalized(o.label))).size!==4)throw Error('Нужны четыре различных варианта, single и один балл.');
  if(publishable&&(!q.explanation?.trim()||q.correctOptionIds.length!==1))throw Error('Нужны один верный ключ и отдельное объяснение.');
  const text=normalized(q.prompt);if(seen.has(text))throw Error('Вопросы не должны повторяться.');seen.add(text);
 }
 return doc;
}
export function parseOnlineTestReply(raw:string,input:OnlineTestInput):AssessmentDocument{
 const doc=validateOnlineTest(JSON.parse(raw),{count:input.count});
 if(doc.demo)throw Error('Провайдер вернул демонстрационный шаблон вместо работы.');return doc;
}
export function canonicalizeQuizOptionIds(doc:AssessmentDocument):AssessmentDocument{
 const copy=structuredClone(doc);
 for(const variant of copy.variants)for(const q of variant.questions)if(q.kind==='single'||q.kind==='multiple'){
  const ids=new Map(q.options.map(o=>[o.id,crypto.randomUUID()]));
  q.options=q.options.map(o=>({...o,id:ids.get(o.id)!}));q.correctOptionIds=q.correctOptionIds.map(id=>ids.get(id)!);
 }
 return copy;
}
export function onlineTestDraft(input:OnlineTestInput):AssessmentDocument{
 return {schemaVersion:2,kind:'assessment',demo:true,instructions:'Демонстрационный черновик: заполните и проверьте вопросы перед выдачей.',variants:[{id:crypto.randomUUID(),label:'Вариант 1',questions:Array.from({length:input.count},(_,i)=>({id:crypto.randomUUID(),kind:'single',prompt:`Задание ${i+1} по теме «${input.title}»: введите условие.`,points:1,answerLines:1,options:Array.from({length:4},(_,j)=>({id:crypto.randomUUID(),label:`Вариант ответа ${j+1}`})),correctOptionIds:[],explanation:''}))}]};
}
