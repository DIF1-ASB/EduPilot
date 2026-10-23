import type {NotesArticleDocument} from '@/lib/notes/article';
import {MarkdownContent} from '../content/markdown';
export function NotesArticlePreview({document}:{document:NotesArticleDocument}){
 return <article className="notes-preview notes-article markdown">{document.bodyMarkdown.trim()?<MarkdownContent source={document.bodyMarkdown}/>:<p>Пока нет текста. Откройте редактор и добавьте связное объяснение темы.</p>}</article>;
}
