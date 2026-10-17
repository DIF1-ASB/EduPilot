import type {MaterialRecord} from '../domain';
import {parseMaterialContent} from '../materials/content';
import type {AttemptDTO,PublicQuestion} from './public';
export type SheetBlock={id:string,title:string,prompt:string,options:{id:string,label:string}[],points:number|undefined,answerLines:number};
export type AnswerSheet={title:string,subject:string,grade:number,instructions:string,variantLabel:string,blocks:SheetBlock[],teacherKeys?:{questionId:string,answer:string,criteria?:string}[]};
const block=(q:PublicQuestion,index:number):SheetBlock=>({id:q.id,title:`Задание ${index+1}`,prompt:q.prompt,options:q.options?.map(o=>({...o}))??[],points:q.points,answerLines:q.answerLines});
export function buildStudentAnswerSheet(meta:Pick<AnswerSheet,'title'|'subject'|'grade'>,attempt:AttemptDTO):AnswerSheet{
 return {...meta,instructions:attempt.instructions,variantLabel:attempt.variantLabel,blocks:attempt.questions.map(block)};
}
export function buildAnswerSheet(material:MaterialRecord,{variantId,includeTeacherKeys}:{variantId?:string,includeTeacherKeys:boolean}):AnswerSheet{
 const content=parseMaterialContent(material.contentJson),base={title:material.title,subject:material.subject,grade:material.grade};
 if(!('schemaVersion' in content))return {...base,instructions:'',variantLabel:'',blocks:content.sections.map(s=>({id:s.id,title:s.title,prompt:s.body,options:s.options?.map((label,i)=>({id:String(i+1),label}))??[],points:s.points,answerLines:6})),
  ...(includeTeacherKeys?{teacherKeys:content.sections.filter(s=>s.answer).map(s=>({questionId:s.id,answer:s.answer!}))}:{})};
 if(content.kind!=='assessment')throw new Error('Бланк доступен для контрольной или рабочего листа.');
 const variant=variantId?content.variants.find(v=>v.id===variantId):content.variants[0];if(!variant)throw new Error('Вариант не найден.');
 return {...base,instructions:content.instructions,variantLabel:variant.label,blocks:variant.questions.map(block),...(includeTeacherKeys?{teacherKeys:variant.questions.map(q=>({questionId:q.id,
  answer:q.kind==='single'||q.kind==='multiple'?q.correctOptionIds.map(id=>q.options.find(o=>o.id===id)?.label??'').join('; '):q.kind==='open'?'Ручная проверка':q.acceptedAnswers.join('; '),
  ...((q.kind==='open'?q.criteria:q.explanation)?{criteria:q.kind==='open'?[q.criteria,q.explanation].filter(Boolean).join('\n'):q.explanation}:{})}))}:{})};
}
export function buildAllAnswerSheets(material:MaterialRecord,includeTeacherKeys:boolean):AnswerSheet[]{
 const content=parseMaterialContent(material.contentJson);
 return 'schemaVersion' in content&&content.kind==='assessment'?content.variants.map(v=>buildAnswerSheet(material,{variantId:v.id,includeTeacherKeys})):[buildAnswerSheet(material,{includeTeacherKeys})];
}
