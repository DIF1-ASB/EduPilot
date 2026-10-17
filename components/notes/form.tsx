'use client';
import {useEffect,useRef,useState} from 'react';import {toast} from 'sonner';
import {api} from '@/lib/client';import {subjects,type MaterialRecord} from '@/lib/domain';import {createNotesDraft,notesInputSchema,type NotesInput,type NotesDocument} from '@/lib/notes/schema';
import {useApp} from '../app-context';import {AnimatedPage,GlassCard} from '../ui/edupilot';import {NotesPreview} from './preview';
export function NotesForm({onCreated}:{onCreated?:(id:string)=>void}){
 const {user,navigate}=useApp(),[input,setInput]=useState<NotesInput>({title:'',subject:user.settings?.preferredSubject??'Математика',grade:user.settings?.preferredGrade??7,volume:'normal',sourceText:'',focus:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState<{input:NotesInput,document:NotesDocument}|null>(null);
 const [notice,setNotice]=useState('');
 const revision=useRef(0),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;revision.current++;};},[]);
 const change=<K extends keyof NotesInput>(field:K,value:NotesInput[K])=>{revision.current++;setInput(previous=>({...previous,[field]:value}));setError('');};
 const parsed=()=>{const value=notesInputSchema.safeParse(input);if(!value.success){setError(value.error.issues.map(i=>i.message).join('; '));return null;}return value.data;};
 const persist=(input:NotesInput,document:NotesDocument)=>api<MaterialRecord>('materials','POST',{title:input.title,type:'notes',subject:input.subject,grade:input.grade,contentJson:document,metadataJson:{notesInput:input},status:document.demo?'draft':document.summary?'ready':'draft'});
 const open=(id:string)=>onCreated?onCreated(id):navigate('/materials/'+id);
 const complete=(id:string,requested:number)=>{if(!alive.current)return;if(requested===revision.current)open(id);else setNotice('Конспект по прежним параметрам сохранён отдельно в библиотеке. Новый ввод не изменён.');};
 const manual=async()=>{const data=parsed();if(!data)return;const requested=revision.current;setBusy(true);setError('');setNotice('');try{const result=await persist(data,createNotesDraft());complete(result.id,requested);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}};
 const generate=async()=>{
  const data=parsed();if(!data)return;const requested=revision.current;setBusy(true);setError('');setNotice('');
  try{
   const result=await api<{content:NotesDocument}>('generate','POST',{type:'notes',...data});
   if(!alive.current)return;
   if(requested!==revision.current){setStale({input:data,document:result.content});return;}
   const material=await persist(data,result.content);complete(material.id,requested);
  }catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
 };
 return <AnimatedPage><header className="page-heading"><span className="eyebrow">ЛИЧНЫЕ ЗНАНИЯ</span><h1>Создать конспект</h1><p>Соберите суть, понятия и примеры. Это личный конспект, а не план занятия.</p></header>
  <GlassCard><form onSubmit={e=>{e.preventDefault();void generate();}}>
   <label className="field">Тема<input name="title" value={input.title} minLength={2} maxLength={200} required onChange={e=>change('title',e.target.value)}/></label>
   <div className="form-grid"><label className="field">Предмет<select value={input.subject} onChange={e=>change('subject',e.target.value)}>{[...new Set([...subjects,input.subject])].map(s=><option key={s}>{s}</option>)}</select></label>
    <label className="field">Класс<select value={input.grade} onChange={e=>change('grade',Number(e.target.value))}>{Array.from({length:11},(_,i)=><option key={i} value={i+1}>{i+1} класс</option>)}</select></label></div>
   <label className="field">Объём<select value={input.volume} onChange={e=>change('volume',e.target.value as NotesInput['volume'])}><option value="short">Краткий</option><option value="normal">Обычный</option><option value="detailed">Подробный</option></select></label>
   <label className="field">Исходный текст<textarea name="sourceText" value={input.sourceText} rows={8} maxLength={20000} onChange={e=>change('sourceText',e.target.value)}/><small>Необязательно, до 20000 символов. Передаётся только вставленный текст; файл по ссылке не читается.</small></label>
   <label className="field">На чём сделать акцент<textarea name="focus" value={input.focus} rows={3} maxLength={2000} onChange={e=>change('focus',e.target.value)}/></label>
   {error&&<p role="alert" className="form-error">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <div className="button-row"><button className="button primary" disabled={busy}>Создать конспект</button><button type="button" className="button secondary" disabled={busy} onClick={()=>void manual()}>Заполнить вручную</button></div>
   {busy&&<p role="status">Подготовка конспекта… Параметры можно изменить; запоздалый ответ не заменит новый ввод.</p>}
  </form></GlassCard>
  {stale&&<GlassCard className="section-space"><p role="status">Получен ответ для прежних параметров. Новый ввод не изменён и материал не сохранён автоматически.</p><details><summary>Посмотреть конспект по теме «{stale.input.title}»</summary><NotesPreview document={stale.document}/></details><div className="button-row"><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await persist(stale.input,stale.document);setStale(null);toast.success('Отдельный конспект добавлен в библиотеку. Текущая форма сохранена.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Сохранить прежний ответ отдельно</button><button className="button secondary" onClick={()=>setStale(null)}>Отбросить прежний ответ</button></div></GlassCard>}
 </AnimatedPage>;
}
