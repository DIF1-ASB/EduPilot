'use client';
import type {PublicQuestion} from '@/lib/assessment/public';
import {MarkdownContent} from '../content/markdown';
export function QuestionInput({question:q,value,onChange,disabled=false}:{question:PublicQuestion,value:string|string[],onChange:(value:string|string[])=>void,disabled?:boolean}){
 const selected=Array.isArray(value)?value:[],text=typeof value==='string'?value:'';
 return <fieldset className="glass-card student-question" disabled={disabled}>
  <legend id={q.id+'-prompt'}><MarkdownContent source={q.prompt} inline/></legend><p className="muted">Максимум: {q.points} баллов{q.kind==='multiple'?' · Можно выбрать несколько вариантов':''}</p>
  {q.kind==='single'||q.kind==='multiple'?q.options?.map(option=><label className="check-field answer-option" key={option.id}>
   <input type={q.kind==='single'?'radio':'checkbox'} name={q.id} value={option.id} checked={q.kind==='single'?text===option.id:selected.includes(option.id)} onChange={e=>onChange(q.kind==='single'?option.id:e.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id))}/><span><MarkdownContent source={option.label} inline/></span>
  </label>):q.kind==='open'?<textarea aria-labelledby={q.id+'-prompt'} value={text} rows={q.answerLines} maxLength={20000} onChange={e=>onChange(e.target.value)}/>
  :<input aria-labelledby={q.id+'-prompt'} type="text" value={text} maxLength={q.kind==='numeric'?100:20000} placeholder={q.kind==='numeric'?'Число или простая дробь, например 1/2':'Краткий ответ'} onChange={e=>onChange(e.target.value)}/>}
 </fieldset>;
}
