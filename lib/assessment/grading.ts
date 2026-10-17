import {validateAnswers,type AssessmentDocument,type AnswerMap} from './schema';
export type PrivateQuestionResult={questionId:string,points:number,maxPoints:number,correct:boolean|null,answer:string|string[],explanation?:string};
export type GradeResult={autoScore:number,maxScore:number,score:number|null,pendingQuestionIds:string[],items:PrivateQuestionResult[]};
const LIMIT=BigInt('1000000000000000000'),ZERO=BigInt(0),ONE=BigInt(1);
const abs=(n:bigint)=>n<ZERO?-n:n;
export function normalizeNumeric(raw:string):{numerator:bigint,denominator:bigint}|null{
 if(raw.length>100)return null;const value=raw.trim().replace(',','.');let numerator:bigint,denominator:bigint;
 const fraction=/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(value),decimal=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
 if(fraction){numerator=BigInt(fraction[1]);denominator=BigInt(fraction[2]);}
 else if(decimal){const digits=decimal[3]??'';if(digits.length>18)return null;denominator=BigInt('1'+'0'.repeat(digits.length));numerator=BigInt((decimal[1]==='-'?'-':'')+decimal[2]+digits);}
 else return null;
 if(denominator===ZERO||abs(numerator)>LIMIT||abs(denominator)>LIMIT)return null;
 if(denominator<ZERO){denominator=-denominator;numerator=-numerator;}
 let a=abs(numerator),b=denominator;while(b!==ZERO){const r=a%b;a=b;b=r;}const divisor=a||ONE;
 return {numerator:numerator/divisor,denominator:denominator/divisor};
}
const normalizedText=(s:string)=>s.normalize('NFC').trim().toLowerCase().replace(/\s+/gu,' ');
export const hasAnswers=(answers:AnswerMap)=>Object.values(answers).some(value=>Array.isArray(value)?value.length>0:!!value.trim());
export function gradeVariant(document:AssessmentDocument,variantId:string,raw:unknown):GradeResult{
 const answers=validateAnswers(document,variantId,raw),variant=document.variants.find(v=>v.id===variantId)!;
 const pendingQuestionIds:string[]=[];
 const items:PrivateQuestionResult[]=variant.questions.map(q=>{
  const value=answers[q.id]??(q.kind==='multiple'?[]:'');let correct:boolean|null=false;
  let answer:string|string[];
  if(q.kind==='single'||q.kind==='multiple'){
   answer=q.correctOptionIds;
   correct=q.kind==='single'?typeof value==='string'&&q.correctOptionIds[0]===value:Array.isArray(value)&&value.length===q.correctOptionIds.length&&q.correctOptionIds.every(k=>value.includes(k));
  }else if(q.kind==='short'){answer=q.acceptedAnswers;correct=typeof value==='string'&&!!value.trim()&&q.acceptedAnswers.some(k=>normalizedText(k)===normalizedText(value));}
  else if(q.kind==='numeric'){
   answer=q.acceptedAnswers;const number=typeof value==='string'?normalizeNumeric(value):null;
   correct=!!number&&q.acceptedAnswers.some(k=>{const expected=normalizeNumeric(k);return !!expected&&number.numerator===expected.numerator&&number.denominator===expected.denominator;});
  }else{
   answer=q.criteria;
   if(q.points>0&&typeof value==='string'&&value.trim()){pendingQuestionIds.push(q.id);correct=null;}
  }
  return {questionId:q.id,points:correct===true?q.points:0,maxPoints:q.points,correct,answer,...(q.explanation?{explanation:q.explanation}:{})};
 });
 const autoScore=items.reduce((s,i)=>s+i.points,0),maxScore=items.reduce((s,i)=>s+i.maxPoints,0);
 return {autoScore,maxScore,score:pendingQuestionIds.length?null:autoScore,pendingQuestionIds,items};
}
