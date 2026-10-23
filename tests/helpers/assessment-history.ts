import {openPlatformFixture} from './platform';
export async function assessmentHistoryFixture(name:string){
 const f=await openPlatformFixture(name),service=await import('../../lib/assignments/service');
 const group=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Математика',enrollments:{create:{studentId:f.student.id}}}});
 const doc={schemaVersion:2,kind:'assessment',demo:false,instructions:'Объясните',variants:[{id:'v1',label:'Вариант 1',questions:[{id:'open',kind:'open',prompt:'Почему это верно?',points:5,criteria:'PRIVATE_KEY',explanation:'PRIVATE_EXPLANATION'}]}]};
 const material=await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Линейные уравнения',subject:'Математика',grade:7,contentJson:doc}});
 const assignment=await service.createAssignment(f.teacher,group.id,{materialId:material.id,materialVersion:1,keysConfirmed:true,title:'Контрольная №1',kind:'test',maxAttempts:10});
 const seed=async(number:number,score:number|null,status=score===null?'pending_review':'graded',studentId=f.student.id,assignmentId=assignment.id)=>{
  const start=new Date(Date.UTC(2026,9,20,10,number));
  return f.client.assessmentAttempt.create({data:{assignmentId,studentId,number,startRequestId:crypto.randomUUID(),variantId:'v1',startedAt:start,expiresAt:new Date(start.getTime()+2700000),status,draftAnswersJson:{open:'PRIVATE_STUDENT_ANSWER'},submittedAnswersJson:status==='in_progress'?undefined:{open:'PRIVATE_STUDENT_ANSWER'},submittedAt:status==='in_progress'?null:new Date(start.getTime()+60000),completionKind:status==='in_progress'?null:'submitted',resultJson:status==='in_progress'?undefined:{score,autoScore:0,maxScore:5,pendingQuestionIds:score===null?['open']:[],items:[{questionId:'open',points:score??0,maxPoints:5,correct:score===null?null:score===5,answer:'PRIVATE_KEY',explanation:'PRIVATE_EXPLANATION'}]}}});
 };
 return {...f,group,material,assignment,doc,seed};
}
