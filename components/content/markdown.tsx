import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import {normalizeMathMarkdown} from '@/lib/content/math';

export function MarkdownContent({source, inline = false}: {source: string; inline?: boolean}) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, {trust: false, strict: 'ignore', throwOnError: false}], rehypeHighlight]}
    components={inline ? {p: ({children}) => <span>{children}</span>} : undefined}
  >{normalizeMathMarkdown(source)}</ReactMarkdown>;
}
