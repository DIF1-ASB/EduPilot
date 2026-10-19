'use client';
import {useEffect,useRef,useState} from 'react';import {toast} from 'sonner';
import {api} from '@/lib/client';import type {AssignmentStudentDTO} from '@/lib/assignments/contracts';import type {AttemptDTO} from '@/lib/assessment/public';
import {materialSections} from '@/lib/materials/content';import {useApp} from '../app-context';import {AnimatedPage,GlassCard} from '../ui/edupilot';
import {AssignmentTeacherPanel} from './teacher';import {dateLabel,statusLabel} from './list';
export function AssignmentPage({id}:{id:string}){const {user}=useApp();return user.role==='teacher'?<AssignmentTeacherPanel assignmentId={id}/>:<StudentAssignment id={id}/>;}
function StudentAssignment({id}:{id:string}){
 const {navigate}=useApp(),[item,setItem]=useState<AssignmentStudentDTO|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),requestId=useRef<string|null>(null),edits=useRef(0),currentId=useRef(id);currentId.current=id;
 const load=async()=>{const data=await api<AssignmentStudentDTO>('assignments/'+id);if(currentId.current===id)setItem(data);};
 useEffect(()=>{let alive=true;setItem(null);setText('');setError('');edits.current=0;requestId.current=null;
  api<AssignmentStudentDTO>('assignments/'+id).then(data=>{if(!alive)return;setItem(data);if(edits.current===0)setText(data.submission?.text??'');}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};
 },[id]);
 if(error&&!item)return <p role="alert" className="form-error">{error}</p>;if(!item)return <p role="status">Загрузка задания…</p>;
 const active=item.attempts.find(a=>a.status==='in_progress'),canStart=!item.closed&&item.usedAttempts<item.policy.maxAttempts&&(!item.dueDate||new Date(item.dueDate)>new Date());
 const start=async()=>{setBusy(true);setError('');try{
  requestId.current??=crypto.randomUUID();const attempt=await api<AttemptDTO>(`assignments/${id}/start`,'POST',{requestId:requestId.current});navigate(`/assignments/${id}/attempts/${attempt.id}`);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const sections=item.content?materialSections(item.content,false).sections:[];
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">{item.kind==='test'?'КОНТРОЛЬНАЯ':'ДОМАШНЕЕ ЗАДАНИЕ'}</span><h1>{item.title}</h1><p>{item.className} · {item.subject} · {item.teacherName}</p><p>Срок: {dateLabel(item.dueDate)} (местное время)</p></header>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {item.kind==='test'?<><GlassCard><h2>Перед началом</h2><p>Длительность: {item.policy.durationMinutes} минут. Лимит: {item.policy.maxAttempts}. Уже начато: {item.usedAttempts}.</p><p>Таймер запускается только кнопкой ниже. Перезагрузка не добавляет время. Решения {item.policy.answerPolicy==='manual'?'скрыты до разрешения преподавателя':item.policy.answerPolicy==='after_due'?'открываются после срока':'открываются после вашей последней завершённой попытки'}.</p>
   {active?<button className="button primary" onClick={()=>navigate(`/assignments/${id}/attempts/${active.id}`)}>Продолжить контрольную</button>:canStart?<button className="button primary" disabled={busy} onClick={()=>void start()}>Начать контрольную</button>:<p>Новые попытки недоступны: лимит исчерпан, работа закрыта или срок истёк.</p>}</GlassCard>
   <h2 className="section-space">Мои попытки</h2>{item.attempts.map(a=><GlassCard key={a.id}><p>Попытка {a.number} · {statusLabel(a.status)}</p><button className="button secondary" onClick={()=>navigate(`/assignments/${id}/attempts/${a.id}`)}>Открыть попытку {a.number}</button></GlassCard>)}</>
  :<><GlassCard>{sections.map(s=><section key={s.id}><h2>{s.title}</h2><p style={{whiteSpace:'pre-wrap'}}>{s.body}</p>{s.options?.map((o,i)=><p key={i}>{o}</p>)}</section>)}</GlassCard>
   <GlassCard className="section-space"><h2>Моя работа</h2>{item.submission?.grade?<><p>Оценка: {item.submission.grade.score} / {item.submission.grade.maxScore}</p><p>{item.submission.grade.teacherComment}</p><p style={{whiteSpace:'pre-wrap'}}>{item.submission.text}</p></>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api(`assignments/${id}/homework`,'POST',{text});await load();toast.success('Работа отправлена');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <label className="field">Мой ответ<textarea value={text} required maxLength={20000} rows={8} onChange={e=>{edits.current++;setText(e.target.value);}}/></label><button className="button primary" disabled={busy||item.closed}>Отправить домашнюю работу</button>{item.submission&&<p>Последняя отправка: {dateLabel(item.submission.submittedAt)}. Можно исправить до оценки или срока.</p>}
   </form>}</GlassCard></>}
 </AnimatedPage>;
}
