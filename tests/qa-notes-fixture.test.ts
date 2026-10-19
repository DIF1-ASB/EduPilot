import {describe,it,expect} from 'vitest';import {createRequire} from 'node:module';import Database from 'better-sqlite3';import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),{runNotesFixture}=require('../scripts/ops/qa-notes-fixture.cjs');
describe('synthetic-only legacy notes fixture',()=>{
 it('inserts and reads exact legacy JSON only in isolated preview databases for an owned synthetic actor',()=>{
  const root=mkdtempSync(join(tmpdir(),'edupilot-stage1-preview-')),databasePath=join(root,'qa.db'),sql=new Database(databasePath);
  try{for(const m of readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort())sql.exec(readFileSync(`prisma/migrations/${m}/migration.sql`,'utf8'));sql.prepare('INSERT INTO User(id,firstName,lastName,email,passwordHash,role,updatedAt) VALUES(?,?,?,?,?,?,?)').run('actor','Test','Fixture','notes-fixture@example.invalid','not-a-password','student',new Date().toISOString());
   const contentJson=JSON.stringify({demo:false,totalDuration:45,sections:[{id:'legacy',title:'Старый раздел',body:'Исторический конспект без потерь',duration:15}]}),input={databasePath,ownerId:'actor',id:'legacy-qa',contentJson};runNotesFixture({...input,action:'insert'});expect(runNotesFixture({...input,action:'read'})).toEqual({contentJson});
   expect(()=>runNotesFixture({...input,action:'insert',id:'bad',ownerId:'foreign'})).toThrow();sql.prepare('UPDATE User SET email=? WHERE id=?').run('real@example.org','actor');expect(()=>runNotesFixture({...input,action:'read'})).toThrow();
   for(const bad of ['/var/lib/edupilot/edupilot.db',join(root,'missing.db')])expect(()=>runNotesFixture({...input,databasePath:bad,action:'read'})).toThrow();expect(sql.prepare('SELECT count(*) n FROM Material').get()).toEqual({n:1});
  }finally{sql.close();rmSync(root,{recursive:true,force:true});}
 });
});
