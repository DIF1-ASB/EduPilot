'use client';
import type {NotesDocument} from '@/lib/notes/schema';
export function NotesPreview({document:doc}:{document:NotesDocument}){
 return <article className="notes-preview">
  {doc.demo&&<p className="ai-disclaimer">Демонстрационный шаблон для ручного заполнения, не готовый конспект.</p>}
  <section><h2>Краткая суть</h2><p style={{whiteSpace:'pre-wrap'}}>{doc.summary||'Суть пока не заполнена.'}</p></section>
  {!!doc.concepts.length&&<section><h2>Ключевые понятия</h2><dl>{doc.concepts.map((c,i)=><div key={i}><dt>{c.term}</dt><dd style={{whiteSpace:'pre-wrap'}}>{c.definition}</dd></div>)}</dl></section>}
  {!!doc.theses.length&&<section><h2>Основные тезисы</h2><ol>{doc.theses.map((t,i)=><li key={i} style={{whiteSpace:'pre-wrap'}}>{t}</li>)}</ol></section>}
  {doc.examples.map((example,i)=><section key={i}><h2>{example.title}</h2><p style={{whiteSpace:'pre-wrap'}}>{example.body}</p></section>)}
  <section><h2>Итог</h2><p style={{whiteSpace:'pre-wrap'}}>{doc.conclusion||'Итог пока не заполнен.'}</p></section>
  {!!doc.selfCheck.length&&<section><h2>Самопроверка</h2>{doc.selfCheck.map((q,i)=><section key={q.id}><h3>{i+1}. {q.question}</h3><details className="notes-screen-answer"><summary>Показать ответ</summary><p style={{whiteSpace:'pre-wrap'}}>{q.answer}</p></details></section>)}</section>}
  {!!doc.selfCheck.length&&<section className="notes-print-answers"><h2>Ответы для самопроверки</h2>{doc.selfCheck.map((q,i)=><p key={q.id}>{i+1}. {q.answer}</p>)}</section>}
 </article>;
}
