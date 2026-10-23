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
  const blocks: string[] = [];
  let prose = '', fence: {char: string; length: number} | undefined;
  const flush = () => {
    blocks.push(prose.replace(/(`+)([\s\S]*?)\1(?!`)/g, match => {
      const index = protectedCode.push(match) - 1;
      return `\u0000${index}\u0000`;
    }));
    prose = '';
  };
  const protectedCode: string[] = [];
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const index = protectedCode.push(line) - 1;
      blocks.push(`\u0000${index}\u0000`);
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = undefined;
    } else if (marker) {
      flush();
      fence = {char: marker[1][0], length: marker[1].length};
      const index = protectedCode.push(line) - 1;
      blocks.push(`\u0000${index}\u0000`);
    } else prose += line;
  }
  flush();
  return normalizeProse(blocks.join('')).replace(/\u0000(\d+)\u0000/g, (_, index: string) => protectedCode[Number(index)]);
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
