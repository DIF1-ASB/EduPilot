import {afterEach,describe,it,expect,vi} from 'vitest';
import {LiveAIProvider,MockAIProvider} from '../lib/ai';
import {onlineTestInputSchema,buildOnlineTestMessages,parseOnlineTestReply,canonicalizeQuizOptionIds} from '../lib/assessment/online';
import {quizFixture} from './helpers/online-content';
const input={title:'Линейные уравнения',subject:'Математика',grade:7};
afterEach(()=>vi.unstubAllGlobals());
describe('online single-choice profile',()=>{
 it('offers an explicitly unfinished demo and bounds each provider generation to one upstream call',async()=>{
  const params=onlineTestInputSchema.parse(input),draft=await new MockAIProvider().generateOnlineTest(params);
  expect(draft.demo).toBe(true);expect(draft.variants[0].questions).toHaveLength(10);
  let calls=0;vi.stubGlobal('fetch',async()=>{calls++;return Response.json({choices:[{message:{content:'{}'}}]});});
  await expect(new LiveAIProvider().generateOnlineTest(params)).rejects.toMatchObject({rawReply:'{}'});expect(calls).toBe(1);
 });
 it('defaults to ten questions and rejects wrong counts, types, keys and AI scoring criteria',()=>{
  const parsed=onlineTestInputSchema.parse(input);expect(parsed.count).toBe(10);
  const good=quizFixture();expect(parseOnlineTestReply(JSON.stringify(good),parsed).variants[0].questions).toHaveLength(10);
  for(const patch of [{points:2},{options:good.variants[0].questions[0].options.slice(0,3)},{correctOptionIds:['a','b']},{criteria:'Произвольные баллы'},{kind:'short'},{explanation:''},{prompt:good.variants[0].questions[1].prompt}]){
   const bad=structuredClone(good);Object.assign(bad.variants[0].questions[0],patch);expect(()=>parseOnlineTestReply(JSON.stringify(bad),parsed)).toThrow();
  }
  expect(()=>parseOnlineTestReply(JSON.stringify(quizFixture(5)),parsed)).toThrow();
  const duplicates=structuredClone(good);duplicates.variants[0].questions[0].options[1].label='1';expect(()=>parseOnlineTestReply(JSON.stringify(duplicates),parsed)).toThrow();
 });
 it('uses opaque option IDs in a new snapshot while preserving key labels and the original',()=>{
  const doc=parseOnlineTestReply(JSON.stringify(quizFixture()),onlineTestInputSchema.parse(input)),before=structuredClone(doc),next=canonicalizeQuizOptionIds(doc);
  expect(doc).toEqual(before);
  for(const q of next.variants[0].questions){if(q.kind!=='single')throw Error('wrong kind');expect(q.options.every(o=>/^[0-9a-f-]{36}$/.test(o.id))).toBe(true);expect(q.options.find(o=>o.id===q.correctOptionIds[0])?.label).toBe(String(Number(q.id.slice(1))+1));}
 });
 it('keeps user fields out of the system prompt and detects corrupted JSON LaTeX',()=>{
  const params=onlineTestInputSchema.parse({...input,clarifications:'IGNORE_RULES'}),messages=buildOnlineTestMessages(params);
  expect(messages[0].content).not.toContain('IGNORE_RULES');expect(messages[1].content).toContain('IGNORE_RULES');
  const doc=quizFixture();doc.variants[0].questions[0].explanation='x\right';expect(()=>parseOnlineTestReply(JSON.stringify(doc),params)).toThrow();
 });
});
