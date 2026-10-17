import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0)){expect(root.startsWith(join(tmpdir(),'edupilot-migration-'))).toBe(true);rmSync(root,{recursive:true,force:true});}});
describe('additive assignment migration',()=>{
 it('preserves old assignments and enforces atomic attempt identity and timestamp interoperability',async()=>{
  const migration=readFileSync('prisma/migrations/202610170001_assignments/migration.sql','utf8');
  const root=mkdtempSync(join(tmpdir(),'edupilot-migration-'));roots.push(root);const path=join(root,'test.db'),raw=new Database(path);
  for(const name of readdirSync('prisma/migrations').filter(n=>/^20261015/.test(n)).sort())raw.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
  raw.exec(`INSERT INTO User(id,firstName,lastName,email,passwordHash,role,updatedAt) VALUES('teacher','T','T','t@example.invalid','preserve','teacher',1700000000000),('student','S','S','s@example.invalid','preserve2','student',1700000000000);
    INSERT INTO SchoolClass(id,teacherId,name,subject) VALUES('class','teacher','7A','Math');
    INSERT INTO Material(id,userId,title,type,subject,grade,contentJson,updatedAt) VALUES('material','teacher','Old','test','Math',7,'{"sections":[]}',1700000000000);
    INSERT INTO Assignment(id,classId,materialId,title) VALUES('assignment','class','material','Old homework');`);
  const before=raw.prepare('SELECT * FROM Assignment').all();
  raw.exec(migration);
  expect(raw.prepare('SELECT id,classId,materialId,title,dueDate FROM Assignment').all()).toEqual(before);
  expect(raw.prepare('SELECT kind,maxAttempts,durationMinutes,answerPolicy,version,snapshotJson FROM Assignment').get()).toEqual({kind:'homework',maxAttempts:1,durationMinutes:45,answerPolicy:'manual',version:1,snapshotJson:null});
  const client=new PrismaClient({adapter:new PrismaBetterSQLite3({url:'file:'+path.replaceAll('\\','/')})});
  try{
    const start=new Date('2026-10-17T12:00:00Z');
    const data={assignmentId:'assignment',studentId:'student',number:1,startRequestId:'request',variantId:'v',startedAt:start,expiresAt:new Date(start.getTime()+60000),status:'in_progress',draftAnswersJson:{}};
    const a=await client.assessmentAttempt.create({data});
    expect(raw.prepare('SELECT startedAt FROM AssessmentAttempt WHERE id=?').get(a.id)).toEqual({startedAt:start.toISOString().replace('Z','+00:00')});
    await expect(client.assessmentAttempt.create({data:{...data,number:2,startRequestId:'request2'}})).rejects.toThrow();
    raw.prepare("UPDATE AssessmentAttempt SET status='graded', submittedAt=? WHERE id=?").run(start.getTime(),a.id);
    const read=await client.assessmentAttempt.findUniqueOrThrow({where:{id:a.id}});
    expect(read.submittedAt?.toISOString()).toBe(start.toISOString());
    await expect(client.assessmentAttempt.create({data:{...data,startRequestId:'request2'}})).rejects.toThrow();
    await expect(client.assessmentAttempt.create({data:{...data,number:2}})).rejects.toThrow();
    await client.assessmentStartRequest.create({data:{assignmentId:'assignment',studentId:'student',requestId:'alias',attemptId:a.id,createdAt:start}});
    expect((await client.assessmentStartRequest.findUniqueOrThrow({where:{assignmentId_studentId_requestId:{assignmentId:'assignment',studentId:'student',requestId:'alias'}}})).attemptId).toBe(a.id);
    expect(raw.pragma('integrity_check',{simple:true})).toBe('ok');expect(raw.pragma('foreign_key_check')).toEqual([]);
  }finally{await client.$disconnect();raw.close();}
 });
});
