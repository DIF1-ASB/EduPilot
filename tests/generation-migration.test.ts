import {describe,it,expect} from 'vitest';
import {openPlatformFixture} from './helpers/platform';
describe('additive generation schema',()=>{
 it('enforces one active job per user in SQLite and leaves existing account rows unchanged',async()=>{
  const f=await openPlatformFixture('generation-migration');try{
   const before=await f.client.user.findMany({orderBy:{id:'asc'}}),base={ownerId:f.teacher.id,kind:'notes',inputHash:'fixture',inputJson:{},state:'queued'};
   await f.client.generationJob.create({data:{...base,id:crypto.randomUUID(),requestId:crypto.randomUUID()}});
   await expect(f.client.generationJob.create({data:{...base,id:crypto.randomUUID(),requestId:crypto.randomUUID()}})).rejects.toThrow();expect(await f.client.user.findMany({orderBy:{id:'asc'}})).toEqual(before);
  }finally{await f.close();}
 });
});
