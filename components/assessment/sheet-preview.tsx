import type {AnswerSheet} from '@/lib/assessment/sheet';
export function SheetPreview({sheet}:{sheet:AnswerSheet}){
 const total=sheet.blocks.reduce((sum,b)=>sum+(b.points??0),0);
 return <article className="answer-sheet-preview"><header><h1>{sheet.title}</h1><p>{sheet.subject} · {sheet.grade} класс{sheet.variantLabel?' · '+sheet.variantLabel:''}</p><p>ФИО: ________________________________</p><p>Класс: __________ Дата: ______________</p>{sheet.instructions&&<p className="sheet-text">{sheet.instructions}</p>}<p>Максимум: {total} баллов</p></header>
 {sheet.blocks.map(b=><section className="answer-sheet-question" key={b.id}><div className="sheet-question-start"><h2>{b.title}{b.points!==undefined?` · ${b.points} баллов`:''}</h2><p className="sheet-text">{b.prompt||' '}</p></div>{b.options.map(o=><p className="sheet-option" key={o.id}><span className="sheet-checkbox" aria-hidden="true"/> {o.label}</p>)}<p className="sheet-answer-label">Ответ / решение:</p>{Array.from({length:b.answerLines},(_,i)=><div className="answer-line" key={i}/>)}</section>)}
 {!!sheet.teacherKeys?.length&&<section className="sheet-teacher-keys"><h2>Ключи преподавателя · {sheet.variantLabel}</h2>{sheet.teacherKeys.map(k=><section key={k.questionId}><h3>{sheet.blocks.find(b=>b.id===k.questionId)?.title}</h3><p className="sheet-text">{k.answer}</p>{k.criteria&&<p className="sheet-text">{k.criteria}</p>}</section>)}</section>}
 </article>;
}
