import {it,expect,vi} from 'vitest';import Database from 'better-sqlite3';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,rmSync,copyFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
it('preserves all prior tables and fields, active mixed attempts, prose predecessors and backup restore',async()=>{
 const root=mkdtempSync(join(tmpdir(),'edupilot-online-preservation-')),file=join(root,'before.db'),storage=join(root,'storage');mkdirSync(storage);const key=Buffer.alloc(32,11),{captureManifest}=require(resolve('scripts/ops/data-manifest.cjs'));let sql:Database.Database|undefined;
 try{
  sql=new Database(file);const migrations=readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort();for(const name of migrations.filter(n=>n<'20261023'))sql.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
  sql.exec(`INSERT INTO User(id,firstName,lastName,email,passwordHash,role,updatedAt) VALUES('t','T','T','t@example.invalid','synthetic-hash','teacher',1700000000000),('s','S','S','s@example.invalid','other-hash','student',1700000000000);
   INSERT INTO Session(id,userId,expiresAt) VALUES('session','s',1900000000000);
   INSERT INTO UserSettings(userId) VALUES('s');
   INSERT INTO Chat(id,userId,title,updatedAt) VALUES('chat','s','Сохранить чат',1700000000000);
   INSERT INTO Message(id,chatId,role,content) VALUES('msg','chat','user','Сохранить точный текст');
   INSERT INTO SchoolClass(id,teacherId,name,subject) VALUES('c','t','7A','Математика');
   INSERT INTO Enrollment(id,classId,studentId) VALUES('e','c','s');`);
  const insert=sql.prepare('INSERT INTO Material(id,userId,title,type,subject,grade,contentJson,updatedAt) VALUES(?,?,?,?,?,?,?,?)');
  const v1={sections:[{id:'old',title:'Старый раздел',body:'Точный прежний текст'}]},v2={schemaVersion:2,kind:'notes',demo:false,summary:'Суть',concepts:[],theses:[],examples:[],conclusion:'Итог',selfCheck:[]},mixed={schemaVersion:2,kind:'assessment',demo:false,instructions:'Сохранить инструкцию',variants:[{id:'v',label:'Старый вариант',questions:[{id:'q',kind:'short',prompt:'2+2',points:1,acceptedAnswers:['4']},{id:'o',kind:'open',prompt:'Объясните',points:2,criteria:'Точный критерий'}]}]};
  insert.run('n1','s','Первая версия','notes','Математика',7,JSON.stringify(v1),1700000000000);insert.run('n2','s','Вторая версия','notes','Математика',7,JSON.stringify(v2),1700000000000);insert.run('test','t','Смешанная работа','test','Математика',7,JSON.stringify(mixed),1700000000000);
  sql.prepare("INSERT INTO Assignment(id,classId,materialId,title,kind,maxAttempts,snapshotJson) VALUES('a','c','test','Старая работа','test',2,?)").run(JSON.stringify(mixed));
  sql.prepare("INSERT INTO AssessmentAttempt(id,assignmentId,studentId,number,startRequestId,variantId,status,startedAt,expiresAt,draftAnswersJson) VALUES('active','a','s',2,'r2','v','in_progress',1700000000000,1900000000000,?)").run('{"q":"4","o":"Мой прежний ответ"}');
  sql.prepare("INSERT INTO AssessmentAttempt(id,assignmentId,studentId,number,startRequestId,variantId,status,startedAt,expiresAt,submittedAt,draftAnswersJson,resultJson) VALUES('done','a','s',1,'r1','v','graded',1700000000000,1700000060000,1700000030000,'{}',?)").run('{"score":2,"maxScore":3,"items":[]}');
  const storageKey='b'.repeat(64);writeFileSync(join(storage,storageKey),'synthetic original');sql.prepare('INSERT INTO FileAttachment(id,ownerId,storageKey,originalName,mimeType,size) VALUES(?,?,?,?,?,?)').run('f','s',storageKey,'original.txt','text/plain',18);sql.close();sql=undefined;
  const before=captureManifest(file,{storagePath:storage,key}),columnsByTable=Object.fromEntries(before.tables.map((t:{name:string;columns:string[]})=>[t.name,t.columns]));copyFileSync(file,join(root,'backup.db'));
  sql=new Database(file);for(const name of migrations.filter(n=>n>='20261023'))sql.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));sql.close();sql=undefined;
  expect(captureManifest(file,{storagePath:storage,key,columnsByTable})).toEqual(before);
  copyFileSync(join(root,'backup.db'),join(root,'restored.db'));expect(captureManifest(join(root,'restored.db'),{storagePath:storage,key,columnsByTable})).toEqual(before);
  vi.resetModules();process.env.DATABASE_URL='file:'+file.replaceAll('\\','/');const {db}=await import('../lib/database'),client=await db();
  try{
   const {getStudentAttemptView,startAttempt,submitAttempt}=await import('../lib/assessment/service'),actor={id:'s',role:'student' as const};
   const view=await getStudentAttemptView(actor,'a','active');expect(view.questions.map(q=>q.id)).toEqual(['q','o']);expect(view.answers).toEqual({q:'4',o:'Мой прежний ответ'});expect(view.expiresAt).toBe(new Date(1900000000000).toISOString());expect(view.instructions).toBe('Сохранить инструкцию');
   const resumed=await startAttempt(actor,'a',{requestId:crypto.randomUUID()});expect(resumed.id).toBe('active');
   await submitAttempt(actor,'a','active',{version:view.version,answers:view.answers});const finished=await getStudentAttemptView(actor,'a','active');expect(finished.status).toBe('pending_review');expect(finished.result?.autoScore).toBe(1);expect(finished.result?.solutions).toBeUndefined();expect(await client.assessmentAttempt.count()).toBe(2);
  }finally{await client.$disconnect();}
 }finally{sql?.close();expect(root.startsWith(join(tmpdir(),'edupilot-online-preservation-'))).toBe(true);rmSync(root,{recursive:true,force:true});}
});
