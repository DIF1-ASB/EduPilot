import { vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PrismaClient } from '@prisma/client';
export type FixtureActor={id:string,role:'teacher'|'student',cookie:string};
export type PlatformFixture={root:string,file:string,storagePath:string,client:PrismaClient,teacher:FixtureActor,student:FixtureActor,outsider:FixtureActor,
 call:(path:string,method?:string,body?:unknown,cookie?:string)=>Promise<Response>,close:()=>Promise<void>};
export async function openPlatformFixture(name:string):Promise<PlatformFixture>{
  vi.resetModules();
  const root=mkdtempSync(join(tmpdir(),'edupilot-platform-')),file=join(root,'test.db'),storagePath=join(root,'storage');mkdirSync(storagePath);
  process.env.DATABASE_URL='file:'+file.replaceAll('\\','/');process.env.STORAGE_DIRECTORY=storagePath;process.env.AI_MODE='mock';
  const sql=new Database(file);
  try{for(const name of readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort())sql.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));}finally{sql.close();}
  const {db}=await import('../../lib/database');const client=await db();
  const {digest}=await import('../../lib/security');
  const actor=async(id:string,role:'teacher'|'student'):Promise<FixtureActor>=>{
    const userId=name+'-'+id,session=name+'-session-'+id;
    await client.user.create({data:{id:userId,firstName:id,lastName:'Synthetic',email:userId+'@example.invalid',passwordHash:'fixture-no-login',role}});
    await client.session.create({data:{id:await digest(session),userId,expiresAt:new Date(Date.now()+86400000)}});
    return {id:userId,role,cookie:'edupilot_session='+session};
  };
  const teacher=await actor('teacher','teacher'),student=await actor('student','student'),outsider=await actor('outsider','student');
  const routes=await import('../../app/api/[...path]/route');
  const call=async(path:string,method='GET',body?:unknown,cookie='')=>{
    const request=new Request('http://127.0.0.1:3000/api/'+path,{method,headers:{Origin:'http://127.0.0.1:3000','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return (routes as any)[method](request) as Promise<Response>;
  };
  return {root,file,storagePath,client,teacher,student,outsider,call,close:async()=>{await client.$disconnect();if(!root.startsWith(join(tmpdir(),'edupilot-platform-')))throw new Error('Unsafe fixture path');rmSync(root,{recursive:true,force:true});}};
}
