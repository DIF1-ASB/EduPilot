import {expect,type Browser,type BrowserContext} from '@playwright/test';
export async function localActor(browser:Browser,origin:string,role:'teacher'|'student',tag:string){
 const context=await browser.newContext({extraHTTPHeaders:{'x-forwarded-for':'198.18.'+Math.floor(Math.random()*255)+'.'+(Math.floor(Math.random()*254)+1)},baseURL:origin});const r=await context.request.post('/api/auth/register',{headers:{Origin:origin},data:{firstName:role==='teacher'?'Учитель':'Ученик',lastName:'Синтетический',email:`${tag}@example.invalid`,password:'ExamplePass789!',confirmPassword:'ExamplePass789!',role}});expect(r.status()).toBe(201);return context;
}
export async function post(context:BrowserContext,url:string,data:unknown,origin:string){const r=await context.request.post('/api/'+url,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
