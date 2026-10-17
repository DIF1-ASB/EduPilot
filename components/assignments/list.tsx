'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/client';
import type {AssignmentStudentDTO,TeacherAssignmentDTO} from '@/lib/assignments/contracts';
import {useApp} from '../app-context';
import {AnimatedPage,GlassCard} from '../ui/edupilot';
export const dateLabel=(value:string|null)=>value?new Date(value).toLocaleString('ru-RU'):'Без срока';
export const statusLabel=(status:string)=>({in_progress:'Выполняется',pending_review:'Ожидает проверки',graded:'Проверено'}[status]??status);
export function AssignmentsPage({kind}:{kind:'homework'|'test'}){
 const {navigate,user}=useApp(),[items,setItems]=useState<(AssignmentStudentDTO|TeacherAssignmentDTO)[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{setItems(null);api<(AssignmentStudentDTO|TeacherAssignmentDTO)[]>('assignments?kind='+kind).then(setItems).catch(e=>setError(e.message));},[kind]);
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">НАЗНАЧЕННЫЕ РАБОТЫ</span><h1>{kind==='test'?'Контрольные':'Домашние задания'}</h1><p>{user.role==='teacher'?'Настраивайте работы и проверяйте результаты своих классов.':'Здесь работы ваших классов, условия сдачи и ваши результаты.'}</p></header>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {!items?<p role="status">Загрузка заданий…</p>:items.length===0?<GlassCard><h2>Пока нет назначений</h2><p>{user.role==='teacher'?'Выдайте работу на странице своего класса.':'Присоединитесь к классу по коду преподавателя или дождитесь назначения.'}</p><button className="button secondary" onClick={()=>navigate('/classes')}>Мои классы и занятия</button></GlassCard>:<div className="assignment-grid">{items.map(item=><GlassCard key={item.id}><h2>{item.title}</h2><p>{item.className}{'subject' in item?' · '+item.subject:''}</p><p>Срок: {dateLabel(item.policy.dueDate)} (местное время)</p>
   {kind==='test'&&<p>Лимит: {item.policy.maxAttempts} · Время: {item.policy.durationMinutes} мин.</p>}
   {'usedAttempts' in item&&<p>{kind==='test'?`Начато попыток: ${item.usedAttempts}. Лучший итог: ${item.bestScore??'ещё нет'}`:item.submission?.grade?'Проверено':item.submission?'Отправлено':item.dueDate&&new Date(item.dueDate)<new Date()?'Просрочено':'Назначено'}</p>}
   <button className="button primary" aria-label={'Открыть: '+item.title} onClick={()=>navigate('/assignments/'+item.id)}>Открыть задание</button>
  </GlassCard>)}</div>}
 </AnimatedPage>;
}
export function AssignedQuizPage({materialId}:{materialId:string}){
 const {navigate}=useApp(),[items,setItems]=useState<AssignmentStudentDTO[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{api<AssignmentStudentDTO[]>('assignments?kind=test').then(all=>{const items=all.filter(a=>a.materialId===materialId);if(items.length===1)navigate('/assignments/'+items[0].id);else setItems(items);}).catch(e=>setError(e.message));},[materialId]);
 return <AnimatedPage><header className="page-heading"><h1>Выберите назначение контрольной</h1></header>{error&&<p role="alert">{error}</p>}{items?.length===0&&<p>Нет доступного назначения. Попросите преподавателя выдать работу вашему классу.</p>}{items?.map(a=><GlassCard key={a.id}><h2>{a.title}</h2><p>{a.className}</p><button className="button primary" onClick={()=>navigate('/assignments/'+a.id)}>Открыть назначение {a.title}</button></GlassCard>)}</AnimatedPage>;
}
