import {describe,it,expect} from 'vitest';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {buildOptionOrder,applyOptionOrder} from '../lib/assessment/presentation';
import {validateAssessment} from '../lib/assessment/schema';
import {toPublicQuestion} from '../lib/assessment/projection';
import {gradeVariant} from '../lib/assessment/grading';
import {QuestionInput} from '../components/assessment/question-input';
import {quizFixture} from './helpers/online-content';
import {openPlatformFixture} from './helpers/platform';
describe('stable student answer presentation',()=>{
 it('permutes all options without duplicates and grades by IDs, not displayed positions',()=>{
  const doc=validateAssessment(quizFixture(5),{publishable:true}),questions=doc.variants[0].questions.map(toPublicQuestion);
  const order=buildOptionOrder(doc,'v1',()=>0);expect(order.q0).toEqual(['b','c','d','a']);const shuffled=applyOptionOrder(questions,order);expect(shuffled[0].options?.map(o=>o.id)).toEqual(['b','c','d','a']);expect(questions[0].options?.map(o=>o.id)).toEqual(['a','b','c','d']);
  for(const [wrong,want] of [[0,5],[2,3],[5,0]]){const answers=Object.fromEntries(shuffled.map((q,i)=>[q.id,q.options!.find(o=>o.label===String(i+1+(i<wrong?1:0)))!.id]));expect(gradeVariant(doc,'v1',answers).score).toBe(want);}
  expect(()=>applyOptionOrder(questions,{q0:['a','a','c','d']})).toThrow();expect(applyOptionOrder(questions,{})).toEqual(questions);
 });
 it('renders mathematics in both question and options with accessible radio controls',()=>{
  const html=renderToStaticMarkup(createElement(QuestionInput,{question:{id:'q',kind:'single',prompt:'Решите \\(x+1=2\\)',points:1,answerLines:1,options:[{id:'a',label:'$x=1$'},{id:'b',label:'$x=2$'}]},value:'',onChange:()=>{}}));expect(html).toContain('katex');expect(html.match(/type="radio"/g)).toHaveLength(2);expect(html).not.toContain('correctOptionIds');
 });
 it('persists a new order atomically, reloads the same draft, and never rewrites legacy attempt IDs',async()=>{
  const f=await openPlatformFixture('assessment-order');try{
   const service=await import('../lib/assessment/service'),assign=await import('../lib/assignments/service');
   const group=await f.client.schoolClass.create({data:{teacherId:f.teacher.id,name:'7А',subject:'Математика',enrollments:{create:{studentId:f.student.id}}}}),m=await f.client.material.create({data:{userId:f.teacher.id,type:'test',title:'Тест',subject:'Математика',grade:7,contentJson:quizFixture(5)}});
   const a=await assign.createAssignment(f.teacher,group.id,{materialId:m.id,materialVersion:1,keysConfirmed:true,title:'Работа',kind:'test'}),first=await service.startAttempt(f.student,a.id,{requestId:crypto.randomUUID()});
   expect(Object.keys(first.optionOrderJson as object)).toHaveLength(5);
   const view=await service.getStudentAttemptView(f.student,a.id,first.id),q=view.questions[0],selected=q.options![0].id;
   await service.saveDraft(f.student,a.id,first.id,{version:1,answers:{[q.id]:selected}});const reloaded=await service.getStudentAttemptView(f.student,a.id,first.id);expect(reloaded.questions).toEqual(view.questions);expect(reloaded.answers[q.id]).toBe(selected);expect(JSON.stringify(reloaded)).not.toMatch(/correctOptionIds|explanation|optionOrderJson/);
   const oldAssignment=await assign.createAssignment(f.teacher,group.id,{materialId:m.id,materialVersion:1,keysConfirmed:true,title:'Историческая работа',kind:'test'}),now=new Date();
   const old=await f.client.assessmentAttempt.create({data:{assignmentId:oldAssignment.id,studentId:f.student.id,number:1,startRequestId:crypto.randomUUID(),variantId:'v1',startedAt:now,expiresAt:new Date(now.getTime()+60000),status:'in_progress',draftAnswersJson:{q0:'a'}}});
   const legacy=await service.getStudentAttemptView(f.student,oldAssignment.id,old.id);expect(legacy.questions[0].options?.map(o=>o.id)).toEqual(['a','b','c','d']);expect(legacy.answers.q0).toBe('a');
   const final=await service.submitAttempt(f.student,oldAssignment.id,old.id,{version:1,answers:{q0:'a'}});expect((final.resultJson as {score:number}).score).toBe(1);expect(final.optionOrderJson).toEqual({});
  }finally{await f.close();}
 },20000);
});
