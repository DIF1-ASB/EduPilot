import {describe,it,expect} from 'vitest';
import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import {articleToExportBlocks} from '../lib/notes/export-blocks';
import {exportNotesArticleDocx} from '../lib/notes/export-docx';
import {exportNotesArticlePdf,layoutNotesArticlePdf} from '../lib/notes/export-pdf';
import {exportMaterial} from '../lib/export';
import {openPlatformFixture} from './helpers/platform';
const doc={schemaVersion:3 as const,kind:'notes-article' as const,demo:false,bodyMarkdown:String.raw`## Дроби и степени

Обычный **важный** текст и *пример* с формулой $x^2+1$.

- Первая часть
- Вторая часть

$$
\frac{3}{4}=0.75
$$

## Код

\`\`\`txt
$literal$ **not emphasis**
\`\`\`
`.replaceAll('\\`','`')};
const material={type:'notes',title:'Дроби и степени',subject:'Математика',grade:7,userId:'synthetic',contentJson:doc};
describe('prose notes exports',()=>{
 it('builds semantic blocks with nested emphasis, math and literal code',()=>{
  const blocks=articleToExportBlocks(doc);expect(blocks.map(b=>b.kind)).toEqual(['heading','paragraph','list','math','heading','code']);
  expect(JSON.stringify(blocks)).toContain('важный');expect(JSON.stringify(blocks)).toContain('"bold":true');
  expect(blocks.at(-1)).toMatchObject({kind:'code',text:'$literal$ **not emphasis**'});
 });
 it('embeds formula media in DOCX with A4 page style and no literal Markdown outside code',async()=>{
  const zip=await JSZip.loadAsync(await exportNotesArticleDocx(material)),xml=await zip.file('word/document.xml')!.async('string');
  expect(Object.keys(zip.files).filter(x=>x.startsWith('word/media/')&&!zip.files[x].dir).length).toBeGreaterThanOrEqual(2);
  const visible=(xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g)||[]).join('');
  expect(xml).toContain('Дроби и степени');expect(xml).toContain('w:keepNext');expect(xml).toContain('w:w="11906"');expect(visible).not.toContain('\\frac');expect(visible).not.toContain('**важный**');expect(visible).toContain('$literal$');
  const styles=await zip.file('word/styles.xml')!.async('string');expect(styles).toContain('Noto Sans');
 });
 it('wraps long prose, headings and formula images inside A4 without clipping',async()=>{
  const long={...material,contentJson:{...doc,bodyMarkdown:doc.bodyMarkdown+'\n\n'+('Содержательный абзац о дробях и степенях. '.repeat(500))}};
  const bytes=await exportNotesArticlePdf(long),pdf=await PDFDocument.load(bytes),layout=await layoutNotesArticlePdf(long);
  expect(pdf.getPageCount()).toBeGreaterThan(1);expect(layout.pages.length).toBe(pdf.getPageCount());
  for(const ops of layout.pages)for(const op of ops){expect(op.x).toBeGreaterThanOrEqual(51);expect(op.y).toBeGreaterThanOrEqual(51);expect(op.x+op.width).toBeLessThanOrEqual(544.3);expect(op.y+op.height).toBeLessThanOrEqual(791);}
 });
 it('routes new articles to the rich exporter while keeping legacy notes and worksheet exports',async()=>{
  const rich=await exportMaterial(material,'docx',false),zip=await JSZip.loadAsync(rich.bytes);expect(Object.keys(zip.files).some(x=>x.startsWith('word/media/')&&!zip.files[x].dir)).toBe(true);
  const legacy={...material,contentJson:{sections:[{id:'s',title:'Старый раздел',body:'Сохранённый текст'}],demo:false}};
  const old=await JSZip.loadAsync((await exportMaterial(legacy,'docx',true)).bytes);expect(await old.file('word/document.xml')!.async('string')).toContain('Сохранённый текст');
 });
 it('bounds the number of formula renders per document',()=>{
  expect(()=>articleToExportBlocks({...doc,bodyMarkdown:('$x$ ').repeat(129)})).toThrow(/128/);
 });
 it('returns an actionable export error for an unsupported formula without a broken download',async()=>{
  const f=await openPlatformFixture('article-formula-error');try{
   const m=await f.client.material.create({data:{userId:f.student.id,type:'notes',title:'Черновик',subject:'Математика',grade:7,contentJson:{...doc,bodyMarkdown:String.raw`Текст $\unknowncommand{x}$`}}});
   const response=await f.call(`materials/${m.id}/export?format=pdf`,'GET',undefined,f.student.cookie);expect(response.status).toBe(422);expect(JSON.stringify(await response.json())).toMatch(/формул/);
  }finally{await f.close();}
 });
});
