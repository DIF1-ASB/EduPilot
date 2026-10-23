import {describe,it,expect} from 'vitest';import {openPlatformFixture} from './helpers/platform';import {quizFixture} from './helpers/online-content';
describe('online-only control tests',()=>{
 it('blocks old/new control exports and worksheet assignments without removing standalone exports or data',async()=>{
  const f=await openPlatformFixture('online-export');try{
   const group=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Математика',enrollments:{create:{studentId:f.student.id}}}});
   for(const type of ['test','worksheet','lesson','notes']){
    const m=await f.client.material.create({data:{userId:f.teacher.id,type,title:'Материал',subject:'Математика',grade:7,contentJson:['test','worksheet'].includes(type)?quizFixture():{demo:false,sections:[{id:'s',title:'Текст',body:'Учебное объяснение'}]}}});
    expect((await f.call(`materials/${m.id}/export?format=docx`,'GET',undefined,f.teacher.cookie)).status).toBe(type==='test'?410:200);
    if(type==='test'||type==='worksheet'){
     const a=await f.client.assignment.create({data:{classId:group.id,materialId:m.id,title:'Контрольная',kind:'test',snapshotJson:quizFixture()}});
     for(const format of ['docx','pdf'])for(const actor of [f.teacher,f.student])expect((await f.call(`assignments/${a.id}/export?format=${format}`,'GET',undefined,actor.cookie)).status).toBe(410);
    }
   }
   expect(await f.client.material.count()).toBe(4);expect(await f.client.user.count()).toBe(3);
  }finally{await f.close();}
 },20000);
 it('requires a confirmed current online revision and canonicalizes only the new assigned snapshot',async()=>{
  const f=await openPlatformFixture('online-confirm');try{
   const group=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Математика'}}),source=quizFixture();
   const m=await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Уравнения',subject:'Математика',grade:7,contentJson:source,metadataJson:{onlineTestVersion:1,keysConfirmed:false}}});
   const payload={materialId:m.id,materialVersion:1,title:m.title,kind:'test',keysConfirmed:true};
   expect((await f.call(`classes/${group.id}/assignment`,'POST',payload,f.teacher.cookie)).status).toBe(422);
   await f.client.material.update({where:{id:m.id},data:{metadataJson:{onlineTestVersion:1,keysConfirmed:true}}});
   const response=await f.call(`classes/${group.id}/assignment`,'POST',payload,f.teacher.cookie);expect(response.status).toBe(201);
   const saved=await f.client.assignment.findFirst(),snapshot=saved!.snapshotJson as unknown as ReturnType<typeof quizFixture>;expect(snapshot.variants[0].questions[0].options[0].id).toMatch(/^[0-9a-f-]{36}$/);expect((await f.client.material.findUnique({where:{id:m.id}}))!.contentJson).toEqual(source);
   await f.client.material.update({where:{id:m.id},data:{version:2,metadataJson:{onlineTestVersion:1,keysConfirmed:false}}});expect((await f.call(`classes/${group.id}/assignment`,'POST',payload,f.teacher.cookie)).status).toBe(409);
  }finally{await f.close();}
 },20000);
});
