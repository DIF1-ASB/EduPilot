import {describe,it,expect} from 'vitest';
import {gradeVariant,normalizeNumeric} from '../lib/assessment/grading';
import {validateAssessment} from '../lib/assessment/schema';
const doc=()=>validateAssessment({schemaVersion:2,kind:'assessment',demo:false,instructions:'Решите',variants:[{id:'v',label:'V',questions:[
 {id:'s',kind:'single',prompt:'Выбор',points:2,options:[{id:'a',label:'А'},{id:'b',label:'Б'}],correctOptionIds:['a']},
 {id:'m',kind:'multiple',prompt:'Выбор нескольких',points:3,options:[{id:'a',label:'А'},{id:'b',label:'Б'},{id:'c',label:'В'}],correctOptionIds:['a','b']},
 {id:'t',kind:'short',prompt:'Текст',points:1,acceptedAnswers:['Ёлка на  горе','й']},
 {id:'n',kind:'numeric',prompt:'Число',points:2,acceptedAnswers:['1/2']},
 {id:'o',kind:'open',prompt:'Объясните',points:4,criteria:'Обоснование'},
 {id:'z',kind:'open',prompt:'Для размышления',points:0,criteria:'Критерий'}]}]},{publishable:true});
describe('deterministic assessment grading',()=>{
 it('scores ids/exact sets, preserves zero points and waits only for nonempty open answers',()=>{
  const result=gradeVariant(doc(),'v',{s:'a',m:['b','a'],t:'  ЁЛКА  на\nГОРЕ ',n:'0,5',o:'Обоснованный ответ',z:'Текст'});
  expect(result).toMatchObject({autoScore:8,maxScore:12,pendingQuestionIds:['o']});expect(result.items.find(i=>i.questionId==='z')?.points).toBe(0);
  expect(gradeVariant(doc(),'v',{})).toMatchObject({autoScore:0,maxScore:12,pendingQuestionIds:[]});
  expect(gradeVariant(doc(),'v',{m:['a'],t:'елка на горе',n:'NaN'}).autoScore).toBe(0);
  expect(gradeVariant(doc(),'v',{t:'и\u0306'}).autoScore).toBe(1);
 });
 it('rejects unknown and duplicate option ids, never accepts another variant answer',()=>{
  for(const answers of [{s:'unknown'},{m:['a','a']},{foreign:'x'}])expect(()=>gradeVariant(doc(),'v',answers)).toThrow();
 });
 it.each(['0,5','0.5','1/2','2/4','+0.500','  5/10 '])('compares rational %s exactly',value=>{
  expect(normalizeNumeric(value)).toEqual({numerator:BigInt(1),denominator:BigInt(2)});
  expect(gradeVariant(doc(),'v',{n:value}).autoScore).toBe(2);
 });
 it.each(['1/0','NaN','Infinity','1e3','2+2','(()=>42)()','1000000000000000001','1/1000000000000000001','1'.repeat(101),'0.00000000000000000001'])('rejects unsafe numeric %s',value=>{
  expect(normalizeNumeric(value)).toBeNull();
 });
 it('reduces signed fractions and zero without floating point precision loss',()=>{
  expect(normalizeNumeric('-2/-4')).toEqual({numerator:BigInt(1),denominator:BigInt(2)});
  expect(normalizeNumeric('0')).toEqual({numerator:BigInt(0),denominator:BigInt(1)});
  expect(normalizeNumeric('999999999999999999/1000000000000000000')).toEqual({numerator:BigInt('999999999999999999'),denominator:BigInt('1000000000000000000')});
 });
});
