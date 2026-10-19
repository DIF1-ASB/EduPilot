import type {AnswerSheet} from '../../lib/assessment/sheet';
const block=(id:string,prompt:string,answerLines=2)=>({id,title:'Задание '+id,prompt,options:[],points:2,answerLines});
const base={title:'Контрольная по дробям',subject:'Математика',grade:7,instructions:'Запишите решение и ответ. Используйте 1/2 − 0,5.',variantLabel:'Вариант 1'};
export const sheetFixtures:Record<string,AnswerSheet[]>={
 short:[{...base,blocks:[{...block('1','Вычислите 1/2 − 0,5',12),options:[{id:'a',label:'0'},{id:'b',label:'1'}]}],teacherKeys:[{questionId:'1',answer:'CANARY_KEY 0',criteria:'Сокращение дроби.'}]}],
 variants:[{...base,blocks:[block('1','Объясните дроби.',6)],teacherKeys:[{questionId:'1',answer:'CANARY_KEY_1'}]},{...base,variantLabel:'Вариант 2',blocks:[block('2','Вычислите 3/4 − 1/2.',6)],teacherKeys:[{questionId:'2',answer:'CANARY_KEY_2 1/4'}]}],
 long:[{...base,blocks:[block('long',('Прочитайте условие задачи и поясните каждый шаг решения. ').repeat(360).slice(0,20000),12)]}],
 longtitle:[{...base,blocks:[{...block('legacy-title',('Прочитайте условие задачи и поясните каждый шаг решения. ').repeat(360).slice(0,20000),12),title:('Длинный заголовок раздела − дроби и уравнения. ').repeat(6)}]}],
 empty:[{...base,blocks:[block('legacy','',6)]}],
 multipage:[{...base,blocks:Array.from({length:9},(_,i)=>block(String(i+1),'Объясните почему 1/2 = 0,5 и приведите пример из жизни.',12)),teacherKeys:[{questionId:'1',answer:'CANARY_KEY_МНОГОСТРАНИЧНЫЙ'}]}],
};
