// CLI-only fixture bridge for the same synthetic preview on Windows or Linux.
// Not imported by the application and not exposed by any HTTP endpoint.
const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3');
function runNotesFixture(input){
 const {databasePath,ownerId,id,action,contentJson}=input;
 if(typeof databasePath!=='string'||!path.isAbsolute(databasePath)||!['insert','read'].includes(action))throw Error('Invalid QA fixture operation');
 const expected=databasePath.replaceAll('\\','/');if(!(/\/edupilot-stage1-preview-[^/]+\/qa\.db$/.test(expected)||/^\/var\/lib\/edupilot-stage1-qa\/[a-f0-9]{40}\/qa\.db$/.test(expected)))throw Error('Not an isolated QA database');
 if(fs.realpathSync(databasePath).replaceAll('\\','/')!==expected||!fs.statSync(databasePath).isFile())throw Error('QA database symlink or missing file');
 const sql=new Database(databasePath,{fileMustExist:true});try{sql.pragma('foreign_keys=ON');const owner=sql.prepare('SELECT email,role FROM User WHERE id=?').get(ownerId);if(!owner||owner.role!=='student'||!/^notes-[a-z0-9-]+@example\.invalid$/.test(owner.email))throw Error('Not an owned synthetic notes actor');
  if(action==='insert'){
   const parsed=JSON.parse(contentJson);if(typeof contentJson!=='string'||contentJson.length>30000||parsed.demo!==false||parsed.totalDuration!==45||parsed.sections?.length!==1||parsed.sections[0].duration!==15)throw Error('Not the approved historical QA fixture');
   sql.prepare('INSERT INTO Material(id,userId,title,type,subject,grade,contentJson,updatedAt) VALUES(?,?,?,?,?,?,?,?)').run(id,ownerId,'Исторические записи','notes','Математика',7,contentJson,new Date().toISOString().replace('Z','+00:00'));return {ok:true};
  }
  const row=sql.prepare("SELECT contentJson FROM Material WHERE id=? AND userId=? AND type='notes' AND title='Исторические записи'").get(id,ownerId);if(!row)throw Error('QA fixture not found');return {contentJson:row.contentJson};
 }finally{sql.close();}
}
module.exports={runNotesFixture};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{input+=chunk;if(input.length>64000)process.exit(1);});process.stdin.on('end',()=>{try{console.log(JSON.stringify(runNotesFixture(JSON.parse(input))));}catch{console.error('Synthetic notes fixture refused. Production database paths are forbidden.');process.exitCode=1;}});}
