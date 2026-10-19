'use client';
import {AssignmentDownloads} from './downloads';
import {useEffect,useState} from 'react';import {toast} from 'sonner';import {api} from '@/lib/client';
import type {MaterialRecord} from '@/lib/domain';import type {TeacherAssignmentDTO} from '@/lib/assignments/contracts';
import {GlassCard,AnimatedPage} from '../ui/edupilot';import {statusLabel,dateLabel} from './list';
const localInput=(value:string|null)=>{if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const dateValue=(value:FormDataEntryValue|null)=>value?new Date(String(value)).toISOString():null;
export function AssignmentCreateForm({classId,materials,onCreated}:{classId:string,materials:MaterialRecord[],onCreated:()=>void}){
 const [kind,setKind]=useState<'homework'|'test'>('homework'),[materialId,setMaterialId]=useState(''),[confirmed,setConfirmed]=useState(false),[policy,setPolicy]=useState('manual'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const available=materials.filter(m=>kind==='test'?['test','worksheet'].includes(m.type):m.type!=='test'),selected=available.find(m=>m.id===materialId)??available[0];
 return <form onSubmit={async e=>{e.preventDefault();if(!selected)return;const form=e.currentTarget,data=new FormData(form);setBusy(true);setError('');try{
  await api(`classes/${classId}/assignment`,'POST',{kind,materialId:selected.id,materialVersion:selected.version,keysConfirmed:confirmed,title:data.get('title'),dueDate:dateValue(data.get('dueDate')),
   ...(kind==='test'?{maxAttempts:Number(data.get('maxAttempts')),durationMinutes:Number(data.get('durationMinutes')),answerPolicy:policy}:{})});
  form.reset();setConfirmed(false);toast.success('Задание выдано');onCreated();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
  <label className="field">Название задания<input name="title" required maxLength={200}/></label>
  <label className="field">Вид задания<select value={kind} onChange={e=>{setKind(e.target.value as 'homework'|'test');setConfirmed(false);setMaterialId('');}}><option value="homework">Домашнее задание</option><option value="test">Контрольная</option></select></label>
  <label className="field">Материал<select value={selected?.id??''} onChange={e=>{setMaterialId(e.target.value);setConfirmed(false);}} required>{!available.length&&<option value="">Нет подходящих материалов</option>}{available.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
  <label className="field">Срок сдачи<input name="dueDate" type="datetime-local" required={kind==='test'&&policy==='after_due'}/><small>Местное время вашего устройства</small></label>
  {kind==='test'&&<><div className="form-grid"><label className="field">Лимит попыток<input name="maxAttempts" type="number" min={1} max={10} defaultValue={1} required/></label><label className="field">Длительность, минут<input name="durationMinutes" type="number" min={5} max={240} defaultValue={45} required/></label></div>
   <label className="field">Показывать решения<select value={policy} onChange={e=>setPolicy(e.target.value)}><option value="manual">Только вручную преподавателем</option><option value="after_due">После дедлайна</option><option value="after_last">После последней попытки ученика</option></select></label>
   <label className="check-field"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/>Ключи и критерии проверены</label>
   <p>Будет сохранён снимок этой редакции. Проверьте факты, баллы и все варианты. Старый материал сначала разметьте в редакторе.</p>
  </>}
  {error&&<p role="alert" className="form-error">{error}</p>}<button className="button primary" disabled={busy||!selected}>Выдать задание</button>
 </form>;
}
export function AssignmentTeacherPanel({assignmentId}:{assignmentId:string}){
 const [item,setItem]=useState<TeacherAssignmentDTO|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState<any>(null);
 const load=()=>api<TeacherAssignmentDTO>('assignments/'+assignmentId).then(setItem);
 useEffect(()=>{load().catch(e=>setError(e.message));},[assignmentId]);
 const operation=async(fn:()=>Promise<unknown>,message:string)=>{setBusy(true);setError('');try{await fn();await load();toast.success(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(!item)return <p role={error?'alert':'status'}>{error||'Загрузка назначения…'}</p>;
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">РАБОТА ПРЕПОДАВАТЕЛЯ</span><h1>{item.title}</h1><p>{item.className} · Срок: {dateLabel(item.policy.dueDate)}</p></header>{error&&<p role="alert" className="form-error">{error}</p>}
  <a className="button secondary" href={'/materials/'+item.materialId}>Исходный материал (назначение хранит прежний снимок)</a>
  {item.kind==='test'&&<AssignmentDownloads assignmentId={assignmentId} teacher/>}
  {item.kind==='test'&&<GlassCard><h2>Настройки контрольной</h2><form key={item.version} onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void operation(()=>api('assignments/'+assignmentId,'PATCH',{version:item.version,title:data.get('title'),maxAttempts:Number(data.get('maxAttempts')),durationMinutes:Number(data.get('durationMinutes')),answerPolicy:data.get('answerPolicy'),dueDate:dateValue(data.get('dueDate')),closed:data.get('closed')==='on'}),'Настройки сохранены');}}>
   <label className="field">Название назначения<input name="title" defaultValue={item.title} required maxLength={200}/></label>
   <div className="form-grid"><label className="field">Лимит попыток<input name="maxAttempts" type="number" min={1} max={item.disclosureLockedAt||item.closedAt?item.policy.maxAttempts:10} defaultValue={item.policy.maxAttempts} required/></label><label className="field">Длительность, минут<input name="durationMinutes" type="number" min={5} max={240} defaultValue={item.policy.durationMinutes} required/></label></div>
   <label className="field">Срок сдачи<input name="dueDate" type="datetime-local" defaultValue={localInput(item.policy.dueDate)}/><small>Местное время устройства. Начатые попытки сохраняют прежний таймер.</small></label>
   <label className="field">Показывать решения<select name="answerPolicy" defaultValue={item.policy.answerPolicy}><option value="manual">Только вручную</option><option value="after_due">После дедлайна</option><option value="after_last">После последней попытки</option></select></label>
   <label className="check-field"><input type="checkbox" name="closed" defaultChecked={!!item.closedAt} disabled={!!item.solutionsReleasedAt}/>Закрыть новые старты</label>
   {item.solutionsReleasedAt&&<input type="hidden" name="closed" value="on"/>}
   <p>Уже показанные решения невозможно сделать неизвестными. После раскрытия лимит не увеличивается; для новой работы создайте новое назначение.</p><button className="button primary" disabled={busy}>Сохранить настройки</button>
  </form><button className="button secondary section-space" disabled={busy||!!item.solutionsReleasedAt} onClick={()=>{if(confirm('Открыть решения всем завершившим работу? Это необратимо для уже увиденных ответов и закроет новые старты. При активной попытке публикация будет отклонена.'))void operation(()=>api(`assignments/${assignmentId}/release`,'POST',{version:item.version}),'Решения опубликованы');}}>Открыть решения</button></GlassCard>}
  {item.kind==='homework'?<><h2 className="section-space">Отправленные работы</h2>{!item.submissions.length&&<p>Отправок пока нет.</p>}{item.submissions.map(submission=><GlassCard key={submission.id} className="section-space"><h3>Работа ученика {submission.studentName}</h3><p style={{whiteSpace:'pre-wrap'}}>{submission.text}</p>{submission.grade&&<p>Оценка: {submission.grade.score} / {submission.grade.maxScore}</p>}
   <form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void operation(()=>api(`classes/${item.classId}/grade`,'POST',{submissionId:submission.id,score:Number(form.get('score')),maxScore:Number(form.get('maxScore')),teacherComment:form.get('comment')}),'Оценка сохранена');}}>
    <div className="form-grid"><label className="field">Балл<input name="score" type="number" min={0} max={1000} step="any" defaultValue={submission.grade?.score??0} required/></label><label className="field">Максимальный балл<input name="maxScore" type="number" min={1} max={1000} step="any" defaultValue={submission.grade?.maxScore??10} required/></label></div><label className="field">Комментарий преподавателя<textarea name="comment" maxLength={5000} defaultValue={submission.grade?.teacherComment??''}/></label><button className="button primary" disabled={busy}>Подтвердить оценку</button>
   </form></GlassCard>)}</>:<><h2 className="section-space">Попытки учеников</h2>{!item.attempts.length&&<p>Попыток пока нет.</p>}{item.attempts.map(a=><GlassCard key={a.id}><p>{a.studentName} · Попытка {a.number} · {statusLabel(a.status)}</p><button className="button secondary" onClick={()=>void api(`assignments/${assignmentId}/attempts/${a.id}`).then(setAttempt).catch(e=>setError(e.message))}>Открыть работу {a.studentName}, попытка {a.number}</button></GlassCard>)}</>}
  {item.kind==='test'&&<GlassCard className="section-space"><h2>Лучшие окончательные результаты</h2>{[...new Set(item.attempts.map(a=>a.studentId))].map(id=>{const attempts=item.attempts.filter(a=>a.studentId===id),graded=attempts.filter(a=>a.status==='graded'&&a.score!==null);const best=graded.sort((a,b)=>b.score!-a.score!)[0];return <p key={id}>{attempts[0].studentName}: {best?`${best.score} / ${best.maxScore}`:'ещё нет окончательной оценки'}{attempts.some(a=>a.status==='pending_review')?' · есть ответы, ожидающие проверки':''}</p>;})}</GlassCard>}
  {attempt&&<GlassCard className="section-space"><h2>Ответы: попытка {attempt.number}</h2><p>{statusLabel(attempt.status)}</p>{attempt.questions.map((q:any)=><section key={q.id}><h3>{q.prompt}</h3><p style={{whiteSpace:'pre-wrap'}}>Ответ ученика: {Array.isArray(attempt.answers[q.id])?attempt.answers[q.id].map((id:string)=>q.options?.find((o:any)=>o.id===id)?.label??id).join('; '):q.options?.find((o:any)=>o.id===attempt.answers[q.id])?.label??attempt.answers[q.id]??'—'}</p>{q.kind==='open'&&<p>Критерии: {q.criteria}</p>}</section>)}
   {attempt.status==='pending_review'&&<form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void operation(async()=>{const result=await api(`assignments/${assignmentId}/attempts/${attempt.id}/review`,'POST',{version:attempt.version,marks:attempt.result.pendingQuestionIds.map((id:string)=>({questionId:id,points:Number(form.get('points-'+id)),comment:String(form.get('comment-'+id)??'')}))});setAttempt(result);},'Ручная проверка подтверждена');}}>
    {attempt.result.pendingQuestionIds.map((id:string)=>{const q=attempt.questions.find((q:any)=>q.id===id);return <fieldset key={id}><legend>{q.prompt}</legend><label className="field">Балл за развёрнутый ответ<input name={'points-'+id} type="number" min={0} max={q.points} step="any" required/></label><label className="field">Комментарий ученику<textarea name={'comment-'+id} maxLength={5000}/></label></fieldset>;})}<p>Комментарии увидит ученик после подтверждения. Не включайте в них ещё закрытые решения.</p><button className="button primary" disabled={busy}>Подтвердить ручную проверку</button>
   </form>}
   {attempt.status==='graded'&&<p>Итог: {attempt.result?.score} / {attempt.result?.maxScore}</p>}
  </GlassCard>}
 </AnimatedPage>;
}
