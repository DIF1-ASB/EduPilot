import type {Actor} from '../materials/policy';
import {readJson,fail} from '../security';
import {createGeneration,getGeneration,listGenerations,cancelGeneration} from './service';
export async function handleGenerationRequest(req:Request,actor:Actor):Promise<Response|null>{
 const [area,id,action,...extra]=new URL(req.url).pathname.split('/').slice(2).filter(Boolean);if(area!=='generation-jobs')return null;
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(!extra.length){
  if(!id&&req.method==='POST')return json(await createGeneration(actor,await readJson(req)),201);
  if(!id&&req.method==='GET')return json(await listGenerations(actor));
  if(id&&!action&&req.method==='GET')return json(await getGeneration(actor,id));
  if(id&&action==='cancel'&&req.method==='POST')return json(await cancelGeneration(actor,id));
 }
 fail(404,'Маршрут генерации не найден.');
}
