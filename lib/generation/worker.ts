import {db} from '../database';
import {getProvider,InvalidGeneratedContent,type AIProvider} from '../ai';
import {runAssessmentBatch,epochSql,sqlDate} from '../assessment/store';
import {validateOnlineTest} from '../assessment/online';
import {validateNotesArticle} from '../notes/article';
import {createGenerationSchema} from './contracts';
import {requireJobs} from './service';

const active=['running','validating'];
type Clock=()=>Date;
export async function recoverExpiredJobs(clock:Clock=()=>new Date()):Promise<number>{
 requireJobs();const now=clock(),client=await db();
 await client.generationJob.updateMany({where:{state:'cancelled',leaseUntil:{lte:now}},data:{leaseToken:null,leaseUntil:null}});
 const result=await client.generationJob.updateMany({where:{state:{in:active},OR:[{leaseUntil:{lte:now}},{deadlineAt:{lte:now}}]},data:{state:'failed',errorCode:'interrupted',leaseToken:null,leaseUntil:null}});
 return result.count;
}
async function claim(clock:Clock){
 const now=clock(),token=crypto.randomUUID();
 const result=await runAssessmentBatch([{sql:`UPDATE GenerationJob SET state='running',leaseToken=?,leaseUntil=?,deadlineAt=?,updatedAt=?
  WHERE id=(SELECT id FROM GenerationJob WHERE state='queued' ORDER BY createdAt,id LIMIT 1)
  AND (SELECT COUNT(*) FROM GenerationJob WHERE leaseToken IS NOT NULL AND state IN ('running','validating','cancelled'))<2 RETURNING id`,params:[token,sqlDate(new Date(now.getTime()+180000)),sqlDate(new Date(now.getTime()+300000)),sqlDate(now)]}]);
 const id=result[0].rows[0]?.id as string|undefined;
 if(!id)return null;return(await db()).generationJob.findFirst({where:{id,leaseToken:token}});
}
async function execute(job:NonNullable<Awaited<ReturnType<typeof claim>>>,provider:AIProvider,clock:Clock,parentSignal?:AbortSignal){
 const client=await db(),controller=new AbortController(),deadline=job.deadlineAt!.getTime();
 const guard={id:job.id,leaseToken:job.leaseToken,state:{in:active}};
 let heartbeatBusy=false;
 const heartbeat=setInterval(async()=>{
  if(heartbeatBusy)return;heartbeatBusy=true;
  try{
   const now=clock();if(now.getTime()>=deadline){controller.abort();return;}
   const changed=await client.generationJob.updateMany({where:guard,data:{leaseUntil:new Date(now.getTime()+180000)}});if(!changed.count)controller.abort();
  }catch{controller.abort();}finally{heartbeatBusy=false;}
 },30000);
 heartbeat.unref?.();
 try{
  const input=createGenerationSchema.parse({requestId:job.requestId,kind:job.kind,input:job.inputJson});
  const owner=await client.user.findUnique({where:{id:job.ownerId},select:{role:true}});
  if(!owner||(input.kind==='test'&&owner.role!=='teacher')){
   await client.generationJob.updateMany({where:guard,data:{state:'failed',errorCode:'permission_changed',leaseToken:null,leaseUntil:null}});return;
  }
  let invalidReply:string|undefined;
  for(let attempt=0;attempt<2;attempt++){
   const remaining=deadline-clock().getTime();if(remaining<=0)throw Error('Deadline');
   const signal=AbortSignal.any([controller.signal,...(parentSignal?[parentSignal]:[]),AbortSignal.timeout(remaining)]);
   const admitted=await client.generationJob.updateMany({where:{...guard,attemptCount:{lt:2}},data:{state:'running',attemptCount:{increment:1}}});if(!admitted.count)return;
   try{
    const options={signal,timeoutMs:Math.min(120000,remaining),maxTokens:6000};
    let content=input.kind==='test'?await provider.generateOnlineTest(input.input,options,invalidReply):await provider.generateArticle(input.input,options,invalidReply);
    // Revalidate even injected providers; a mock is an explicitly unfinished draft.
    content=input.kind==='test'?validateOnlineTest(content,{count:input.input.count,publishable:!provider.demo}):validateNotesArticle(content,{ready:!provider.demo,subject:input.input.subject});
    if(signal.aborted)throw Error('Aborted');
    const validating=await client.generationJob.updateMany({where:guard,data:{state:'validating'}});if(!validating.count)return;
    const materialId=crypto.randomUUID(),now=clock();
    const metadata={...(input.kind==='test'?{onlineTestVersion:1}:{}),generationJobId:job.id,generated:true,needsTeacherReview:true};
    await runAssessmentBatch([
     {sql:`INSERT INTO Material(id,userId,title,type,subject,grade,status,version,contentJson,metadataJson,createdAt,updatedAt)
      SELECT ?,j.ownerId,?,?,?,?, 'draft',1,?,?,?,? FROM GenerationJob j JOIN User u ON u.id=j.ownerId
      WHERE j.id=? AND j.leaseToken=? AND j.state='validating' AND ${epochSql('j.deadlineAt')}>?
      AND (j.kind='notes' OR u.role='teacher')`,params:[materialId,input.input.title,input.kind,input.input.subject,input.input.grade,JSON.stringify(content),JSON.stringify(metadata),sqlDate(now),sqlDate(now),job.id,job.leaseToken,now.getTime()]},
     {sql:`UPDATE GenerationJob SET state='completed',resultMaterialId=?,errorCode=NULL,leaseToken=NULL,leaseUntil=NULL,updatedAt=?
      WHERE id=? AND leaseToken=? AND state='validating' AND EXISTS(SELECT 1 FROM Material WHERE id=?)`,params:[materialId,sqlDate(now),job.id,job.leaseToken,materialId]},
    ]);
    // If deadline/permissions changed before finish, do not leave a validating lease.
    await client.generationJob.updateMany({where:guard,data:{state:'failed',errorCode:'interrupted',leaseToken:null,leaseUntil:null}});
    return;
   }catch(error){
    if(error instanceof InvalidGeneratedContent&&attempt===0){
     invalidReply=JSON.stringify({previousReply:error.rawReply,validationError:error.problem});continue;
    }
    await client.generationJob.updateMany({where:guard,data:{state:'failed',errorCode:error instanceof InvalidGeneratedContent?'invalid_content':'provider_unavailable',leaseToken:null,leaseUntil:null}});return;
   }
  }
 }catch{
  await client.generationJob.updateMany({where:guard,data:{state:'failed',errorCode:'interrupted',leaseToken:null,leaseUntil:null}});
 }finally{
  clearInterval(heartbeat);
  await client.generationJob.updateMany({where:{id:job.id,leaseToken:job.leaseToken,state:'cancelled'},data:{leaseToken:null,leaseUntil:null}});
 }
}
export async function processGenerationBatch({clock=()=>new Date(),provider,concurrency=2,signal}:{clock?:Clock;provider?:AIProvider;concurrency?:number;signal?:AbortSignal}={}):Promise<number>{
 requireJobs();await recoverExpiredJobs(clock);if(signal?.aborted)return 0;
 const count=Math.max(1,Math.min(2,Math.floor(concurrency)||1)),jobs=[];
 for(let i=0;i<count;i++){if(signal?.aborted)break;const job=await claim(clock);if(!job)break;jobs.push(job);}
 if(!jobs.length)return 0;
 await Promise.all(jobs.map(job=>execute(job,provider??getProvider(),clock,signal)));return jobs.length;
}
