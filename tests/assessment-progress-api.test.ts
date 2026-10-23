import {describe,it,expect} from 'vitest';import {assessmentHistoryFixture} from './helpers/assessment-history';
describe('assessment progress HTTP privacy',()=>{
 it('adds a separate assessment section while keeping training metrics unchanged and former-student access scoped',async()=>{
  const f=await assessmentHistoryFixture('assessment-progress-api');try{
   await f.seed(1,3);const {GET}=await import('../app/api/learning/[...path]/route');const get=(path:string,cookie:string)=>GET(new Request('http://127.0.0.1:3000/api/learning/'+path,{headers:{Cookie:cookie}}));
   const personal:any=await(await get('progress',f.student.cookie)).json();expect(personal.metrics.total).toBe(0);expect(personal.assessments.totals.percentage).toBe(60);expect(JSON.stringify(personal.assessments)).not.toMatch(/PRIVATE_|explanation|correctOptionIds/);
   expect((await get('analytics',f.student.cookie)).status).toBe(403);expect((await get('analytics?studentId='+f.outsider.id,f.teacher.cookie)).status).toBe(403);
   await f.client.enrollment.deleteMany({where:{classId:f.group.id,studentId:f.student.id}});const former=await get('analytics?studentId='+f.student.id,f.teacher.cookie);expect(former.status).toBe(200);const data:any=await former.json();expect(data.assessments.history).toHaveLength(1);expect(data.metrics.total).toBe(0);
   const demo:any=await(await get('progress?demo=1',f.student.cookie)).json();expect(demo.assessments).toBeNull();
  }finally{await f.close();}
 },20000);
});
