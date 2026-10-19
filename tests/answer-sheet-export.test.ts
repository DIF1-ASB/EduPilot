import {describe,it,expect} from 'vitest';
import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import {exportAnswerSheetDocx,exportAnswerSheetsDocx} from '../lib/assessment/export-docx';
import {exportAnswerSheetPdf,exportAnswerSheetsPdf,layoutAnswerSheets} from '../lib/assessment/export-pdf';
import {sheetFixtures} from './helpers/answer-sheets';
describe('answer sheet export',()=>{
 it('exports twelve real ruled paragraphs and starts teacher keys on a separate page after all variants',async()=>{
  const bytes=await exportAnswerSheetDocx(sheetFixtures.short[0]),zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml')!.async('string');expect(xml).toContain('ФИО');expect(xml).toContain('Класс');expect(xml).toContain('Дата');expect(xml.match(/<w:pBdr>/g)).toHaveLength(12);expect(xml).toContain('w:keepNext');expect(xml).toContain('w:pageBreakBefore');expect(xml.indexOf('CANARY_KEY')).toBeGreaterThan(xml.lastIndexOf('<w:pBdr>'));
  const variants=await JSZip.loadAsync(await exportAnswerSheetsDocx(sheetFixtures.variants));const all=await variants.file('word/document.xml')!.async('string');expect(all.indexOf('CANARY_KEY_1')).toBeGreaterThan(all.indexOf('Вычислите 3/4'));expect(all).toContain('Вариант 2');
  const student={...sheetFixtures.short[0],teacherKeys:undefined};const safe=await JSZip.loadAsync(await exportAnswerSheetDocx(student));expect(await safe.file('word/document.xml')!.async('string')).not.toContain('CANARY_KEY');
 });
 it('lays out all fixtures within A4 and keeps every answer line, including a 20000-character condition',async()=>{
  for(const sheets of Object.values(sheetFixtures)){
   const bytes=await exportAnswerSheetsPdf(sheets),pdf=await PDFDocument.load(bytes);expect(bytes.length).toBeGreaterThan(1000);for(const p of pdf.getPages()){expect(p.getWidth()).toBeCloseTo(595.28,1);expect(p.getHeight()).toBeCloseTo(841.89,1);}
   const layout=await layoutAnswerSheets(sheets);expect(layout.pages.length).toBe(pdf.getPageCount());const ops=layout.pages.flat();expect(ops.filter(o=>o.kind==='rule')).toHaveLength(sheets.flatMap(s=>s.blocks).reduce((n,b)=>n+b.answerLines,0));for(const o of ops){expect(o.x).toBeGreaterThanOrEqual(45);expect(o.y).toBeGreaterThanOrEqual(45);expect(o.y).toBeLessThanOrEqual(797);expect(o.width).toBeLessThanOrEqual(495.28);}
  }
 },30000);
 it('refuses a missing glyph with 422 and codepoint instead of silently changing the question',async()=>{
  await expect(exportAnswerSheetPdf({...sheetFixtures.empty[0],blocks:[{...sheetFixtures.empty[0].blocks[0],prompt:'Знак 🧑'}]})).rejects.toMatchObject({status:422,message:expect.stringMatching(/U\+1F9D1.*DOCX/)});
 });
 it('starts a long question in remaining first-page space rather than leaving a header-only sheet',async()=>{
  const layout=await layoutAnswerSheets(sheetFixtures.long);expect(layout.pages[0].some(op=>op.text?.includes('Задание long'))).toBe(true);
 });
});
