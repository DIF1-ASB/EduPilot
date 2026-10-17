import { z } from 'zod';
import { documentSchema, type DocumentContent } from '../domain';
import { validateAssessment, type AssessmentDocument } from '../assessment/schema';

export type MaterialContent=DocumentContent|AssessmentDocument;
export function parseMaterialContent(raw:unknown):MaterialContent {
  if(raw && typeof raw==='object' && 'schemaVersion' in raw){
    return validateAssessment(raw,{publishable:false});
  }
  // Validate, but preserve historical JSON exactly, including omitted defaults.
  documentSchema.parse(raw);
  return raw as DocumentContent;
}
export const materialContentSchema=z.unknown().transform((raw,ctx)=>{
  try{return parseMaterialContent(raw);}catch(error){
    if(error instanceof z.ZodError)for(const issue of error.issues)ctx.addIssue(issue);
    else ctx.addIssue({code:'custom',message:'Некорректный материал'});
    return z.NEVER;
  }
});
export function materialSections(content:MaterialContent,teacher=false):DocumentContent {
  if(!('schemaVersion' in content))return content;
  return {demo:content.demo,sections:content.variants.flatMap(v=>v.questions.map((q,index)=>({
    id:q.id,title:`${v.label} · Задание ${index+1}`,body:q.prompt,points:q.points,
    ...(q.kind==='single'||q.kind==='multiple'?{options:q.options.map(o=>o.label)}:{}),
    ...(teacher?{answer:(q.kind==='single'||q.kind==='multiple'?q.correctOptionIds.map(id=>q.options.find(o=>o.id===id)!.label).join('; '):q.kind==='open'?q.criteria:q.acceptedAnswers.join('; '))+(q.explanation?'\n'+q.explanation:'')}:{})
  })))};
}
