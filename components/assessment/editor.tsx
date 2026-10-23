'use client';
import {useEffect,useState} from 'react';
import type {MaterialRecord} from '@/lib/domain';
import {questionKinds,defaultAnswerLines,validateAssessment,type Question,type QuestionKind,type AssessmentDocument} from '@/lib/assessment/schema';
import {buildAnswerSheet} from '@/lib/assessment/sheet';
import {SheetPreview} from './sheet-preview';
const names:Record<QuestionKind,string>={single:'Один вариант',multiple:'Несколько вариантов',short:'Краткий ответ',numeric:'Числовой ответ',open:'Развёрнутый ответ'};
export function editAssessmentQuestion(material:MaterialRecord,variantId:string,questionId:string,patch:Partial<Question>):MaterialRecord{
 const doc=material.contentJson;if(!('schemaVersion' in doc)||doc.kind!=='assessment')throw new Error('Нужна структурированная работа');
 const variants=doc.variants.map(v=>v.id!==variantId?v:{...v,questions:v.questions.map(q=>{
  if(q.id!==questionId)return q;
  if(patch.kind&&patch.kind!==q.kind){
   const kind=patch.kind,base={id:q.id,prompt:q.prompt,points:q.points,answerLines:defaultAnswerLines(kind),explanation:q.explanation};
   return {...base,kind,...(kind==='single'||kind==='multiple'?{options:[{id:'a',label:'Вариант ответа 1'},{id:'b',label:'Вариант ответа 2'}],correctOptionIds:[]}:kind==='open'?{criteria:''}:{acceptedAnswers:[]})} as Question;
  }
  return {...q,...patch,id:q.id} as Question;
 })});
 return {...material,status:'draft',contentJson:{...doc,variants},metadataJson:{...material.metadataJson,keysConfirmed:false}};
}
export function convertLegacyAssessment(material:MaterialRecord):MaterialRecord{
 if('schemaVersion' in material.contentJson)return material;
 const content:AssessmentDocument={schemaVersion:2,kind:'assessment',demo:material.contentJson.demo??false,instructions:'',variants:[{id:crypto.randomUUID(),label:'Вариант 1',questions:material.contentJson.sections.map(s=>({id:crypto.randomUUID(),kind:'open',prompt:s.title+'\n'+s.body+(s.options?.length?'\n'+s.options.join('\n'):''),points:s.points??1,answerLines:6,criteria:''}))}]};
 return {...material,status:'draft',contentJson:content,metadataJson:{...material.metadataJson,keysConfirmed:false}};
}
export function moveAssessmentQuestion(material:MaterialRecord,variantId:string,questionId:string,direction:-1|1):MaterialRecord{
 const doc=material.contentJson;if(!('schemaVersion' in doc)||doc.kind!=='assessment')throw Error('Нужна структурированная работа');
 const variants=doc.variants.map(v=>{if(v.id!==variantId)return v;const questions=[...v.questions],at=questions.findIndex(q=>q.id===questionId),next=at+direction;if(at<0||next<0||next>=questions.length)return v;[questions[at],questions[next]]=[questions[next],questions[at]];return {...v,questions};});
 return {...material,status:'draft',contentJson:{...doc,variants},metadataJson:{...material.metadataJson,keysConfirmed:false}};
}
function AcceptedAnswersField({answers,onChange}:{answers:string[],onChange:(answers:string[])=>void}){
 const [raw,setRaw]=useState(answers.join('\n')),normalized=(value:string)=>value.split('\n').map(x=>x.trim()).filter(Boolean);
 const value=answers.join('\n');
 useEffect(()=>{if(normalized(raw).join('\n')!==value)setRaw(value);},[value]);
 return <label className="field">Правильные ответы — каждый с новой строки<textarea value={raw} maxLength={20000} onChange={e=>{setRaw(e.target.value);onChange(normalized(e.target.value));}}/></label>;
}
type Props={material:MaterialRecord,onChange:(m:MaterialRecord)=>void,onSave:()=>Promise<void>,onPreview:()=>void,onDownload?:(format:string,answers:boolean)=>void};
export function AssessmentEditor({material,onChange,onSave,onPreview,onDownload}:Props){
 const [mode,setMode]=useState<'edit'|'blank'|'keys'>('edit'),[error,setError]=useState(''),[variantId,setVariantId]=useState('');
 const doc=material.contentJson;if(!('schemaVersion' in doc)||doc.kind!=='assessment')return null;
 const mutate=(content:AssessmentDocument)=>onChange({...material,status:'draft',contentJson:content,metadataJson:{...material.metadataJson,keysConfirmed:false}});
 const question=(v:string,q:string,patch:Partial<Question>)=>onChange(editAssessmentQuestion(material,v,q,patch));
 const confirmKeys=(checked:boolean)=>{
  if(checked){try{validateAssessment(doc,{publishable:true});}catch(e){setError('Заполните корректные ключи, вопросы и равные суммы баллов вариантов.');return;}}
  setError('');onChange({...material,status:checked?'ready':'draft',metadataJson:{...material.metadataJson,keysConfirmed:checked}});
 };
 const preview=(value:'blank'|'keys')=>{setMode(value);onPreview();};
 const totalQuestions=doc.variants.reduce((n,v)=>n+v.questions.length,0);
 return <div className="animated-page assessment-author">
  <header className="page-heading"><span className="eyebrow">СТРУКТУРИРОВАННАЯ РАБОТА</span><h1>{material.title}</h1><p>{material.subject} · {material.grade} класс</p></header>
  {doc.demo&&<p role="status" className="ai-disclaimer">Демонстрационный шаблон: задания и ключи необходимо заполнить и проверить вручную.</p>}
  <div className="button-row" role="group" aria-label="Режим редактора">
   <button className="button secondary" onClick={()=>setMode('edit')}>Редактировать</button>
   <button className="button secondary" onClick={()=>preview('blank')}>Бланк ученика</button><button className="button secondary" onClick={()=>preview('keys')}>Ключи преподавателя</button>
   <button className="button primary" onClick={()=>void onSave()}>Сохранить</button>
   {onDownload&&['docx','pdf'].map(format=><button className="button secondary" key={format} onClick={()=>onDownload(format,mode==='keys')}>Скачать {format.toUpperCase()}</button>)}
   {mode!=='edit'&&material.type!=='test'&&<button className="button secondary" onClick={()=>window.print()}>Печать</button>}
  </div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {mode==='edit'?<>
   <label className="field">Название материала<input value={material.title} maxLength={200} onChange={e=>onChange({...material,title:e.target.value,metadataJson:{...material.metadataJson,keysConfirmed:false}})}/></label>
   <label className="field">Инструкция ученику<textarea value={doc.instructions} maxLength={10000} onChange={e=>mutate({...doc,instructions:e.target.value})}/></label>
   {doc.variants.map((variant,vi)=><section className="glass-card section-space" key={variant.id}>
    <label className="field">Название варианта<input value={variant.label} maxLength={200} onChange={e=>mutate({...doc,variants:doc.variants.map(v=>v.id===variant.id?{...v,label:e.target.value}:v)})}/></label>
    <p>Вопросов: {variant.questions.length} · Максимум: {variant.questions.reduce((n,q)=>n+q.points,0)} баллов</p>
    {doc.variants.length>1&&<button className="button secondary" onClick={()=>mutate({...doc,variants:doc.variants.filter(v=>v.id!==variant.id)})}>Удалить вариант {vi+1}</button>}
    {variant.questions.map((q,qi)=><fieldset className="assessment-question section-space" key={q.id}><legend>Задание {qi+1}</legend>
     <div className="button-row"><button className="button secondary" disabled={qi===0} onClick={()=>onChange(moveAssessmentQuestion(material,variant.id,q.id,-1))}>Переместить задание {qi+1} вверх</button><button className="button secondary" disabled={qi===variant.questions.length-1} onClick={()=>onChange(moveAssessmentQuestion(material,variant.id,q.id,1))}>Переместить задание {qi+1} вниз</button></div>
     <label className="field">Тип вопроса<select value={q.kind} onChange={e=>question(variant.id,q.id,{kind:e.target.value as QuestionKind})}>{questionKinds.map(k=><option key={k} value={k}>{names[k]}</option>)}</select></label>
     <label className="field">Условие<textarea value={q.prompt} maxLength={20000} onChange={e=>question(variant.id,q.id,{prompt:e.target.value})}/></label>
     <div className="form-grid"><label className="field">Баллы<input type="number" min={0} max={1000} step={1} value={q.points} onChange={e=>question(variant.id,q.id,{points:Number(e.target.value)})}/></label>
      <label className="field">Строк для ответа<input type="number" min={1} max={12} step={1} value={q.answerLines} onChange={e=>question(variant.id,q.id,{answerLines:Number(e.target.value)})}/></label></div>
     {q.kind==='single'||q.kind==='multiple'?<div><h3>Правильные ответы</h3>{q.options.map(o=><div className="form-grid" key={o.id}>
      <label className="field">Вариант ответа<input value={o.label} maxLength={2000} onChange={e=>question(variant.id,q.id,{options:q.options.map(x=>x.id===o.id?{...x,label:e.target.value}:x)})}/></label>
      <label className="check-field"><input type={q.kind==='single'?'radio':'checkbox'} name={q.id+'-key'} checked={q.correctOptionIds.includes(o.id)} onChange={e=>question(variant.id,q.id,{correctOptionIds:q.kind==='single'?[o.id]:e.target.checked?[...q.correctOptionIds,o.id]:q.correctOptionIds.filter(id=>id!==o.id)})}/>Правильный вариант</label>
      {q.options.length>2&&<button className="button secondary" onClick={()=>question(variant.id,q.id,{options:q.options.filter(x=>x.id!==o.id),correctOptionIds:q.correctOptionIds.filter(id=>id!==o.id)})}>Удалить вариант ответа</button>}
     </div>)}<button className="button secondary" disabled={q.options.length>=10} onClick={()=>question(variant.id,q.id,{options:[...q.options,{id:crypto.randomUUID(),label:'Новый вариант'}]})}>Добавить вариант ответа</button></div>
     :q.kind==='open'?<label className="field">Критерии ручной проверки<textarea value={q.criteria} maxLength={10000} onChange={e=>question(variant.id,q.id,{criteria:e.target.value})}/></label>
     :<AcceptedAnswersField key={q.id+'-'+q.kind} answers={q.acceptedAnswers} onChange={acceptedAnswers=>question(variant.id,q.id,{acceptedAnswers})}/>}
     <label className="field">Разбор для преподавателя<textarea value={q.explanation??''} maxLength={10000} onChange={e=>question(variant.id,q.id,{explanation:e.target.value})}/></label>
     {variant.questions.length>1&&<button className="button secondary" onClick={()=>mutate({...doc,variants:doc.variants.map(v=>v.id===variant.id?{...v,questions:v.questions.filter(x=>x.id!==q.id)}:v)})}>Удалить задание {qi+1}</button>}
    </fieldset>)}
    <button className="button secondary" disabled={variant.questions.length>=30||totalQuestions>=100} onClick={()=>mutate({...doc,variants:doc.variants.map(v=>v.id===variant.id?{...v,questions:[...v.questions,{id:crypto.randomUUID(),kind:'short',prompt:'Новое задание',points:1,answerLines:2,acceptedAnswers:[]}]}:v)})}>Добавить задание</button>
   </section>)}
   <button className="button secondary" disabled={doc.variants.length>=4||totalQuestions+doc.variants[0].questions.length>100} onClick={()=>mutate({...doc,variants:[...doc.variants,{...doc.variants[0],id:crypto.randomUUID(),label:`Вариант ${doc.variants.length+1}`,questions:doc.variants[0].questions.map(q=>({...q,id:crypto.randomUUID()}))}]})}>Добавить вариант работы</button>
   <label className="check-field section-space"><input type="checkbox" checked={material.metadataJson.keysConfirmed===true} onChange={e=>confirmKeys(e.target.checked)}/>Ключи, критерии и факты проверены преподавателем. Изменение материала сбросит подтверждение.</label>
  </>:<><label className="field sheet-variant-control">Предпросмотр варианта<select value={doc.variants.some(v=>v.id===variantId)?variantId:doc.variants[0].id} onChange={e=>setVariantId(e.target.value)}>{doc.variants.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select><span>Скачивание включает все варианты; ключи — отдельным разделом в соответствующем режиме.</span></label><SheetPreview sheet={buildAnswerSheet(material,{variantId:doc.variants.some(v=>v.id===variantId)?variantId:doc.variants[0].id,includeTeacherKeys:mode==='keys'})}/></>}
 </div>;
}
