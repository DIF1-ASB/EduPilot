import {afterEach, describe, expect, it} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import Database from 'better-sqlite3';
const require = createRequire(import.meta.url);
const helper = resolve('scripts/ops/data-manifest.cjs');
const roots:string[]=[];
const key=Buffer.alloc(32,7);
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'edupilot-preservation-'));roots.push(root);
  const file=join(root,'source.db'), storage=join(root,'storage');mkdirSync(storage);
  const db=new Database(file);
  for(const name of readdirSync('prisma/migrations').filter(n=>/^20261015/.test(n)).sort()) db.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
  const insert=(table:string, data:Record<string,unknown>)=>{const columns=Object.keys(data);db.prepare(`INSERT INTO "${table}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(data));};
  insert('User',{id:'u',firstName:'Имя',lastName:'Фамилия',email:'synthetic@example.invalid',passwordHash:'synthetic-salted-password-hash',role:'teacher',updatedAt:1700000000000});
  insert('User',{id:'student',firstName:'Ученик',lastName:'Тестовый',email:'student@example.invalid',passwordHash:'another-synthetic-hash',role:'student',updatedAt:1700000000000});
  insert('UserSettings',{userId:'u'});insert('Session',{id:'session',userId:'u',expiresAt:1900000000000});
  insert('Chat',{id:'chat',userId:'u',title:'Не терять чат',updatedAt:1700000000000});
  insert('Message',{id:'message',chatId:'chat',role:'user',content:'Точный текст сообщения'});
  insert('Material',{id:'material',userId:'u',title:'Работа',type:'test',subject:'Математика',grade:7,contentJson:'{"sections":[{"id":"q","title":"Тема","body":"Точный текст","answer":"4"}]}',updatedAt:1700000000000});
  for(const type of ['lesson','worksheet','notes','review','presentation','video'])insert('Material',{id:'legacy-'+type,userId:type==='notes'?'student':'u',title:'Исторический '+type,type,subject:'Математика',grade:7,contentJson:'{"sections":[{"id":"old","title":"Старый раздел","body":"Сохранить точно"}]}',updatedAt:1700000000000});
  const storageKey='a'.repeat(64);writeFileSync(join(storage,storageKey),'original attachment');
  insert('FileAttachment',{id:'file',ownerId:'u',materialId:'material',storageKey,originalName:'работа.txt',mimeType:'text/plain',size:19});
  insert('SchoolClass',{id:'class',teacherId:'u',name:'7 А',subject:'Математика'});
  insert('Enrollment',{id:'enrollment',classId:'class',studentId:'u'});
  insert('ClassInvite',{id:'invite',classId:'class',expiresAt:1900000000000});
  insert('Assignment',{id:'assignment',classId:'class',materialId:'material',title:'Старая работа'});
  insert('Submission',{id:'submission',assignmentId:'assignment',studentId:'u',contentJson:'{"text":"Решение"}'});
  insert('Grade',{id:'grade',submissionId:'submission',score:3,maxScore:4,teacherComment:'Историческая оценка',approvedAt:1700000000000});
  insert('QuizSession',{id:'quizsession',userId:'u',materialId:'material',expiresAt:1900000000000});
  insert('QuizAttempt',{id:'quizattempt',userId:'u',materialId:'material',score:3,answersJson:'{"answers":{"q":"4"},"result":[{"answer":"4"}],"maxScore":4}'});
  insert('TrainingSession',{id:'training',userId:'u',topic:'fractions',mode:'adaptive',grade:7,configJson:'{}',algorithmVersion:'v1'});
  insert('TrainingTurn',{id:'turn',sessionId:'training',sequence:1,questionId:'question',snapshotJson:'{}',selectionReason:'history'});
  insert('TrainingAttempt',{id:'trainingattempt',turnId:'turn',requestId:'request',answer:'2',correct:1,durationMs:1000,levelBefore:1,levelAfter:1,masteryBefore:0,masteryAfter:0.5,reason:'correct',evidenceJson:'{}',errorTagsJson:'[]'});
  insert('LearningTask',{id:'task',ownerId:'u',questionJson:'{}',origin:'manual',updatedAt:1700000000000});
  insert('RateLimit',{key:'synthetic-limit',expiresAt:1900000000000});
  db.close();return {root,file,storage,storageKey};
}
afterEach(()=>{for(const root of roots.splice(0)){expect(root.startsWith(join(tmpdir(),'edupilot-preservation-'))).toBe(true);rmSync(root,{recursive:true,force:true});}});
describe('non-destructive data preservation',()=>{
 it('preserves all historical entities through the actual assignment migration',()=>{
  const {captureManifest,compareManifest}=require(helper);const f=fixture();
  const before=captureManifest(f.file,{storagePath:f.storage,key});
  const sql=readFileSync('prisma/migrations/202610170001_assignments/migration.sql','utf8');
  const db=new Database(f.file);try{db.exec(sql);}finally{db.close();}
  const after=captureManifest(f.file,{storagePath:f.storage,key,columnsByTable:Object.fromEntries(before.tables.map((t:any)=>[t.name,t.columns]))});
  expect(compareManifest(before,after)).toEqual({ok:true,differences:[]});expect(after.integrity).toBe('ok');expect(after.foreignKeyViolations).toBe(0);
 });
 it('preserves every old field through an additive migration',()=>{
  const {captureManifest,compareManifest}=require(helper);const f=fixture();
  const before=captureManifest(f.file,{storagePath:f.storage,key});
  const db=new Database(f.file);db.exec('ALTER TABLE Assignment ADD COLUMN safeDefault INTEGER NOT NULL DEFAULT 1; CREATE TABLE NewTable(id TEXT PRIMARY KEY);');db.close();
  const after=captureManifest(f.file,{storagePath:f.storage,key,columnsByTable:Object.fromEntries(before.tables.map((t:any)=>[t.name,t.columns]))});
  expect(compareManifest(before,after)).toEqual({ok:true,differences:[]});expect(after.integrity).toBe('ok');expect(after.foreignKeyViolations).toBe(0);
  expect(JSON.stringify(before)).not.toContain('synthetic-salted-password-hash');expect(JSON.stringify(before)).not.toContain('Точный текст сообщения');
 });
 it.each(['password','material','file'])('detects %s corruption even with unchanged row counts',(kind)=>{
  const {captureManifest,compareManifest}=require(helper);const f=fixture();const before=captureManifest(f.file,{storagePath:f.storage,key});
  if(kind==='file')writeFileSync(join(f.storage,f.storageKey),'modified attachment');
  else {const db=new Database(f.file);db.exec(kind==='password'?"UPDATE User SET passwordHash='changed'":"UPDATE Material SET contentJson='{}'");db.close();}
  const after=captureManifest(f.file,{storagePath:f.storage,key});expect(compareManifest(before,after).ok).toBe(false);expect(after.tables.map((t:any)=>t.rows)).toEqual(before.tables.map((t:any)=>t.rows));
 });
 it('refuses missing databases and missing storage without creating files',()=>{
  const {captureManifest}=require(helper);const f=fixture(), missing=join(f.root,'missing.db');
  expect(()=>captureManifest(missing,{storagePath:f.storage,key})).toThrow();expect(existsSync(missing)).toBe(false);
  rmSync(join(f.storage,f.storageKey));expect(()=>captureManifest(f.file,{storagePath:f.storage,key})).toThrow(/attachment|file/i);
 });
 it('accepts only database/storage entries and rejects archive traversal or links',()=>{
  const {validateArchiveEntries}=require(resolve('scripts/ops/rehearse-migration.cjs'));
  expect(()=>validateArchiveEntries(['edupilot.db','storage/','storage/'+'a'.repeat(64)],['-','d','-'])).not.toThrow();
  for(const name of ['../edupilot.db','/edupilot.db','C:/edupilot.db','storage/../edupilot.db','runtime.env','storage/bad'])expect(()=>validateArchiveEntries([name],['-'])).toThrow();
  expect(()=>validateArchiveEntries(['edupilot.db','storage/'],['-','l'])).toThrow();
 });
 it('refuses rehearsal outputs in live data paths or any existing directory',()=>{
  const {assertRehearsalPaths}=require(resolve('scripts/ops/rehearse-migration.cjs'));const f=fixture();
  expect(()=>assertRehearsalPaths(f.file,f.root)).toThrow();
  expect(()=>assertRehearsalPaths(f.file,'/var/lib/edupilot/rehearsal')).toThrow();
  expect(()=>assertRehearsalPaths(f.file,join(f.root,'new-rehearsal'))).not.toThrow();
  expect(existsSync(join(f.root,'new-rehearsal'))).toBe(false);
 });
});
