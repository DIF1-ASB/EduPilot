import type {AssessmentDocument} from './schema';
import type {PublicQuestion} from './public';
function randomIndex(upper:number):number{
 const values=new Uint32Array(1),limit=Math.floor(0x100000000/upper)*upper;
 do{crypto.getRandomValues(values);}while(values[0]>=limit);return values[0]%upper;
}
export function buildOptionOrder(doc:AssessmentDocument,variantId:string,random:(upper:number)=>number=randomIndex):Record<string,string[]>{
 const variant=doc.variants.find(v=>v.id===variantId);if(!variant)throw Error('Неизвестный вариант работы.');
 return Object.fromEntries(variant.questions.filter(q=>q.kind==='single'||q.kind==='multiple').map(q=>{
  if(q.kind!=='single'&&q.kind!=='multiple')throw Error('Нужны варианты ответа.');const ids=q.options.map(o=>o.id);
  for(let i=ids.length-1;i>0;i--){const j=random(i+1);if(!Number.isInteger(j)||j<0||j>i)throw Error('Некорректный источник случайности.');[ids[i],ids[j]]=[ids[j],ids[i]];}
  return [q.id,ids];
 }));
}
export function applyOptionOrder(questions:PublicQuestion[],raw:unknown):PublicQuestion[]{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректный порядок ответов.');
 const order=raw as Record<string,unknown>;
 return questions.map(q=>{
  if(!q.options||!Object.prototype.hasOwnProperty.call(order,q.id))return q;
  const ids=order[q.id];if(!Array.isArray(ids)||ids.length!==q.options.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!q.options!.some(o=>o.id===id)))throw Error('Сохранённый порядок не соответствует вариантам ответа.');
  return {...q,options:ids.map(id=>q.options!.find(o=>o.id===id)!)};
 });
}
