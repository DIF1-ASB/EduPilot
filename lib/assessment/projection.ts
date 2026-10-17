import type {AssignmentRow} from '../assignments/service';
import type {PrivateAttempt} from './service';
import type {GradeResult} from './grading';
import type {AttemptDTO,LegacyAttemptDTO,PublicQuestion} from './public';
import type {Question,AnswerMap} from './schema';
type PolicyRow=Pick<AssignmentRow,'answerPolicy'|'maxAttempts'|'dueDate'|'solutionsReleasedAt'|'disclosureLockedAt'|'assessmentAttempts'>;
export function canRevealSolutions(assignment:PolicyRow,attempt:Pick<PrivateAttempt,'status'|'studentId'>,usedAttempts:number,now:Date):boolean{
 if(attempt.status!=='graded'&&attempt.status!=='pending_review')return false;
 if(assignment.assessmentAttempts.some(a=>a.studentId===attempt.studentId&&a.status==='in_progress'))return false;
 if(assignment.answerPolicy==='manual')return !!assignment.solutionsReleasedAt;
 if(assignment.answerPolicy==='after_due')return !!assignment.dueDate&&assignment.dueDate<=now;
 return assignment.answerPolicy==='after_last'&&usedAttempts>=assignment.maxAttempts;
}
export function toPublicQuestion(q:Question):PublicQuestion{return {id:q.id,kind:q.kind,prompt:q.prompt,points:q.points,answerLines:q.answerLines,
 ...((q.kind==='single'||q.kind==='multiple')?{options:q.options.map(o=>({id:o.id,label:o.label}))}:{})};}
function ownAnswers(raw:unknown):AnswerMap{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 return Object.fromEntries(Object.entries(raw).filter(([,value])=>typeof value==='string'||Array.isArray(value)&&value.every(v=>typeof v==='string')));
}
export function toStudentAttempt(assignment:PolicyRow,attempt:PrivateAttempt,usedAttempts:number,now:Date):AttemptDTO{
 const result=attempt.resultJson as unknown as GradeResult|null;
 const reviews=Array.isArray(attempt.reviewJson)?attempt.reviewJson as {questionId:string,comment:string}[]:[];
 return {id:attempt.id,assignmentId:attempt.assignmentId,number:attempt.number,variantId:attempt.variantId,status:attempt.status,version:attempt.version,
 startedAt:attempt.startedAt.toISOString(),expiresAt:attempt.expiresAt.toISOString(),submittedAt:attempt.submittedAt?.toISOString()??null,completionKind:attempt.completionKind,serverTime:now.toISOString(),
 answers:ownAnswers(attempt.submittedAnswersJson??attempt.draftAnswersJson),questions:attempt.snapshot.variants.find(v=>v.id===attempt.variantId)!.questions.map(toPublicQuestion),
 result:result?{score:result.score,autoScore:result.autoScore,maxScore:result.maxScore,
 teacherComments:reviews.map(m=>({questionId:m.questionId,comment:m.comment})),
 ...(canRevealSolutions(assignment,attempt,usedAttempts,now)?{solutions:result.items.map(i=>({questionId:i.questionId,correct:i.correct,answer:Array.isArray(i.answer)?[...i.answer]:i.answer,points:i.points,maxPoints:i.maxPoints,...(i.explanation?{explanation:i.explanation}:{})}))}:{})}:null};
}
export function toLegacyAttempt(row:{id:string,materialId:string,material:{title:string},score:number,createdAt:Date,answersJson:unknown}):LegacyAttemptDTO{
 const raw=row.answersJson&&typeof row.answersJson==='object'?row.answersJson as {maxScore?:unknown,answers?:unknown}:{};
 return {id:row.id,materialId:row.materialId,material:{title:row.material.title},createdAt:row.createdAt.toISOString(),score:row.score,
 maxScore:typeof raw.maxScore==='number'&&Number.isFinite(raw.maxScore)?raw.maxScore:0,answers:ownAnswers(raw.answers)};
}
