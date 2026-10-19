'use client';
import {AssignmentDownloads} from './downloads';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/client';import type {AttemptDTO} from '@/lib/assessment/public';import type {AnswerMap} from '@/lib/assessment/schema';
import {QuestionInput} from '../assessment/question-input';import {AnimatedPage,GlassCard} from '../ui/edupilot';
export function AttemptPage({assignmentId,attemptId}:{assignmentId:string,attemptId:string}){
 const [view,setView]=useState<AttemptDTO|null>(null),[answers,setAnswers]=useState<AnswerMap>({}),[error,setError]=useState(''),[conflict,setConflict]=useState(''),[status,setStatus]=useState(''),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(false),[copy,setCopy]=useState(false);
 const current=useRef<AnswerMap>({}),version=useRef(1),revision=useRef(0),saved=useRef(0),flight=useRef<Promise<boolean>|null>(null),anchor=useRef({server:0,local:0}),expiryLoading=useRef(false);
 const base=`assignments/${assignmentId}/attempts/${attemptId}`;
 const adopt=(data:AttemptDTO)=>{setView(data);version.current=data.version;anchor.current={server:Date.parse(data.serverTime),local:performance.now()};};
 const reload=async()=>{const data=await api<AttemptDTO>(base);adopt(data);current.current=data.answers;setAnswers(data.answers);revision.current=0;saved.current=0;setConflict('');setError('');setStatus(data.status==='in_progress'?'Черновик сохранён':'');};
 useEffect(()=>{setView(null);reload().catch(e=>setError(e.message));},[assignmentId,attemptId]);
 useEffect(()=>{if(!view)return;const update=()=>{
  const serverNow=anchor.current.server+performance.now()-anchor.current.local,left=Math.max(0,Math.ceil((Date.parse(view.expiresAt)-serverNow)/1000));setSeconds(left);
  if(left===0&&view.status==='in_progress'&&!expiryLoading.current){expiryLoading.current=true;api<AttemptDTO>(base).then(data=>{adopt(data);if(data.status!=='in_progress'){current.current=data.answers;setAnswers(data.answers);saved.current=revision.current;setStatus('Время истекло: сдан последний сохранённый черновик.');}}).catch(e=>setError(e.message)).finally(()=>{expiryLoading.current=false;});}
 };update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[view?.expiresAt,view?.status,base]);
 const save=():Promise<boolean>=>{
  if(flight.current)return flight.current;
  if(saved.current>=revision.current)return Promise.resolve(true);
  flight.current=(async()=>{try{
   while(saved.current<revision.current){const rev=revision.current;setStatus('Сохранение…');const data=await api<AttemptDTO>(base+'/draft','PATCH',{version:version.current,answers:current.current});adopt(data);saved.current=rev;if(data.status!=='in_progress')break;}
   setStatus('Черновик сохранён');return true;
  }catch(e){setConflict('Конфликт сохранения или ошибка: '+(e as Error).message);setStatus('Локальные ответы сохранены в этой вкладке');return false;}finally{flight.current=null;}})();return flight.current;
 };
 useEffect(()=>{if(!view||view.status!=='in_progress'||conflict||revision.current===saved.current)return;const timer=setTimeout(()=>void save(),650);return()=>clearTimeout(timer);},[answers,conflict,view?.status]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(revision.current>saved.current){e.preventDefault();e.returnValue='';}};const navigate=(e:Event)=>{if(revision.current>saved.current&&!confirm('Есть несохранённые ответы. Скопируйте их перед выходом. Покинуть страницу?'))e.preventDefault();};window.addEventListener('beforeunload',guard);window.addEventListener('edupilot:navigate',navigate);return()=>{window.removeEventListener('beforeunload',guard);window.removeEventListener('edupilot:navigate',navigate);};},[]);
 if(!view)return <p role={error?'alert':'status'}>{error||'Загрузка попытки…'}</p>;
 const terminal=view.status!=='in_progress',disabled=terminal||busy||seconds===0;
 const change=(id:string,value:string|string[])=>{const next={...current.current,[id]:value};current.current=next;revision.current++;setAnswers(next);setStatus('Есть несохранённые ответы');};
 const submit=async()=>{setError('');if(conflict){setError('Сначала разрешите конфликт сохранения.');return;}
  const missing=view.questions.filter(q=>{const value=current.current[q.id];return Array.isArray(value)?!value.length:!value?.trim();}).length;
  if(missing>0&&missing<view.questions.length&&!confirm(`Не отвечено заданий: ${missing}. Сдать неполную работу?`))return;
  setBusy(true);try{if(!await save())return;const data=await api<AttemptDTO>(base+'/submit','POST',{version:version.current,answers:current.current});adopt(data);current.current=data.answers;setAnswers(data.answers);saved.current=revision.current;setStatus('Работа сдана');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">КОНТРОЛЬНАЯ · ПОПЫТКА {view.number}</span><h1>Выполнение контрольной</h1>{!terminal&&<p aria-live="off">Осталось: {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</p>}<p role="status">{status}</p></header>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <GlassCard><h2>{view.variantLabel}</h2>{view.instructions&&<p style={{whiteSpace:'pre-wrap'}}>{view.instructions}</p>}</GlassCard>
  {conflict&&<GlassCard><p role="alert" className="form-error">{conflict}</p><p>Ваши ответы остаются в этой вкладке. Скопируйте их перед загрузкой серверной версии.</p><div className="button-row"><button className="button secondary" onClick={()=>setCopy(true)}>Показать текст для копирования</button><button className="button secondary" onClick={()=>{if(confirm('Заменить локальный ввод сохранённой серверной версией?'))void reload().catch(e=>setError(e.message));}}>Загрузить серверную версию</button></div>{copy&&<textarea aria-label="Локальные ответы для копирования" readOnly value={JSON.stringify(answers,null,2)} rows={8}/>}</GlassCard>}
  {view.result&&<GlassCard><h2>{view.status==='pending_review'?'Ожидает проверки преподавателем':`Результат: ${view.result.score} / ${view.result.maxScore}`}</h2>{view.status==='pending_review'&&<p>Предварительный балл объективной части: {view.result.autoScore} / {view.result.maxScore}</p>}{view.result.teacherComments.map(c=><p key={c.questionId}>Комментарий преподавателя: {c.comment}</p>)}</GlassCard>}
  <div className="assessment-questions">{view.questions.map(q=><QuestionInput key={q.id} question={q} value={answers[q.id]??(q.kind==='multiple'?[]:'')} disabled={disabled} onChange={value=>change(q.id,value)}/>)}</div>
  {!terminal&&<button className="button primary" disabled={disabled} onClick={()=>void submit()}>Завершить контрольную</button>}
  {terminal&&<AssignmentDownloads assignmentId={assignmentId} attemptId={attemptId}/>}
  {view.result?.solutions&&<GlassCard className="section-space"><h2>Разрешённые решения</h2>{view.result.solutions.map(solution=>{const q=view.questions.find(q=>q.id===solution.questionId);const value=Array.isArray(solution.answer)?solution.answer.map(a=>q?.options?.find(o=>o.id===a)?.label??a).join('; '):solution.answer;return <section key={solution.questionId}><h3>{q?.prompt}</h3><p>Ключ / критерии: {value}</p><p>{solution.explanation}</p><p>Баллы: {solution.points} / {solution.maxPoints}</p></section>;})}</GlassCard>}
 </AnimatedPage>;
}
