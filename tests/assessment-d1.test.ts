import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {openPlatformFixture,type PlatformFixture} from './helpers/platform';
let f:PlatformFixture,store:typeof import('../lib/assessment/store');
beforeAll(async()=>{f=await openPlatformFixture('assessment-batch');store=await import('../lib/assessment/store');});afterAll(async()=>{await f?.close();});
describe('assessment batch storage contract',()=>{
 it('rolls back earlier native statements when a later statement fails',async()=>{
  await expect(store.runAssessmentBatch([{sql:'INSERT INTO RateLimit(key,count,expiresAt) VALUES(?,?,?)',params:['must-rollback',1,1900000000000]},{sql:'INSERT INTO MissingTable(id) VALUES(?)',params:['x']}])).rejects.toThrow();
  expect(await f.client.rateLimit.findUnique({where:{key:'must-rollback'}})).toBeNull();
 });
 it('binds D1 statements and maps the native batch results without Prisma transactions',async()=>{
  const {withRuntime}=await import('../lib/runtime');const prepared:any[]=[];let received:any;
  const binding={prepare(sql:string){const s={sql,params:[] as unknown[],bind(...params:unknown[]){this.params=params;return this;}};prepared.push(s);return s;},async batch(statements:unknown[]){received=statements;return [{success:true,results:[{id:'result'}],meta:{changes:1}}];}};
  const result=await withRuntime({DB:binding as any},()=>store.runAssessmentBatch([{sql:'SELECT ? AS id',params:['bound-value']}]));
  expect(prepared).toMatchObject([{sql:'SELECT ? AS id',params:['bound-value']}]);expect(received).toEqual(prepared);expect(result).toEqual([{rows:[{id:'result'}],changes:1}]);
  // The binding contract is not a claim of real D1 concurrency; Wrangler verification is A10.
 });
});
