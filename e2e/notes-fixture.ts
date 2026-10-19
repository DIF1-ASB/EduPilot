import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';
export function notesFixture(input:{action:'insert'|'read',ownerId:string,id:string,contentJson?:string}):{contentJson?:string,ok?:boolean}{
 const remote=process.env.EDUPILOT_QA_RELEASE;let output:string;
 if(remote){
  if(!/^[a-f0-9]{40}$/.test(remote))throw Error('Invalid verified QA release');
  const databasePath=`/var/lib/edupilot-stage1-qa/${remote}/qa.db`;
  output=execFileSync('C:/Windows/System32/OpenSSH/ssh.exe',['-i','C:/Users/XxX/.ssh/edupilot-firstvds-01a13f80','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','root@153.76.171.55',`runuser -u edupilot -- /opt/node-v22.23.3-linux-x64/bin/node /opt/edupilot/releases/${remote}/scripts/ops/qa-notes-fixture.cjs`],{input:JSON.stringify({...input,databasePath}),encoding:'utf8'});
 }else{
  const databasePath=process.env.EDUPILOT_TEST_DATABASE;if(!databasePath)throw Error('Explicit isolated preview database required');
  output=execFileSync(process.execPath,[resolve('scripts/ops/qa-notes-fixture.cjs')],{input:JSON.stringify({...input,databasePath}),encoding:'utf8'});
 }
 return JSON.parse(output);
}
