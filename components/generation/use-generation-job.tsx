'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '@/lib/client';
import type {CreateGeneration,GenerationJobDTO} from '@/lib/generation/contracts';
export const activeGeneration=(job:GenerationJobDTO)=>['queued','running','validating'].includes(job.state);
export function useGenerationJob(){
 const [jobs,setJobs]=useState<GenerationJobDTO[]>([]),[sending,setSending]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),refreshing=useRef(false),locked=useRef(false),pending=useRef<{hash:string;id:string}|null>(null);
 const refresh=useCallback(async()=>{
  if(refreshing.current)return;refreshing.current=true;
  try{const list=await api<GenerationJobDTO[]>('generation-jobs');if(alive.current){setJobs(list);setError('');}}
  catch(e){if(alive.current)setError((e as Error).message);}finally{refreshing.current=false;}
 },[]);
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[refresh]);
 const active=jobs.some(activeGeneration);
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>void refresh(),2000);return()=>clearInterval(timer);},[active,refresh]);
 const start=async(kind:CreateGeneration['kind'],input:CreateGeneration['input'])=>{
  if(locked.current)return;locked.current=true;setSending(true);setError('');
  const hash=JSON.stringify({kind,input});if(pending.current?.hash!==hash)pending.current={hash,id:crypto.randomUUID()};
  try{const job=await api<GenerationJobDTO>('generation-jobs','POST',{kind,input,requestId:pending.current.id});pending.current=null;if(alive.current)setJobs(list=>[job,...list.filter(j=>j.id!==job.id)]);return job;}
  catch(e){if(alive.current)setError((e as Error).message);return undefined;}finally{locked.current=false;if(alive.current)setSending(false);}
 };
 const cancel=async(id:string)=>{try{const job=await api<GenerationJobDTO>('generation-jobs/'+id+'/cancel','POST',{});if(alive.current)setJobs(list=>list.map(j=>j.id===id?job:j));}catch(e){if(alive.current)setError((e as Error).message);}};
 return {jobs,start,cancel,refresh,busy:sending||active,error};
}
