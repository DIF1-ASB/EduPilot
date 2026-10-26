import {test,expect,type Browser} from '@playwright/test';
import {localActor,post} from './local-actors';
import {quizFixture} from '../tests/helpers/online-content';

async function savedTest(browser:Browser,origin:string,tag:string){
 const context=await localActor(browser,origin,'teacher',tag+'-'+Date.now());
 await post(context,'classes',{name:'Сохранение '+tag,subject:'Математика'},origin);
 const material=await post(context,'materials',{title:'Проверенный тест',type:'test',subject:'Математика',grade:7,status:'ready',contentJson:quizFixture(),metadataJson:{onlineTestVersion:1,keysConfirmed:true}},origin);
 const page=await context.newPage();await page.goto('/materials/'+material.id);
 await expect(page.getByRole('button',{name:'Выдать группе',exact:true})).toBeEnabled();
 return {context,page,material};
}
const confirmation='Вопросы, ключи и факты проверены. Любое изменение снимет подтверждение.';

test('failed saving cannot open issuance of an older confirmed test',async({browser,baseURL})=>{
 const {context,page,material}=await savedTest(browser,baseURL!,'failed-save');
 try{
  await page.route('**/api/materials/'+material.id,async route=>route.request().method()==='PATCH'?route.fulfill({status:500,json:{error:'Синтетический сбой сохранения'}}):route.continue());
  await page.getByRole('button',{name:'Редактировать вопросы',exact:true}).click();
  await page.getByRole('textbox',{name:'Условие',exact:true}).first().fill('Новая, ещё не сохранённая редакция');
  await page.getByLabel(confirmation,{exact:true}).check();
  await page.getByRole('button',{name:'Выдать группе',exact:true}).click();
  await expect(page.getByText('Синтетический сбой сохранения',{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Группа',exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Условие',exact:true}).first()).toHaveValue('Новая, ещё не сохранённая редакция');
  const stored=await(await context.request.get('/api/materials/'+material.id)).json();
  expect(stored.contentJson.variants[0].questions[0].prompt).toBe('Сколько будет 0+1?');
 }finally{await context.close();}
});

test('editing and reconfirming cannot reopen an earlier issuance form without saving',async({browser,baseURL})=>{
 const {context,page,material}=await savedTest(browser,baseURL!,'reconfirm');
 try{
  await page.getByRole('button',{name:'Выдать группе',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Группа',exact:true})).toBeVisible();
  await page.route('**/api/materials/'+material.id,async route=>route.request().method()==='PATCH'?route.fulfill({status:500,json:{error:'Синтетический сбой сохранения'}}):route.continue());
  await page.getByRole('button',{name:'Редактировать вопросы',exact:true}).click();
  await page.getByRole('textbox',{name:'Условие',exact:true}).first().fill('Редакция после открытия выдачи');
  await expect(page.getByRole('combobox',{name:'Группа',exact:true})).toHaveCount(0);
  await page.getByLabel(confirmation,{exact:true}).check();
  await expect(page.getByRole('combobox',{name:'Группа',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

test('an unfinished autosave cannot authorize issuance of stale content',async({browser,baseURL})=>{
 const {context,page,material}=await savedTest(browser,baseURL!,'autosave');
 let release!:()=>void,seen!:()=>void;
 const pending=new Promise<void>(r=>release=r),requested=new Promise<void>(r=>seen=r);
 try{
  await page.route('**/api/materials/'+material.id,async route=>{
   if(route.request().method()==='PATCH'){seen();await pending;await route.continue();}else await route.continue();
  });
  await page.getByRole('button',{name:'Редактировать вопросы',exact:true}).click();
  await page.getByRole('textbox',{name:'Условие',exact:true}).first().fill('Сохранённая новая редакция');
  await page.getByLabel(confirmation,{exact:true}).check();await requested;
  await page.getByRole('button',{name:'Выдать группе',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Группа',exact:true})).toHaveCount(0);
  release();await expect(page.getByText('Все изменения сохранены',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Выдать группе',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Группа',exact:true})).toBeVisible();
 }finally{release();await context.close();}
});
