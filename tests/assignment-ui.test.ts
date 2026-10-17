import {describe,it,expect} from 'vitest';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {QuestionInput} from '../components/assessment/question-input';
describe('accessible student question inputs',()=>{
 it.each(['single','multiple','short','numeric','open'] as const)('renders the specialized %s input with a question label and no private fields',kind=>{
  const html=renderToStaticMarkup(createElement(QuestionInput,{question:{id:'q',kind,prompt:'Вопрос ученику',points:1,answerLines:2,...(kind==='single'||kind==='multiple'?{options:[{id:'a',label:'Первый'},{id:'b',label:'Второй'}]}:{})},value:kind==='multiple'?['a']:'',onChange:()=>{},disabled:false}));
  expect(html).toContain('Вопрос ученику');expect(html).not.toContain('correctOptionIds');
  if(kind==='single')expect(html).toContain('type="radio"');else if(kind==='multiple')expect(html).toContain('type="checkbox"');else if(kind==='open')expect(html).toContain('<textarea');else expect(html).toContain('<input');
 });
});
