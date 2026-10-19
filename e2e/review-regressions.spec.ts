import {test,expect} from '@playwright/test';
for(const scenario of ['alternatives','order','instructions'])test('review regression '+scenario,async({browser,baseURL})=>{
 const contexts=[];const origin=baseURL!,tag='review-'+Date.now()+'-'+scenario;
 try{
  for(const role of ['teacher','student']){const c=await browser.newContext({baseURL});contexts.push(c);expect((await c.request.post('/api/auth/register',{headers:{Origin:origin},data:{firstName:role,lastName:'Регрессия',role,email:tag+'-'+role+'@example.invalid',password:'ExamplePass789!',confirmPassword:'ExamplePass789!'}})).status()).toBe(201);}
  const [teacher,student]=contexts;const post=async(c:any,path:string,data:any)=>{const r=await c.request.post('/api/'+path,{headers:{Origin:origin},data});expect(r.status(),await r.text()).toBeLessThan(300);return r.json();};
  const content={schemaVersion:2,kind:'assessment',demo:false,instructions:'Ответ запишите в сантиметрах, без обозначения единиц.',variants:[{id:'v',label:'Геометрия A',questions:[{id:'q',kind:'short',prompt:'Длина отрезка',points:1,answerLines:2,acceptedAnswers:['4']},{id:'q2',kind:'short',prompt:'Второе задание',points:1,answerLines:2,acceptedAnswers:['2']}]}]};
  const m=await post(teacher,'materials',{title:tag,type:'test',subject:'Математика',grade:7,contentJson:content});
  const t=await teacher.newPage();await t.goto('/materials/'+m.id);
  if(scenario==='alternatives'){
   const field=t.getByRole('textbox',{name:'Правильные ответы — каждый с новой строки',exact:true}).first();await field.focus();await field.press('End');await field.press('Enter');await field.pressSequentially('четыре');await expect(field).toHaveValue('4\nчетыре');await t.getByRole('button',{name:'Сохранить',exact:true}).click();await t.reload();await expect(t.getByRole('textbox',{name:'Правильные ответы — каждый с новой строки',exact:true}).first()).toHaveValue('4\nчетыре');return;
  }
  if(scenario==='order'){
   await t.getByRole('button',{name:'Переместить задание 2 вверх',exact:true}).click();await expect(t.getByRole('textbox',{name:'Условие',exact:true}).first()).toHaveValue('Второе задание');await t.getByRole('button',{name:'Сохранить',exact:true}).click();await t.reload();await expect(t.getByRole('textbox',{name:'Условие',exact:true}).first()).toHaveValue('Второе задание');const saved=await(await teacher.request.get('/api/materials/'+m.id)).json();expect(saved.contentJson.variants[0].questions.map((q:any)=>q.id)).toEqual(['q2','q']);
   await t.getByRole('button',{name:'Бланк ученика',exact:true}).click();await expect(t.locator('.answer-sheet-preview h2').first()).toContainText('Задание 1');
  }
  const current=await(await teacher.request.get('/api/materials/'+m.id)).json(),group=await post(teacher,'classes',{name:tag,subject:'Математика'}),invite=await post(teacher,`classes/${group.id}/invite`,{});await post(student,'classes/join',{code:invite.id});const a=await post(teacher,`classes/${group.id}/assignment`,{materialId:m.id,materialVersion:current.version,keysConfirmed:true,title:tag,kind:'test'}),attempt=await post(student,`assignments/${a.id}/start`,{requestId:crypto.randomUUID()});
  const s=await student.newPage();await s.goto(`/assignments/${a.id}/attempts/${attempt.id}`);if(scenario==='order')expect(attempt.questions.map((q:any)=>q.id)).toEqual(['q2','q']);
  await expect(s.getByText(content.instructions,{exact:true})).toBeVisible();await expect(s.getByText('Геометрия A',{exact:true})).toBeVisible();await s.reload();await expect(s.getByText(content.instructions,{exact:true})).toBeVisible();
 }finally{for(const c of contexts)await c.close();}
});
