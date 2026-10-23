import {db} from '../database';
import {fail} from '../security';
import {epochSql} from '../assessment/store';
export type AssessmentProgressEntry={source:'assessment';attemptId:string;assignmentId:string;assignmentTitle:string;studentId:string;studentName:string;subject:string;topic:string;grade:number;classId:string;className:string;contextSource:'snapshot'|'legacy-current';submittedAt:string;number:number;status:string;completionKind:string|null;score:number|null;maxScore:number|null;percentage:number|null;durationMs:number};
export type AssessmentProgressDTO={history:AssessmentProgressEntry[];latest:AssessmentProgressEntry[];totals:{completedWorks:number;awaitingReview:number;score:number;maxScore:number;percentage:number|null};topics:{id:string;subject:string;topic:string;source:'assessment'}[]};
const numeric=(value:unknown):number|null=>value===null||value===undefined||!Number.isFinite(Number(value))?null:Number(value);
const date=(value:unknown)=>new Date(typeof value==='bigint'?Number(value):value as string|number);
const percentage=(score:number,max:number)=>Math.round(score/max*10000)/100;
function summarize(history:AssessmentProgressEntry[]):AssessmentProgressDTO{
 const byWork=new Map<string,AssessmentProgressEntry>();for(const entry of history)byWork.set(JSON.stringify([entry.studentId,entry.assignmentId]),entry);
 const latest=[...byWork.values()],scored=latest.filter(e=>e.status==='graded'&&e.score!==null&&e.maxScore!==null&&e.maxScore>0);
 const score=scored.reduce((sum,e)=>sum+e.score!,0),maxScore=scored.reduce((sum,e)=>sum+e.maxScore!,0);
 const topics=[...new Map(history.map(e=>[e.assignmentId,{id:e.assignmentId,subject:e.subject,topic:e.topic,source:'assessment' as const}])).values()];
 return {history,latest,totals:{completedWorks:latest.length,awaitingReview:latest.filter(e=>e.status==='pending_review').length,score,maxScore,percentage:maxScore>0?percentage(score,maxScore):null},topics};
}
async function read(where:string,params:string[]):Promise<AssessmentProgressDTO>{
 const rows=await(await db()).$queryRawUnsafe<Record<string,unknown>[]>(`SELECT a.id,a.assignmentId,a.studentId,a.number,a.status,a.completionKind,a.startedAt,a.expiresAt,a.submittedAt,
 x.title AS assignmentTitle,c.id AS classId,c.name AS className,u.firstName,u.lastName,
 COALESCE(json_extract(x.contextJson,'$.title'),m.title) AS topic,COALESCE(json_extract(x.contextJson,'$.subject'),m.subject) AS subject,
 COALESCE(json_extract(x.contextJson,'$.grade'),m.grade) AS grade,json_extract(x.contextJson,'$.title') AS savedTopic,
 json_extract(a.resultJson,'$.score') AS score,json_extract(a.resultJson,'$.maxScore') AS maxScore
 FROM AssessmentAttempt a JOIN Assignment x ON x.id=a.assignmentId JOIN SchoolClass c ON c.id=x.classId JOIN Material m ON m.id=x.materialId JOIN User u ON u.id=a.studentId
 WHERE x.kind='test' AND a.status IN ('graded','pending_review') AND a.submittedAt IS NOT NULL
 AND COALESCE(json_extract(x.snapshotJson,'$.demo'),0)=0 AND ${where}
 ORDER BY ${epochSql('a.submittedAt')},a.id`,...params);
 const history:AssessmentProgressEntry[]=rows.map(row=>{
  const maximum=numeric(row.maxScore),rawScore=numeric(row.score),score=row.status==='graded'&&rawScore!==null&&maximum!==null&&maximum>0&&rawScore>=0&&rawScore<=maximum?rawScore:null;
  const started=date(row.startedAt).getTime(),submitted=date(row.submittedAt),expires=date(row.expiresAt).getTime();
  return {source:'assessment',attemptId:String(row.id),assignmentId:String(row.assignmentId),assignmentTitle:String(row.assignmentTitle),studentId:String(row.studentId),studentName:`${row.firstName} ${row.lastName}`,subject:String(row.subject),topic:String(row.topic),grade:Number(row.grade),classId:String(row.classId),className:String(row.className),contextSource:row.savedTopic===null?'legacy-current':'snapshot',submittedAt:submitted.toISOString(),number:Number(row.number),status:String(row.status),completionKind:row.completionKind===null?null:String(row.completionKind),score,maxScore:maximum,percentage:score!==null&&maximum!==null?percentage(score,maximum):null,durationMs:Math.max(0,Math.min(submitted.getTime(),expires)-started)};
 });
 return summarize(history);
}
export async function studentAssessmentProgress(userId:string):Promise<AssessmentProgressDTO>{return read('a.studentId=?',[userId]);}
export async function teacherAssessmentProgress(teacherId:string,{classId,studentId}:{classId?:string;studentId?:string}={}):Promise<AssessmentProgressDTO>{
 const client=await db();
 if(classId&&!await client.schoolClass.count({where:{id:classId,teacherId}}))fail(403,'Нет доступа к классу.');
 if(studentId){
  const scope={class:{teacherId,...(classId?{id:classId}:{})}};
  const enrolled=await client.enrollment.count({where:{studentId,...scope}});
  const historical=enrolled?0:await client.assessmentAttempt.count({where:{studentId,assignment:scope}});
  if(!enrolled&&!historical)fail(403,'Нет результатов этого ученика в ваших классах.');
 }
 return read(`c.teacherId=?${classId?' AND c.id=?':''}${studentId?' AND a.studentId=?':''}`,[teacherId,...(classId?[classId]:[]),...(studentId?[studentId]:[])]);
}
