import {setTimeout as delay} from 'node:timers/promises';
import {processGenerationBatch} from '../lib/generation/worker';
import {requireJobs} from '../lib/generation/service';
import {db} from '../lib/database';

requireJobs();
const controller=new AbortController();
for(const event of ['SIGINT','SIGTERM'] as const)process.once(event,()=>controller.abort());
try{
 do{
  try{await processGenerationBatch({signal:controller.signal});}
  catch{console.error('Generation worker: bounded batch failed; no provider response or secret logged.');}
  if(process.argv.includes('--once')||controller.signal.aborted)break;
  try{await delay(1000,undefined,{signal:controller.signal});}catch{break;}
 }while(!controller.signal.aborted);
}finally{await(await db()).$disconnect();}
