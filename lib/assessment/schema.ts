import { z } from 'zod';

export const questionKinds = ['single','multiple','short','numeric','open'] as const;
export type QuestionKind = typeof questionKinds[number];
export function defaultAnswerLines(kind: QuestionKind): number {
  return kind === 'open' ? 6 : kind === 'single' || kind === 'multiple' ? 1 : 2;
}
const id = z.string().min(1).max(100).regex(/^[\p{L}\p{N}_-]+$/u);
const base = { id, prompt:z.string().trim().min(1).max(20000), points:z.number().int().min(0).max(1000),
  answerLines:z.number().int().min(1).max(12).optional(), explanation:z.string().max(10000).optional() };
const choices = {options:z.array(z.object({id,label:z.string().trim().min(1).max(2000)}).strict()).min(2).max(10),correctOptionIds:z.array(id).max(10).default([])};
const rawQuestion = z.discriminatedUnion('kind',[
  z.object({...base,kind:z.literal('single'),...choices}).strict(),
  z.object({...base,kind:z.literal('multiple'),...choices}).strict(),
  z.object({...base,kind:z.literal('short'),acceptedAnswers:z.array(z.string().trim().min(1).max(10000)).max(30).default([])}).strict(),
  z.object({...base,kind:z.literal('numeric'),acceptedAnswers:z.array(z.string().trim().min(1).max(100)).max(30).default([])}).strict(),
  z.object({...base,kind:z.literal('open'),criteria:z.string().max(10000).default('')}).strict(),
]);
export const questionSchema = rawQuestion.transform(q=>({...q,answerLines:q.answerLines ?? defaultAnswerLines(q.kind)}));
export type Question = z.infer<typeof questionSchema>;
const assessmentBase = z.object({schemaVersion:z.literal(2),kind:z.literal('assessment'),demo:z.boolean(),
  instructions:z.string().max(10000),variants:z.array(z.object({id,label:z.string().trim().min(1).max(200),
    questions:z.array(questionSchema).min(1).max(30)}).strict()).min(1).max(4)}).strict();
export type AssessmentDocument = z.infer<typeof assessmentBase>;
export function validateAssessment(raw:unknown,{publishable}:{publishable:boolean}):AssessmentDocument {
  const doc = assessmentBase.parse(raw);
  const issues:z.ZodIssue[]=[];
  const bad=(message:string,path:(string|number)[])=>issues.push({code:'custom',message,path});
  const variants=new Set<string>(), questions=new Set<string>(); let total=0, expected:number|undefined;
  doc.variants.forEach((v,vi)=>{
    if(variants.has(v.id)) bad('Повтор идентификатора варианта',['variants',vi,'id']); variants.add(v.id);
    let sum=0; total+=v.questions.length;
    v.questions.forEach((q,qi)=>{
      const path=['variants',vi,'questions',qi];
      if(questions.has(q.id)) bad('Повтор идентификатора вопроса',[...path,'id']); questions.add(q.id); sum+=q.points;
      if(q.kind==='single'||q.kind==='multiple'){
        const optionIds=new Set(q.options.map(o=>o.id));
        if(optionIds.size!==q.options.length) bad('Повтор варианта ответа',path);
        if(new Set(q.correctOptionIds).size!==q.correctOptionIds.length || q.correctOptionIds.some(k=>!optionIds.has(k))) bad('Некорректный ключ',path);
        if(q.kind==='single'&&q.correctOptionIds.length>1) bad('Допустим один ключ',path);
        if(publishable && !q.correctOptionIds.length) bad('Укажите правильный ответ',path);
      } else if(publishable && (q.kind==='open' ? !q.criteria.trim() : !q.acceptedAnswers.length)) bad('Заполните ключ или критерии',path);
    });
    if(sum<1||sum>1000) bad('Сумма баллов должна быть от 1 до 1000',['variants',vi]);
    if(expected!==undefined && sum!==expected) bad('Суммы баллов вариантов различаются',['variants',vi]); expected=sum;
  });
  if(total>100) bad('Не более 100 вопросов', ['variants']);
  if(issues.length) throw new z.ZodError(issues);
  return doc;
}
export const assessmentSchema=z.unknown().transform((raw,ctx)=>{
  try{return validateAssessment(raw,{publishable:false});}catch(error){
    if(error instanceof z.ZodError) for(const issue of error.issues)ctx.addIssue(issue);
    else ctx.addIssue({code:'custom',message:'Некорректная контрольная'});
    return z.NEVER;
  }
});
export type AnswerMap=Record<string,string|string[]>;
export function validateAnswers(doc:AssessmentDocument,variantId:string,raw:unknown):AnswerMap {
  const variant=doc.variants.find(v=>v.id===variantId);
  if(!variant) throw new Error('Неизвестный вариант');
  const answers=z.record(z.union([z.string().max(20000),z.array(z.string().max(100)).max(10)])).parse(raw);
  for(const [key,value] of Object.entries(answers)){
    const q=variant.questions.find(q=>q.id===key);
    if(!q)throw new Error('Неизвестный вопрос');
    if(q.kind==='multiple'){
      if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(id=>!q.options.some(o=>o.id===id)))throw new Error('Некорректный выбор');
    }else{
      if(typeof value!=='string')throw new Error('Ожидается текстовый ответ');
      if(q.kind==='single' && value!==''&&!q.options.some(o=>o.id===value))throw new Error('Неизвестный ответ');
      if(q.kind==='numeric' && value.length>100)throw new Error('Число слишком длинное');
    }
  }
  return answers;
}
