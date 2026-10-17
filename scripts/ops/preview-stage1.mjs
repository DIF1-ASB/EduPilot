import {mkdtempSync,mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawn} from 'node:child_process';
import Database from 'better-sqlite3';
const port=Number(process.argv[2]??3101);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
const root=mkdtempSync(join(tmpdir(),'edupilot-stage1-preview-')),file=join(root,'qa.db'),storage=join(root,'storage');mkdirSync(storage);
const database=new Database(file);try{for(const n of readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort())database.exec(readFileSync(`prisma/migrations/${n}/migration.sql`,'utf8'));}finally{database.close();}
const env={...process.env,DATABASE_URL:'file:'+file.replaceAll('\\','/'),STORAGE_DIRECTORY:storage,AI_MODE:'mock',APP_ORIGIN:`http://127.0.0.1:${port}`};
delete env.AI_API_KEY;
console.log(`Synthetic-only preview database: ${file}`);
const child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
