'use client';
import {useEffect,useState} from 'react';
import type {MaterialRecord} from '@/lib/domain';
import type {Question,AssessmentDocument} from '@/lib/assessment/schema';
import {validateOnlineTest} from '@/lib/assessment/online';
import {api} from '@/lib/client';
import {useApp} from '../app-context';
import {MarkdownContent} from '../content/markdown';
import {AssignmentCreateForm} from '../assignments/teacher';
type Single=Extract<Question,{kind:'single'}>;
export function editOnlineQuestion(material:MaterialRecord,id:string,patch:Partial<Single>):MaterialRecord{
 const content=material.contentJson;if(!('schemaVersion' in content)||content.kind!=='assessment')throw Error('Нужен тест.');
 return {...material,status:'draft',metadataJson:{...material.metadataJson,keysConfirmed:false},contentJson:{...content,variants:content.variants.map(v=>({...v,questions:v.questions.map(q=>q.id===id?{...q,...patch,id:q.id,kind:'single',points:1} as Single:q)}))}};
}
export function OnlineTestEditor({material,onChange,onSave}:{material:MaterialRecord;onChange:(m:MaterialRecord)=>void;onSave:()=>Promise<void>}){
 const {navigate}=useApp(),[preview,setPreview]=useState(true),[issuing,setIssuing]=useState(false),[groups,setGroups]=useState<{id:string;name:string}[]>([]),[groupId,setGroupId]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let alive=true;api<{id:string;name:string}[]>('classes').then(value=>{if(alive)setGroups(value);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 const doc=material.contentJson;if(!('schemaVersion' in doc)||doc.kind!=='assessment')return null;
 const questions=doc.variants[0].questions,confirmed=material.metadataJson.keysConfirmed===true;
 const mutate=(content:AssessmentDocument)=>onChange({...material,status:'draft',contentJson:content,metadataJson:{...material.metadataJson,keysConfirmed:false}});
 const confirm=(checked:boolean)=>{if(checked){try{validateOnlineTest(doc);}catch{setError('Проверьте 5–30 вопросов: четыре различных ответа, один ключ и объяснение в каждом.');return;}}setError('');onChange({...material,status:checked?'ready':'draft',metadataJson:{...material.metadataJson,keysConfirmed:checked}});};
 return <div className="animated-page online-test-editor"><header className="page-heading"><span className="eyebrow">ЧЕРНОВИК ОНЛАЙН-КОНТРОЛЬНОЙ</span><h1>{material.title}</h1><p>{material.subject} · {material.grade} класс · {questions.length} вопросов · {questions.length} баллов</p></header>
  <p className="ai-disclaimer">Перед выдачей проверьте факты, формулировки и правильные ответы. ИИ может ошибаться. Ключи и пояснения ниже видит только преподаватель.</p>
  {doc.demo&&<p role="status">Демонстрационный шаблон: заполните вопросы и ключи вручную.</p>}
  <div className="button-row"><button className="button secondary" onClick={()=>setPreview(v=>!v)}>{preview?'Редактировать вопросы':'Просмотреть тест'}</button><button className="button primary" onClick={()=>void onSave()}>Сохранить</button><button className="button primary" disabled={!confirmed} onClick={async()=>{await onSave();setIssuing(true);}}>Выдать группе</button></div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {!preview&&<><label className="field">Название<input value={material.title} maxLength={200} onChange={e=>onChange({...material,title:e.target.value,status:'draft',metadataJson:{...material.metadataJson,keysConfirmed:false}})}/></label><label className="field">Инструкция ученику<textarea value={doc.instructions} maxLength={10000} onChange={e=>mutate({...doc,instructions:e.target.value})}/></label></>}
  {questions.map((q,index)=>q.kind==='single'&&<section className="glass-card section-space" key={q.id}><h2>Вопрос {index+1} · 1 балл</h2>{preview?<><MarkdownContent source={q.prompt}/><ol type="A">{q.options.map(option=><li key={option.id}><MarkdownContent source={option.label} inline/>{q.correctOptionIds.includes(option.id)&&<strong> — верный ответ</strong>}</li>)}</ol><div className="teacher-explanation"><span>Пояснение преподавателю</span><MarkdownContent source={q.explanation??''}/></div></>:<>
   <label className="field">Условие<textarea value={q.prompt} maxLength={20000} onChange={e=>onChange(editOnlineQuestion(material,q.id,{prompt:e.target.value}))}/></label>
   <fieldset><legend>Варианты ответа — выберите верный</legend>{q.options.map((option,i)=><div className="form-grid" key={option.id}><label className="field">Вариант {String.fromCharCode(65+i)}<input value={option.label} maxLength={2000} onChange={e=>onChange(editOnlineQuestion(material,q.id,{options:q.options.map(o=>o.id===option.id?{...o,label:e.target.value}:o)}))}/></label><label className="check-field"><input type="radio" name={'key-'+q.id} checked={q.correctOptionIds.includes(option.id)} onChange={()=>onChange(editOnlineQuestion(material,q.id,{correctOptionIds:[option.id]}))}/>Верный ответ</label></div>)}</fieldset>
   <label className="field">Объяснение ключа, только преподавателю<textarea value={q.explanation??''} maxLength={10000} onChange={e=>onChange(editOnlineQuestion(material,q.id,{explanation:e.target.value}))}/></label>
   <button className="button secondary" disabled={questions.length<=5} onClick={()=>mutate({...doc,variants:[{...doc.variants[0],questions:questions.filter(item=>item.id!==q.id)}]})}>Удалить вопрос {index+1}</button>
  </>}</section>)}
  {!preview&&<button className="button secondary" disabled={questions.length>=30} onClick={()=>mutate({...doc,variants:[{...doc.variants[0],questions:[...questions,{id:crypto.randomUUID(),kind:'single',prompt:'Новое условие',points:1,answerLines:1,options:Array.from({length:4},(_,i)=>({id:crypto.randomUUID(),label:'Вариант '+(i+1)})),correctOptionIds:[],explanation:''}]}]})}>Добавить вопрос</button>}
  <label className="check-field section-space"><input type="checkbox" checked={confirmed} onChange={e=>confirm(e.target.checked)}/>Вопросы, ключи и факты проверены. Любое изменение снимет подтверждение.</label>
  {issuing&&confirmed&&<section className="glass-card section-space"><h2>Выдать классу или группе</h2><label className="field">Группа<select value={groupId||groups[0]?.id||''} onChange={e=>setGroupId(e.target.value)}>{groups.map(group=><option value={group.id} key={group.id}>{group.name}</option>)}</select></label>{groups.length?<AssignmentCreateForm classId={groupId||groups[0].id} materials={[material]} initialKind="test" initialMaterialId={material.id} onCreated={()=>navigate('/classes')}/>:<p>Сначала создайте группу в разделе «Мои занятия».</p>}</section>}
 </div>;
}
