import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type {Root,RootContent,PhrasingContent} from 'mdast';
import {normalizeMathMarkdown} from '../content/math';
import {validateNotesArticle,type NotesArticleDocument} from './article';
export type ExportInline={kind:'text'|'math';text:string;bold?:boolean;italic?:boolean;code?:boolean;strike?:boolean};
export type ExportTable={kind:'table';align:('left'|'right'|'center'|null)[];rows:ExportInline[][][]};
export type ExportBlock={kind:'heading';level:number;inlines:ExportInline[]}|{kind:'paragraph';inlines:ExportInline[]}|{kind:'list';ordered:boolean;start:number;items:ExportBlock[][]}|{kind:'code';text:string}|{kind:'math';text:string}|ExportTable;
/** Allocate more space to descriptive columns, without starving short values. */
export function tableColumnFractions(table:ExportTable):number[]{
 const count=table.rows[0]?.length??0;
 const weights=Array.from({length:count},(_,col)=>Math.sqrt(Math.max(8,...table.rows.map(row=>Math.min(80,(row[col]??[]).reduce((n,i)=>n+i.text.length,0))))));
 const sum=weights.reduce((a,b)=>a+b,0);
 return weights.map(w=>.4/count+.6*w/sum);
}
export type ArticleExportMaterial={title:string;subject:string;grade:number;contentJson:unknown};
export function articleToExportBlocks(doc:NotesArticleDocument):ExportBlock[]{
 const source=validateNotesArticle(doc,{ready:false});
 const root=unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(normalizeMathMarkdown(source.bodyMarkdown)) as Root;
 let formulas=0;
 const formula=(text:string)=>{if(++formulas>128)throw Error('В одном документе допускается не более 128 формул.');if(text.length>2000)throw Error('Формула слишком длинная: максимум 2000 символов.');return text;};
 const inline=(nodes:PhrasingContent[],style:Partial<ExportInline>={}):ExportInline[]=>nodes.flatMap((node):ExportInline[]=>{
  if(node.type==='inlineMath')return [{...style,kind:'math',text:formula(node.value)}];
  if(node.type==='text'||node.type==='inlineCode')return [{...style,kind:'text',text:node.value,...(node.type==='inlineCode'?{code:true}:{})}];
  if(node.type==='break')return [{...style,kind:'text',text:'\n'}];
  if(node.type==='strong'||node.type==='emphasis'||node.type==='delete')return inline(node.children,{...style,...(node.type==='strong'?{bold:true}:node.type==='emphasis'?{italic:true}:{strike:true})});
  if(node.type==='link'||node.type==='linkReference')return inline(node.children,style);
  if(node.type==='image'||node.type==='imageReference')return [{...style,kind:'text',text:node.alt||''}];
  if(node.type==='html')throw Error('HTML не поддерживается при экспорте конспекта. Используйте обычный текст.');
  return [];
 });
 const blocks=(nodes:RootContent[]):ExportBlock[]=>nodes.flatMap((node):ExportBlock[]=>{
  if(node.type==='heading')return [{kind:'heading',level:node.depth,inlines:inline(node.children)}];
  if(node.type==='paragraph')return [{kind:'paragraph',inlines:inline(node.children)}];
  if(node.type==='math')return [{kind:'math',text:formula(node.value)}];
  if(node.type==='code')return [{kind:'code',text:node.value}];
  if(node.type==='list')return [{kind:'list',ordered:!!node.ordered,start:node.start??1,items:node.children.map(item=>blocks(item.children))}];
  if(node.type==='blockquote')return blocks(node.children);
  if(node.type==='table')return [{kind:'table',align:node.align??[],rows:node.children.map(row=>row.children.map(cell=>inline(cell.children)))}];
  if(node.type==='html')throw Error('HTML не поддерживается при экспорте конспекта.');
  return [];
 });
 return blocks(root.children);
}
export function articleExportData(material:ArticleExportMaterial){return {doc:validateNotesArticle(material.contentJson,{ready:false}),title:material.title,subtitle:`${material.subject} · ${material.grade} класс`};}
