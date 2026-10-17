import { describe, expect, it } from 'vitest';
import { defaultAnswerLines, validateAssessment, validateAnswers } from '../lib/assessment/schema';
import { parseMaterialContent, materialSections } from '../lib/materials/content';

const question = (id = 'q1') => ({ id, kind: 'single', prompt: 'Выберите число', points: 2, answerLines: 1,
  options: [{ id: 'a', label: 'Два' }, { id: 'b', label: 'Три' }], correctOptionIds: ['a'], explanation: 'PRIVATE_KEY' });
const document = () => ({ schemaVersion: 2, kind: 'assessment', demo: false, instructions: 'Решите',
  variants: [{ id: 'v1', label: 'Вариант 1', questions: [question()] }] });
describe('versioned material contracts', () => {
  it('reads legacy content without changing optional fields or zero points', () => {
    const legacy = { demo: false, sections: [{ id: 'old', title: 'Задача', body: 'Текст', points: 0 }] };
    expect(parseMaterialContent(legacy)).toEqual(legacy);
    expect(() => parseMaterialContent({ ...legacy, schemaVersion: 99 })).toThrow();
  });
  it('keeps zero points and supplies answer line defaults by question kind', () => {
    const doc = document(); doc.variants[0].questions.push({ ...question('q0'), points: 0 });
    expect(validateAssessment(doc, { publishable: true }).variants[0].questions[1].points).toBe(0);
    expect(['single','multiple','short','numeric','open'].map(k => defaultAnswerLines(k as any))).toEqual([1,1,2,2,6]);
    expect(validateAssessment({ ...document(), variants: [{ id: 'v', label: 'V', questions: [{ ...question(), answerLines: undefined }] }] }, { publishable: true }).variants[0].questions[0].answerLines).toBe(1);
  });
  it.each(['questions', 'variants', 'total', 'totals', 'questionIds', 'variantIds', 'optionIds', 'unknownKey', 'singleKeys', 'lines', 'fractionalPoints', 'zeroTotal'])(
    'rejects invalid %s', fault => {
      const doc: any = document();
      if (fault === 'questions') doc.variants[0].questions = Array.from({length:31}, (_,i)=>question('q'+i));
      if (fault === 'variants') doc.variants = Array.from({length:5},(_,i)=>({...doc.variants[0],id:'v'+i}));
      if (fault === 'total') doc.variants = Array.from({length:4},(_,i)=>({id:'v'+i,label:'V',questions:Array.from({length:26},(_,j)=>question(`q${i}-${j}`))}));
      if (fault === 'totals') doc.variants.push({id:'v2',label:'V2',questions:[{...question('q2'),points:3}]});
      if (fault === 'questionIds') doc.variants[0].questions.push(question());
      if (fault === 'variantIds') doc.variants.push(doc.variants[0]);
      if (fault === 'optionIds') doc.variants[0].questions[0].options[1].id = 'a';
      if (fault === 'unknownKey') doc.variants[0].questions[0].correctOptionIds = ['z'];
      if (fault === 'singleKeys') doc.variants[0].questions[0].correctOptionIds = ['a','b'];
      if (fault === 'lines') doc.variants[0].questions[0].answerLines = 13;
      if (fault === 'fractionalPoints') doc.variants[0].questions[0].points = 0.5;
      if (fault === 'zeroTotal') doc.variants[0].questions[0].points = 0;
      expect(() => validateAssessment(doc, { publishable: true })).toThrow();
    });
  it('allows incomplete draft keys but never publishes them', () => {
    const doc = document(); doc.variants[0].questions[0].correctOptionIds = [];
    expect(validateAssessment(doc, { publishable:false })).toMatchObject({schemaVersion:2});
    expect(() => validateAssessment(doc, { publishable:true })).toThrow();
    for (const kind of ['short','numeric','open']) {
      const content = {...document(),variants:[{id:'v',label:'V',questions:[{id:'q',kind,prompt:'Задача',points:1,...(kind==='open'?{criteria:''}:{acceptedAnswers:[]})}]}]};
      expect(() => validateAssessment(content,{publishable:false})).not.toThrow();
      expect(() => validateAssessment(content,{publishable:true})).toThrow();
    }
  });
  it('validates answer identities and types within exactly one variant', () => {
    const doc = validateAssessment(document(),{publishable:true});
    expect(validateAnswers(doc,'v1',{q1:'a'})).toEqual({q1:'a'});
    for(const answers of [{foreign:'a'},{q1:'z'},{q1:['a']},{q1:42}]) expect(()=>validateAnswers(doc,'v1',answers)).toThrow();
    expect(()=>validateAnswers(doc,'foreign',{})).toThrow();
    const multiple = validateAssessment({...document(),variants:[{id:'v1',label:'V',questions:[{...question(),kind:'multiple'}]}]},{publishable:true});
    expect(()=>validateAnswers(multiple,'v1',{q1:['a','a']})).toThrow();
    expect(validateAnswers(multiple,'v1',{q1:[]})).toEqual({q1:[]});
    expect(()=>validateAnswers(doc,'v1',{'__proto__':'a'})).not.toThrow();
  });
  it('projects versioned content into safe legacy text without private keys', () => {
    const content = parseMaterialContent(document());
    const student = materialSections(content, false);
    expect(student.sections[0]).toMatchObject({body:'Выберите число',options:['Два','Три'],points:2});
    expect(JSON.stringify(student)).not.toContain('PRIVATE_KEY');
    expect(student.sections[0]).not.toHaveProperty('answer');
    expect(materialSections(content,true).sections[0].answer).toContain('Два');
  });
});
