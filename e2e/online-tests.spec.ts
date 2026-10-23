import {test,expect} from '@playwright/test';
import {localActor,post} from './local-actors';
test('online test generation, review, two students, private progress and one attempt',async({browser,baseURL})=>{
 const origin=baseURL!,tag='online-'+Date.now(),teacher=await localActor(browser,origin,'teacher',tag+'-t'),one=await localActor(browser,origin,'student',tag+'-s1'),two=await localActor(browser,origin,'student',tag+'-s2');
 try{
  const group=await post(teacher,'classes',{name:'Приёмка '+tag,subject:'Математика'},origin);for(const s of [one,two]){const invite=await post(teacher,`classes/${group.id}/invite`,{},origin);await post(s,'classes/join',{code:invite.id},origin);}
  const t=await teacher.newPage();await t.goto('/tools/test');await t.getByLabel('Тема контрольной',{exact:true}).fill('Сложение '+tag);await t.getByRole('button',{name:'Создать черновик теста',exact:true}).click();await expect(t.getByRole('button',{name:'Открыть черновик',exact:true}).first()).toBeVisible();await t.getByRole('button',{name:'Открыть черновик',exact:true}).first().click();await expect(t.getByText('Вопрос 10 · 1 балл',{exact:true})).toBeVisible();
  expect(await t.getByRole('button',{name:/скачать|Word|PDF/i}).count()).toBe(0);await t.getByRole('button',{name:'Редактировать вопросы',exact:true}).click();await t.getByRole('textbox',{name:'Условие',exact:true}).first().fill('Вычислите 0+1.');await t.getByLabel('Вопросы, ключи и факты проверены. Любое изменение снимет подтверждение.',{exact:true}).check();await t.getByRole('button',{name:'Выдать группе',exact:true}).click();await expect(t.getByRole('combobox',{name:'Группа',exact:true})).toBeVisible();await t.getByLabel('Ключи и критерии проверены').check();await t.getByRole('button',{name:'Выдать задание',exact:true}).click();await expect(t).toHaveURL('/classes');
  const assignments=await(await one.request.get('/api/assignments?kind=test')).json(),a=assignments.find((v:{title:string})=>v.title.includes(tag));expect(a).toBeTruthy();
  for(const [index,s] of [one,two].entries()){
   const p=await s.newPage();await p.goto('/assignments/'+a.id);await p.getByRole('button',{name:'Начать контрольную',exact:true}).click();await expect(p.getByRole('radio')).toHaveCount(40);expect(await p.content()).not.toContain('correctOptionIds');
   await p.getByRole('button',{name:'Завершить контрольную',exact:true}).click();await expect(p.getByText('Нет ответов. Заполните хотя бы одно задание.',{exact:true})).toBeVisible();
   const names=await p.getByRole('radio').evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value));
   for(let i=0;i<10;i++)await p.getByRole('radio').nth(i*4+(index?1:0)).check();await expect(p.getByText('Черновик сохранён',{exact:true})).toBeVisible();const attemptURL=p.url();await p.reload();await expect(p.getByRole('radio')).toHaveCount(40);expect(await p.getByRole('radio').evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value))).toEqual(names);expect(await p.getByRole('radio').evaluateAll(nodes=>nodes.filter(n=>(n as HTMLInputElement).checked).length)).toBe(10);
   await p.getByRole('button',{name:'Завершить контрольную',exact:true}).click();await expect(p.getByText(/Результат:/)).toBeVisible();await p.reload();await expect(p.getByText(/Результат:/)).toBeVisible();expect(await p.content()).not.toContain('Правильный ответ');const attempts=await(await s.request.get(`/api/assignments/${a.id}/attempts`)).json();expect(attempts).toHaveLength(1);
   const progress=await(await s.request.get('/api/learning/progress')).json();expect(progress.assessments.latest).toHaveLength(1);expect(progress.assessments.latest[0].score).toBe(attempts[0].result.score);expect(JSON.stringify(progress.assessments)).not.toContain('correctOptionIds');expect((await s.request.get(`/api/assignments/${a.id}/export?format=pdf`)).status()).toBe(410);
   await p.screenshot({path:`output/playwright/online-result-${index}.png`,fullPage:true});expect(attemptURL).toContain('/attempts/');
  }
  const progress=await(await teacher.request.get('/api/learning/analytics')).json();expect(progress.assessments.latest).toHaveLength(2);expect(progress.assessments.history).toHaveLength(2);
 }finally{await teacher.close();await one.close();await two.close();}
});
test('a delayed initial jobs list cannot erase a newly created job or stop polling',async({browser,baseURL})=>{
 const c=await localActor(browser,baseURL!,'teacher','job-race-'+Date.now());try{
  const p=await c.newPage();let release!:()=>void,seen!:()=>void;const pending=new Promise<void>(r=>release=r),requested=new Promise<void>(r=>seen=r);let initial=true;
  await p.route('**/api/generation-jobs',async route=>{if(route.request().method()==='GET'&&initial){initial=false;seen();await pending;await route.fulfill({json:[]});}else await route.continue();});
  await p.goto('/tools/test');await requested;await p.getByLabel('Тема контрольной',{exact:true}).fill('Задержанная очередь');await p.getByRole('button',{name:'Создать черновик теста',exact:true}).click();await expect(p.getByRole('button',{name:'Отменить генерацию',exact:true})).toBeVisible();release();await expect(p.getByRole('button',{name:'Открыть черновик',exact:true})).toBeVisible();
 }finally{await c.close();}
});
