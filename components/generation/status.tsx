'use client';
import type {GenerationJobDTO} from '@/lib/generation/contracts';
import {activeGeneration} from './use-generation-job';
const labels={queued:'В очереди',running:'ИИ создаёт материал',validating:'Проверка структуры',completed:'Черновик сохранён',failed:'Не удалось создать',cancelled:'Отменено'};
export function GenerationStatus({jobs,onOpen,onCancel}:{jobs:GenerationJobDTO[];onOpen:(id:string)=>void;onCancel:(id:string)=>Promise<void>}){
 if(!jobs.length)return null;
 return <section className="section-space generation-status" aria-label="Сохранённые генерации"><h2>Последние генерации</h2><p>Можно уйти со страницы: готовый черновик останется здесь и в материалах.</p>{jobs.slice(0,5).map(job=><article className="glass-card section-space" key={job.id}>
  <h3>{job.kind==='test'?'Контрольная':'Конспект'}</h3><p role="status">{labels[job.state]}</p><small>{new Date(job.createdAt).toLocaleString('ru-RU')}</small>
  {job.error&&<p className="form-error">{job.error.message}</p>}
  {job.state==='completed'&&job.materialId&&<button type="button" className="button primary" onClick={()=>onOpen(job.materialId!)}>Открыть черновик</button>}
  {activeGeneration(job)&&<button type="button" className="button secondary" onClick={()=>void onCancel(job.id)}>Отменить генерацию</button>}
 </article>)}</section>;
}
