import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizeMathMarkdown,assertSafeMathText} from '../lib/content/math';
import {MarkdownContent} from '../components/content/markdown';

describe('safe shared mathematics',()=>{
 it('renders legacy delimiters without touching inline and fenced code',()=>{
  const code='```txt\n\\(keep\\)\n``` and `\\[keep\\]`';
  expect(normalizeMathMarkdown(code)).toBe(code);
  const normalized=normalizeMathMarkdown('Решение: \\(x+1=2\\)\n\\[x=1\\]');
  expect(normalized).toBe('Решение: $x+1=2$\n\n$$\nx=1\n$$\n');
  expect(normalizeMathMarkdown(normalized)).toBe(normalized);
  expect(renderToStaticMarkup(createElement(MarkdownContent,{source:normalized}))).toContain('katex-display');
 });
 it('preserves variable-length and tilde code fences',()=>{
  for(const source of ['``x ` \\(code\\)``','~~~latex\n\\[code\\]\n~~~','````md\n```\n\\(code\\)\n````'])expect(normalizeMathMarkdown(source)).toBe(source);
 });
 it('renders a Cyrillic arrow label as text without altering existing text wrappers',()=>{
  const source='$a \\xrightarrow{свет} b$';
  expect(normalizeMathMarkdown(source)).toBe('$a \\xrightarrow{\\text{свет}} b$');
  const html=renderToStaticMarkup(createElement(MarkdownContent,{source}));
  expect(html).toContain('katex');expect(html).not.toContain('katex-error');
 });
 it('rejects JSON-corrupted LaTeX but accepts normal tabs, line breaks and escaped commands',()=>{
  for(const value of ['x\right','\frac{1}{2}','\b','\text{слово}',{nested:['x\u0000']}])expect(()=>assertSafeMathText(value)).toThrow();
  expect(()=>assertSafeMathText({body:'Текст\r\n\tобычный\n$\\frac{1}{2}$'})).not.toThrow();
 });
 it('does not execute raw HTML or unsafe Markdown and KaTeX URLs',()=>{
  const html=renderToStaticMarkup(createElement(MarkdownContent,{source:'<script>alert(1)</script>\n[bad](javascript:alert)\n$\\href{javascript:alert(1)}{X}$'}));
  expect(html).not.toMatch(/<script|href="javascript:|onclick=/i);
 });
});
