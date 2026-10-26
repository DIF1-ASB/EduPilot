import {unified} from 'unified';
import remarkParse from 'remark-parse';
import type {Nodes} from 'mdast';

/** Normalize presentation only: never rewrite mathematical meaning or code. */
export const mathPrompt='Формулы: $...$ внутри строки, $$ на отдельных строках для блочных (отдельная строка $$, затем формула, затем отдельная строка $$). Простые выражения пиши без лишних LaTeX-команд, например $3x+5=20$. Обычные русские пояснения оставляй вне формул; если подпись необходима внутри, используй \\text{...}. Верни синтаксически корректный JSON: каждый обратный слеш LaTeX должен быть удвоен в самом JSON, иначе команды превращаются в скрытые управляющие символы. Пример корректной JSON-строки с дробью: '+JSON.stringify({bodyMarkdown:String.raw`Доля $\frac{1}{2}$.`})+'. Не включай скрытые рассуждения.';
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
