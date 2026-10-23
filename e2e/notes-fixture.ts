import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import {readFileSync} from 'node:fs';
export function notesFixture(input:{action:'insert'|'read',ownerId:string,id:string,contentJson?:string}):{contentJson?:string,ok?:boolean}{
 if(process.env.EDUPILOT_QA_RELEASE||process.env.EDUPILOT_TEST_URL!=='http://127.0.0.1:3400')throw Error('Local synthetic fixture only');
 const databasePath=JSON.parse(readFileSync('work/online-learning-e2e/runtime.json','utf8')).file;
 const output=execFileSync(process.execPath,[resolve('scripts/ops/qa-notes-fixture.cjs')],{input:JSON.stringify({...input,databasePath}),encoding:'utf8'});
 return JSON.parse(output);
}
