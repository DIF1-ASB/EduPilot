import {getRuntime,config} from '../runtime';
export type SqlStatement={sql:string,params:(string|number|null)[]};
export type BatchResult={rows:Record<string,unknown>[],changes:number};
export async function runAssessmentBatch(statements:SqlStatement[]):Promise<BatchResult[]>{
 const binding=getRuntime()?.DB;
 if(binding){
  const result=await binding.batch<Record<string,unknown>>(statements.map(({sql,params})=>binding.prepare(sql).bind(...params)));
  return result.map(r=>{if(!r.success)throw new Error('D1 batch failed');return {rows:r.results??[],changes:r.meta?.changes??0};});
 }
 const url=config('DATABASE_URL','file:./prisma/edupilot.db');
 if(!url.startsWith('file:'))throw new Error('Expected local database file');
 const {runLocalBatch}=await import('@assessment-local-store');
 return runLocalBatch(url.slice(5),statements);
}
// Older rows can be unix epoch milliseconds; current Prisma/D1 writes ISO8601.
// Never compare those representations lexically or rewrite historical values.
export const epochSql=(column:string)=>`(CASE WHEN typeof(${column}) IN ('integer','real') THEN ${column} ELSE round((julianday(${column})-2440587.5)*86400000) END)`;
export const sqlDate=(date:Date)=>date.toISOString().replace('Z','+00:00');
export type AdmissionInput={id:string,assignmentId:string,studentId:string,requestId:string,variantId:string,version:number,now:Date};
export function buildAdmissionBatch(input:AdmissionInput):SqlStatement[]{
 const {id,assignmentId,studentId,requestId,variantId,version,now}=input;
 const due=epochSql('a.dueDate');
 return [
  {sql:`INSERT INTO AssessmentAttempt(id,assignmentId,studentId,number,startRequestId,variantId,startedAt,expiresAt,status,version,draftAnswersJson)
   SELECT ?,a.id,?,COALESCE((SELECT MAX(number) FROM AssessmentAttempt WHERE assignmentId=a.id AND studentId=?),0)+1,?,?,?,
   strftime('%Y-%m-%dT%H:%M:%f+00:00',min(?+a.durationMinutes*60000,COALESCE(${due},9000000000000000))/1000.0,'unixepoch'),'in_progress',1,'{}'
   FROM Assignment a JOIN SchoolClass c ON c.id=a.classId JOIN User t ON t.id=c.teacherId AND t.role='teacher'
   JOIN Enrollment e ON e.classId=a.classId AND e.studentId=? JOIN User s ON s.id=e.studentId AND s.role='student'
   WHERE a.id=? AND a.version=? AND a.kind='test' AND a.closedAt IS NULL AND a.solutionsReleasedAt IS NULL
   AND (a.dueDate IS NULL OR ${due}>?)
   AND (SELECT COUNT(*) FROM AssessmentAttempt WHERE assignmentId=a.id AND studentId=?)<a.maxAttempts
   AND NOT EXISTS(SELECT 1 FROM AssessmentAttempt WHERE assignmentId=a.id AND studentId=? AND status='in_progress')
   AND NOT EXISTS(SELECT 1 FROM AssessmentStartRequest WHERE assignmentId=a.id AND studentId=? AND requestId=?)`,
   params:[id,studentId,studentId,requestId,variantId,sqlDate(now),now.getTime(),studentId,assignmentId,version,now.getTime(),studentId,studentId,studentId,requestId]},
  {sql:`INSERT INTO AssessmentStartRequest(assignmentId,studentId,requestId,attemptId,createdAt)
   SELECT a.assignmentId,a.studentId,?,a.id,? FROM AssessmentAttempt a JOIN Assignment x ON x.id=a.assignmentId
   JOIN Enrollment e ON e.classId=x.classId AND e.studentId=a.studentId
   JOIN User u ON u.id=a.studentId AND u.role='student'
   WHERE a.assignmentId=? AND a.studentId=? AND a.status='in_progress'
   ON CONFLICT(assignmentId,studentId,requestId) DO NOTHING`,params:[requestId,sqlDate(now),assignmentId,studentId]},
  {sql:`SELECT a.id FROM AssessmentStartRequest r JOIN AssessmentAttempt a ON a.id=r.attemptId
   JOIN Assignment x ON x.id=a.assignmentId JOIN Enrollment e ON e.classId=x.classId AND e.studentId=a.studentId
   JOIN User u ON u.id=a.studentId AND u.role='student'
   WHERE r.assignmentId=? AND r.studentId=? AND r.requestId=? AND a.assignmentId=r.assignmentId AND a.studentId=r.studentId`,params:[assignmentId,studentId,requestId]}
 ];
}
