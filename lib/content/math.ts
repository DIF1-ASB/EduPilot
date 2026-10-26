import {unified} from 'unified';
import remarkParse from 'remark-parse';
import type {Nodes} from 'mdast';

/** Normalize presentation only: never rewrite mathematical meaning or code. */
export const mathPrompt='Формулы: $...$ внутри строки, $$ на отдельных строках для блочных. Русский текст внутри формул оборачивай в \\text{...}. В JSON экранируй каждый обратный слеш вторым слешем. Не включай скрытые рассуждения.';
function normalizeProse(source: string): string {
  return source
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body.trim()}$`)
      .replace(/\\(xrightarrow|xleftarrow)\{([^{}]*[А-Яа-яЁё][^{}]*)\}/g,
        (_, command: string, label: string) => `\\${command}{\\text{${label}}}`);
}

export function normalizeMathMarkdown(source: string): string {
  // CommonMark context distinguishes indented code from paragraph/list indentation.
  // Slice original ranges rather than serialize the AST: literal code stays byte-for-byte.
  const ranges: {start:number;end:number}[] = [];
  const visit = (node:Nodes) => {
    if (node.type === 'code' || node.type === 'inlineCode') {
      const start=node.position?.start.offset,end=node.position?.end.offset;
      if(start!==undefined&&end!==undefined)ranges.push({start,end});
    } else if ('children' in node) node.children.forEach(visit);
  };
  visit(unified().use(remarkParse).parse(source));
  let result='',cursor=0;
  for(const {start,end} of ranges){
    result+=normalizeProse(source.slice(cursor,start))+source.slice(start,end);
    cursor=end;
  }
  return result+normalizeProse(source.slice(cursor));
}

/** Detect single-escaped JSON LaTeX after parsing. CRLF in ordinary text is valid. */
export function assertSafeMathText(value: unknown): void {
  if (typeof value === 'string') {
    const text = value.replace(/\r\n/g, '\n');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\r]/u.test(text) || /\t(?:ext|imes|heta|au|an|frac)\b/u.test(text))
      throw new Error('Некорректное экранирование формулы: скрытый управляющий символ.');
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) assertSafeMathText(child);
  }
}
