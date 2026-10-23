import {afterEach,describe,it,expect,vi} from 'vitest';
import {withRuntime} from '../lib/runtime';
import {requestCompletion} from '../lib/ai/client';
afterEach(()=>vi.unstubAllGlobals());
const messages=[{role:'user',content:'Сколько будет 2+2?'}];
const run=(base:string,fn:()=>Promise<unknown>)=>withRuntime({AI_BASE_URL:base,AI_API_KEY:'synthetic-secret',AI_MODEL:'test-model'},fn);
describe('bounded completion client',()=>{
 it('disables NVIDIA thinking without forwarding its kwargs to other providers',async()=>{
  const requests:{url:string,init:RequestInit}[]=[];
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{requests.push({url,init});return Response.json({choices:[{finish_reason:'stop',message:{content:'4'}}]});});
  for(const base of ['https://integrate.api.nvidia.com/v1','https://api.cloudflare.com/client/v4/accounts/test/ai/v1'])expect(await run(base,()=>requestCompletion(messages,{structured:true}))).toBe('4');
  const first=JSON.parse(String(requests[0].init.body)),second=JSON.parse(String(requests[1].init.body));
  expect(first.chat_template_kwargs).toEqual({enable_thinking:false});expect(second).not.toHaveProperty('chat_template_kwargs');
  expect(first.max_tokens).toBe(6000);expect(first.response_format).toEqual({type:'json_object'});
  expect(requests[0].init.redirect).toBe('error');
 });
 it('honours cancellation and enforces the caller timeout',async()=>{
  vi.stubGlobal('fetch',(_url:unknown,init:RequestInit)=>new Promise((_resolve,reject)=>{const signal=init.signal!;if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}));
  const controller=new AbortController();controller.abort();
  await expect(run('https://integrate.api.nvidia.com/v1',()=>requestCompletion(messages,{signal:controller.signal}))).rejects.toMatchObject({status:503});
  await expect(run('https://integrate.api.nvidia.com/v1',()=>requestCompletion(messages,{timeoutMs:10}))).rejects.toMatchObject({status:503});
 });
 it('rejects truncated and missing content without exposing secrets or upstream bodies',async()=>{
  for(const payload of [{choices:[{finish_reason:'length',message:{content:'partial'}}]},{choices:[]}]){
   vi.stubGlobal('fetch',async()=>Response.json(payload));
   await expect(run('https://integrate.api.nvidia.com/v1',()=>requestCompletion(messages))).rejects.toMatchObject({status:502});
  }
  vi.stubGlobal('fetch',async()=>new Response('synthetic-secret',{status:429}));
  try{await run('https://integrate.api.nvidia.com/v1',()=>requestCompletion(messages));expect.fail('must reject');}catch(error){expect(String(error)).not.toContain('synthetic-secret');}
 });
 it('refuses unencrypted remote endpoints before making a request',async()=>{
  let called=false;vi.stubGlobal('fetch',async()=>{called=true;return Response.json({});});
  await expect(run('http://remote.example/v1',()=>requestCompletion(messages))).rejects.toMatchObject({status:503});expect(called).toBe(false);
 });
});
