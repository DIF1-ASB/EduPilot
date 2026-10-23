'use client';
import {useState} from 'react';
import {subjects} from '@/lib/domain';
import {onlineTestInputSchema} from '@/lib/assessment/online';
import {useApp} from '../app-context';
import {useGenerationJob} from '../generation/use-generation-job';
import {GenerationStatus} from '../generation/status';
import {AnimatedPage,GlassCard} from '../ui/edupilot';
export function CreateOnlineTest({onCreated}:{onCreated:(id:string)=>void}){
 const {user,ai}=useApp(),generation=useGenerationJob();const [error,setError]=useState('');
 if(user.role!=='teacher')return <p>Доступно преподавателю</p>;
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">ОНЛАЙН-КОНТРОЛЬНАЯ</span><h1>Создать контрольную</h1><p>Укажите тему — ИИ подготовит черновик теста с выбором ответа. Вы проверяете содержание и выдаёте его группе.</p></header>
 <GlassCard><form onSubmit={async event=>{event.preventDefault();setError('');try{const form=new FormData(event.currentTarget),input=onlineTestInputSchema.parse(Object.fromEntries(form));await generation.start('test',input);}catch(e){setError((e as Error).message);}}}>
  <label className="field">Тема контрольной<input name="title" required minLength={2} maxLength={200} placeholder="Например, линейные уравнения"/></label>
  <div className="form-grid"><label className="field">Предмет<select name="subject" defaultValue={user.settings?.preferredSubject??'Математика'}>{subjects.map(subject=><option key={subject}>{subject}</option>)}</select></label><label className="field">Школьный класс<select name="grade" defaultValue={user.settings?.preferredGrade??7}>{Array.from({length:11},(_,i)=><option value={i+1} key={i}>{i+1} класс</option>)}</select></label></div>
  <label className="field">Уточнения, необязательно<textarea name="clarifications" maxLength={4000} rows={4} placeholder="Что включить или исключить, на чём сделать акцент"/></label>
  <details><summary>Дополнительные настройки</summary><div className="form-grid"><label className="field">Количество вопросов<input name="count" type="number" min={5} max={30} defaultValue={10} required/></label><label className="field">Сложность<select name="difficulty" defaultValue="Средний">{['Простой','Средний','Сложный'].map(value=><option key={value}>{value}</option>)}</select></label></div></details>
  <p>В каждом вопросе четыре варианта и один верный ответ. За верный выбор — 1 балл. Выдача группе возможна только после вашей проверки.</p>
  {ai.mode==='mock'&&<p className="ai-disclaimer">Демо-режим: будет создан незаполненный шаблон, а не содержательный ответ ИИ.</p>}
  {!ai.jobsAvailable&&<p role="status">Фоновая генерация пока не включена для этого сервера. Сохранённые материалы доступны.</p>}
  {(error||generation.error)&&<p role="alert" className="form-error">{error||generation.error}</p>}
  <button className="button primary" disabled={generation.busy||!ai.jobsAvailable}>Создать черновик теста</button>
 </form></GlassCard>
 <GenerationStatus jobs={generation.jobs.filter(job=>job.kind==='test')} onOpen={onCreated} onCancel={generation.cancel}/>
 </AnimatedPage>;
}
