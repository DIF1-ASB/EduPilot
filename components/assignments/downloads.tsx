'use client';
import {useState} from 'react';
type Props={assignmentId:string;attemptId?:string;teacher?:boolean;kind?:'test'|'homework'};
/** Control tests are online-only; ordinary homework keeps its document exports. */
export function AssignmentDownloads(props:Props){return props.kind==='homework'?<HomeworkDownloads assignmentId={props.assignmentId}/>:null;}
function HomeworkDownloads({assignmentId}:{assignmentId:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const download=async(format:string)=>{setBusy(true);setError('');try{
  const response=await fetch(`/api/assignments/${assignmentId}/export?format=${format}`);if(!response.ok){const data=await response.json() as {error?:string};throw Error(data.error||'Не удалось скачать материал.');}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`EduPilot.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="section-space"><div className="button-row">{['docx','pdf'].map(format=><button className="button secondary" disabled={busy} key={format} onClick={()=>void download(format)}>Скачать {format.toUpperCase()}</button>)}</div>{error&&<p role="alert" className="form-error">{error}</p>}</div>;
}
