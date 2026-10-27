import {describe,it,expect,vi} from 'vitest';
import JSZip from 'jszip';
import {PDFDocument,PDFArray,PDFDict,PDFName,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {articleToExportBlocks} from '../lib/notes/export-blocks';
import {exportNotesArticleDocx} from '../lib/notes/export-docx';
import {exportNotesArticlePdf,layoutNotesArticlePdf} from '../lib/notes/export-pdf';
import * as pdfExporter from '../lib/notes/export-pdf';
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
 it('preserves mathematical Unicode in prose, headings and tables without replacing unsupported characters',async()=>{
  const fixture={...material,contentJson:{...doc,bodyMarkdown:'## Сумма ≥10\n\nПри сумме ≥10 переносим единицу. Проверяем 3≤5 и 3≠4.\n\n| Условие | Проверка |\n| --- | --- |\n| **Сумма ≥10** | Верно |'}};
  const pdf=await PDFDocument.load(await exportNotesArticlePdf(fixture));
  const maps:string[]=[];
  for(const page of pdf.getPages()){
   const fonts=page.node.Resources()!.lookup(PDFName.of('Font'),PDFDict);
   for(const [,ref]of fonts.entries()){
    const font=pdf.context.lookup(ref,PDFDict),cmap=pdf.context.lookup(font.get(PDFName.of('ToUnicode')));
    if(!(cmap instanceof PDFRawStream))throw Error('Missing Unicode character map');
    maps.push(new TextDecoder().decode(decodePDFRawStream(cmap).decode()));
   }
  }
  for(const codepoint of ['2265','2264','2260'])expect(maps.join('\n')).toMatch(new RegExp('<[0-9a-f]+>\\s*<'+codepoint+'>','i'));
  const layout=await layoutNotesArticlePdf(fixture);expect(layout.pages.flat().some(op=>op.text?.includes('≥'))).toBe(true);
  for(const op of layout.pages.flat()){expect(op.x+op.width).toBeLessThanOrEqual(544.3);expect(op.y).toBeGreaterThanOrEqual(51);}
  await expect(exportNotesArticlePdf({...material,contentJson:{...doc,bodyMarkdown:'Неизвестный символ 🚀'}})).rejects.toMatchObject({status:422});
 });
 it('refuses to shrink a table formula below the readable whole-page rendering size',async()=>{
  const formula=Array(18).fill('x').join('+'),fixture={...material,contentJson:{...doc,bodyMarkdown:`| А | Б | В | Г |\n| --- | --- | --- | --- |\n| $${formula}$ | 1 | 2 | 3 |`}};
  for(const exporter of [exportNotesArticleDocx,exportNotesArticlePdf]){
   const error=await exporter(fixture).then(()=>null,error=>error);expect(error).toMatchObject({status:422});expect(error.message).toMatch(/формул.*помещ|разбей/iu);
  }
 });
 it('pads short GFM rows and rejects excess cells instead of crashing or dropping text',async()=>{
  const short={...doc,bodyMarkdown:'| А | Б |\n| --- | --- |\n| Только |'};
  const zip=await JSZip.loadAsync(await exportNotesArticleDocx({...material,contentJson:short})),xml=await zip.file('word/document.xml')!.async('string');
  expect((xml.match(/<w:tc>/g)||[]).length).toBe(4);
  expect(()=>articleToExportBlocks({...doc,bodyMarkdown:'| А | Б |\n| --- | --- |\n| Х | У | Лишнее |'})).toThrow(/ячеек/iu);
 });
 it('returns a safe actionable table message at the actual download API and hides internal errors',async()=>{
  const f=await openPlatformFixture('article-table-error');try{
   const header=Array(30).fill('Колонка').join(' | '),rule=Array(30).fill('---').join(' | ');
   const m=await f.client.material.create({data:{userId:f.student.id,type:'notes',title:'Таблица',subject:'Математика',grade:7,contentJson:{...doc,bodyMarkdown:`| ${header} |\n| ${rule} |`}}});
   for(const format of ['pdf','docx']){const response=await f.call(`materials/${m.id}/export?format=${format}`,'GET',undefined,f.student.cookie);expect(response.status).toBe(422);expect(JSON.stringify(await response.json())).toMatch(/столбц/iu);}
   const spy=vi.spyOn(pdfExporter,'exportNotesArticlePdf').mockRejectedValue(Object.assign(Error('INTERNAL_PRIVATE_ERROR'),{status:422}));
   try{const error=await exportMaterial(material,'pdf',false).then(()=>null,error=>error);expect(error.message).not.toContain('INTERNAL_PRIVATE_ERROR');expect(error.status).toBe(422);}finally{spy.mockRestore();}
  }finally{await f.close();}
 });
 it('keeps consecutive formula lines separated in Word, including list paragraphs',async()=>{
  const fixture={...material,contentJson:{...doc,bodyMarkdown:'- Решение:\n  $$3x=15$$\n  $$x=5$$\n  Проверка: верно.'}};
  const zip=await JSZip.loadAsync(await exportNotesArticleDocx(fixture)),xml=await zip.file('word/document.xml')!.async('string');
  expect((xml.match(/<w:br\/>/g)||[]).length).toBe(3);
  expect(xml).toMatch(/<w:drawing>[\s\S]*?<w:br\/>[\s\S]*?<w:drawing>/);
 });
 it('keeps an italic PDF baseline horizontal rather than tilting each word',async()=>{
  const bytes=await exportNotesArticlePdf({...material,contentJson:{...doc,bodyMarkdown:'*Длинное определение термина*'}}),pdf=await PDFDocument.load(bytes);
  const streams=pdf.getPages()[0].node.Contents() as PDFArray;
  const text=streams.asArray().map(ref=>{const stream=pdf.context.lookup(ref);if(!(stream instanceof PDFRawStream))throw Error('Missing content stream');return new TextDecoder().decode(decodePDFRawStream(stream).decode());}).join('\n');
  const matrices=[...text.matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) [\d.-]+ [\d.-]+ Tm/g)].map(m=>m.slice(1).map(Number));
  expect(matrices.some(m=>m[2]>.1)).toBe(true);
  expect(matrices.every(m=>m[1]===0)).toBe(true);
 });
 it('preserves real table cells, formatting and repeating headers in both exports',async()=>{
  const table='| Величина | Описание |\n| :--- | ---: |\n'+Array.from({length:48},(_,i)=>`| $x_${i}$ | **Строка ${i}** с пояснением и единицами измерения |`).join('\n');
  const fixture={...material,contentJson:{...doc,bodyMarkdown:table}};
  expect(articleToExportBlocks(fixture.contentJson)[0]).toMatchObject({kind:'table',align:['left','right']});
  const zip=await JSZip.loadAsync(await exportNotesArticleDocx(fixture)),xml=await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('<w:tbl>');expect(xml).toContain('<w:tblHeader');expect(xml).toContain('D9D9D9');expect((xml.match(/<w:tc>/g)||[]).length).toBe(98);
  expect((xml.match(/<w:cantSplit\/>/g)||[]).length).toBe(49);
  const layout=await layoutNotesArticlePdf(fixture);expect(layout.pages.length).toBeGreaterThan(1);
  for(const page of layout.pages){expect(page.some(op=>op.text==='Величина')).toBe(true);expect(page.some(op=>op.kind==='border')).toBe(true);for(const op of page){expect(op.x).toBeGreaterThanOrEqual(51);expect(op.x+op.width).toBeLessThanOrEqual(544.3);expect(op.y).toBeGreaterThanOrEqual(51);expect(op.y+op.height).toBeLessThanOrEqual(791);}}
 });
 it('splits a very tall table row across pages without dropping content',async()=>{
  const fixture={...material,contentJson:{...doc,bodyMarkdown:'| Термин | Объяснение |\n| --- | --- |\n| Слово | '+('Содержательное объяснение. '.repeat(300))+'КОНЕЦ |'}};
  const layout=await layoutNotesArticlePdf(fixture);expect(layout.pages.length).toBeGreaterThan(1);
  expect(layout.pages.flat().some(op=>op.text==='КОНЕЦ')).toBe(true);
  for(const page of layout.pages)expect(page.some(op=>op.text==='Термин')).toBe(true);
 });
 it('retains an intentionally blank table row rather than deleting it from the PDF',async()=>{
  const layout=await layoutNotesArticlePdf({...material,contentJson:{...doc,bodyMarkdown:'| Слово | Значение |\n| --- | --- |\n| | |\n| Корень | Решение |'}});
  expect(layout.pages.flat().filter(op=>op.kind==='border')).toHaveLength(6);
 });
 it('refuses an unreadably narrow PDF table rather than painting text through cell borders',async()=>{
  const header=Array.from({length:30},()=> 'Колонка').join(' | '),rule=Array.from({length:30},()=> '---').join(' | ');
  for(const exporter of [exportNotesArticlePdf,exportNotesArticleDocx]){const error=await exporter({...material,contentJson:{...doc,bodyMarkdown:`| ${header} |\n| ${rule} |`}}).then(()=>null,error=>error);expect(error).toMatchObject({status:422});}
 });
 it('builds semantic blocks with nested emphasis, math and literal code',()=>{
  const blocks=articleToExportBlocks(doc);expect(blocks.map(b=>b.kind)).toEqual(['heading','paragraph','list','math','heading','code']);
  expect(JSON.stringify(blocks)).toContain('важный');expect(JSON.stringify(blocks)).toContain('"bold":true');
  expect(blocks.at(-1)).toMatchObject({kind:'code',text:'$literal$ **not emphasis**'});
 });
 it('exports indented TeX teaching examples as literal code, not equations',()=>{
  expect(articleToExportBlocks({...doc,bodyMarkdown:'    \\(x+1\\)\n    \\[x=1\\]'})).toEqual([{kind:'code',text:'\\(x+1\\)\n\\[x=1\\]'}]);
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
