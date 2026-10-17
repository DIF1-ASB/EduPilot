import type {Question,AnswerMap} from './schema';
export type PublicQuestion={id:string,kind:Question['kind'],prompt:string,points:number,answerLines:number,options?:{id:string,label:string}[]};
export type PublicSolution={questionId:string,correct:boolean|null,answer:string|string[],explanation?:string,points:number,maxPoints:number};
export type AttemptDTO={id:string,assignmentId:string,number:number,variantId:string,status:string,version:number,startedAt:string,expiresAt:string,
 submittedAt:string|null,completionKind:string|null,serverTime:string,answers:AnswerMap,questions:PublicQuestion[],
 result:null|{score:number|null,autoScore:number,maxScore:number,teacherComments:{questionId:string,comment:string}[],solutions?:PublicSolution[]}};
export type LegacyAttemptDTO={id:string,materialId:string,material:{title:string},createdAt:string,score:number,maxScore:number,answers:AnswerMap};
