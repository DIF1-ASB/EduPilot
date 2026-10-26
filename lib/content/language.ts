import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import type {Nodes} from 'mdast';

/** Narrow corruption check, not a language detector or a factual-quality certificate. */
export function assertRussianSubjectLanguage(source:string,subject?:string):void{
 if(!subject||!/математ|биолог/iu.test(subject))return;
 const visit=(node:Nodes):void=>{
  if(node.type==='code'||node.type==='inlineCode'||node.type==='math'||node.type==='inlineMath'||node.type==='blockquote')return;
  if(node.type==='text'){
   // Preserve legitimate quotations and names/formulas such as DNA, CO2, x and ATP.
   const prose=node.value.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,'');
   if(/[\p{Script=Arabic}\p{Script=Han}]/u.test(prose)||/\b(?:within|because|therefore|however|which|without|although|these|those|their|between|through)\b/iu.test(prose))throw Error('Неожиданная языковая вставка в русскоязычном материале.');
  }else if('children'in node)node.children.forEach(visit);
 };
 visit(unified().use(remarkParse).use(remarkMath).parse(source));
}
