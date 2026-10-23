import {test,expect} from '@playwright/test';
import {localActor,post} from './local-actors';
import {notesFixture} from './notes-fixture';
for(const [role,width] of [['student',1440],['student',390],['teacher',1440]] as const)test('личный конспект '+role+' '+width,async({browser,baseURL})=>{
 const c=await localActor(browser,baseURL!,role,'notes-'+role+'-'+width+'-'+Date.now());try{
  const p=await c.newPage();await p.setViewportSize({width,height:1000});await p.goto('/notes/new');await p.getByLabel('Тема',{exact:true}).fill('Обыкновенные дроби');await p.getByRole('button',{name:'Заполнить вручную',exact:true}).click();await expect(p).toHaveURL(/\/materials\//);await p.getByRole('button',{name:'Редактировать текст',exact:true}).click();await p.getByRole('textbox',{name:/^Текст конспекта/}).fill('## Дроби\n\nДробь обозначает часть целого.');await p.getByRole('button',{name:'Сохранить конспект',exact:true}).click();await expect(p.getByText('Конспект сохранён',{exact:true})).toBeVisible();await p.reload();await expect(p.getByText('Дробь обозначает часть целого.',{exact:true})).toBeVisible();
  for(const format of ['DOCX','PDF']){const pending=p.waitForEvent('download');await p.getByRole('button',{name:'Скачать '+format,exact:true}).click();expect(await(await pending).failure()).toBeNull();}
  const legacy=[{demo:false,totalDuration:45,sections:[{id:'legacy',title:'Старый раздел',body:'Исторический конспект без потерь',duration:15}]},{schemaVersion:2,kind:'notes',demo:false,summary:'Суть прежнего формата',concepts:[],theses:['Прежний тезис'],examples:[],conclusion:'Прежний итог',selfCheck:[]}];
  for(const content of legacy){
   if(!('schemaVersion'in content)&&role!=='student')continue;
   let m:{id:string};if('schemaVersion'in content)m=await post(c,'materials',{type:'notes',title:'Исторический конспект',subject:'Математика',grade:7,contentJson:content},baseURL!);else{const session=await(await c.request.get('/api/session')).json();m={id:crypto.randomUUID()};notesFixture({action:'insert',ownerId:session.user.id,id:m.id,contentJson:JSON.stringify(content)});}await p.goto('/materials/'+m.id);
   const field='schemaVersion'in content?p.getByLabel('Суть темы',{exact:true}):p.getByLabel('Раздел 1',{exact:true});await expect(field).toBeVisible();await field.fill('Старый формат остаётся редактируемым');await p.getByRole('button',{name:'Сохранить конспект',exact:true}).click();await expect(p.getByText('Конспект сохранён',{exact:true})).toBeVisible();
   const updated=await(await c.request.get('/api/materials/'+m.id)).json();expect(updated.contentJson.kind).toBe('schemaVersion'in content?'notes':undefined);for(const format of ['docx','pdf'])expect((await c.request.get('/api/materials/'+m.id+'/export?format='+format)).status()).toBe(200);
  }
 }finally{await c.close();}
});
