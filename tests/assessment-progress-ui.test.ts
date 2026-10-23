import type {AssessmentProgressEntry} from '../lib/learning/assessment-progress';
import {describe,it,expect} from 'vitest';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {AssessmentProgress} from '../components/learning/assessment-progress';
describe('separate control progress display',()=>{
 it('labels the server denominator and pending review without inventing a zero percentage',()=>{
  const entry:AssessmentProgressEntry={source:'assessment',completionKind:null,attemptId:'p',assignmentId:'a',assignmentTitle:'Работа',studentId:'s',studentName:'Ученик',subject:'Математика',topic:'Уравнения',grade:7,classId:'c',className:'7А',contextSource:'legacy-current',submittedAt:'2026-10-20T10:00:00Z',number:2,status:'pending_review',score:null,maxScore:5,percentage:null,durationMs:60000};
  const html=renderToStaticMarkup(createElement(AssessmentProgress,{data:{history:[entry],latest:[entry],totals:{completedWorks:1,awaitingReview:1,score:0,maxScore:0,percentage:null},topics:[{id:'a',subject:'Математика',topic:'Уравнения',source:'assessment'}]}}));
  expect(html).toContain('Последняя завершённая попытка');expect(html).toContain('Ожидает проверки');expect(html).not.toContain('0%');expect(html).toContain('Исторические сведения');expect(html).not.toContain('Mastery');
 });
});
