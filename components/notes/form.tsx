'use client';
import {useRef,useState} from 'react';
import {api} from '@/lib/client';
import {subjects,type MaterialRecord} from '@/lib/domain';
import {notesArticleInputSchema} from '@/lib/notes/article';
import {useApp} from '../app-context';import {AnimatedPage,GlassCard} from '../ui/edupilot';
import {useGenerationJob} from '../generation/use-generation-job';import {GenerationStatus} from '../generation/status';
export function NotesForm({onCreated}:{onCreated?:(id:string)=>void}){
 const {user,ai,navigate}=useApp(),generation=useGenerationJob(),form=useRef<HTMLFormElement>(null),[error,setError]=useState(''),[manualBusy,setManualBusy]=useState(false);
 const open=(id:string)=>onCreated?onCreated(id):navigate('/materials/'+id);
 const input=()=>notesArticleInputSchema.parse(Object.fromEntries(new FormData(form.current!)));
 const manual=async()=>{setError('');try{const params=input();setManualBusy(true);const m=await api<MaterialRecord>('materials','POST',{title:params.title,type:'notes',subject:params.subject,grade:params.grade,status:'draft',contentJson:{schemaVersion:3,kind:'notes-article',demo:false,bodyMarkdown:''},metadataJson:{generated:false}});open(m.id);}catch(e){setError((e as Error).message);}finally{setManualBusy(false);}};
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">ЛИЧНЫЙ КОНСПЕКТ</span><h1>Создать конспект</h1><p>Связное объяснение темы с примерами и итогом — ориентир 700–1000 слов, примерно 2–3 страницы A4. Не план урока и не анкета тезисов.</p></header>
  <GlassCard><form ref={form} onSubmit={async event=>{event.preventDefault();setError('');try{await generation.start('notes',input());}catch(e){setError((e as Error).message);}}}>
   <fieldset disabled={manualBusy}>
   <label className="field">Тема<input name="title" required minLength={2} maxLength={200} placeholder="Например, фотосинтез и его значение"/></label>
   <div className="form-grid"><label className="field">Предмет<select name="subject" defaultValue={user.settings?.preferredSubject??'Математика'}>{subjects.map(subject=><option key={subject}>{subject}</option>)}</select></label><label className="field">Класс<select name="grade" defaultValue={user.settings?.preferredGrade??7}>{Array.from({length:11},(_,i)=><option value={i+1} key={i}>{i+1} класс</option>)}</select></label></div>
   <label className="field">Уточнения, необязательно<textarea name="clarifications" maxLength={4000} rows={4} placeholder="Какие понятия объяснить подробнее, какие примеры привести"/></label>
   <p className="ai-disclaimer">ИИ может ошибаться: проверьте факты, язык и соответствие возрасту. Ссылка на учебник сама по себе не означает, что модель его прочитала.</p>
   {ai.mode==='mock'&&<p role="status">В демо-режиме создаётся пустой черновик для самостоятельного заполнения.</p>}
   {!ai.jobsAvailable&&<p role="status">Фоновая генерация не включена. Можно создать конспект вручную.</p>}
   {(error||generation.error)&&<p role="alert" className="form-error">{error||generation.error}</p>}
   <div className="button-row"><button className="button primary" disabled={generation.busy||manualBusy||!ai.jobsAvailable}>Создать конспект</button><button type="button" className="button secondary" disabled={manualBusy} onClick={()=>void manual()}>Заполнить вручную</button></div></fieldset>
  </form></GlassCard><GenerationStatus jobs={generation.jobs.filter(job=>job.kind==='notes')} onOpen={open} onCancel={generation.cancel}/>
 </AnimatedPage>;
}
