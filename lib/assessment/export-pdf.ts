import {PDFDocument,rgb,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {getRuntime} from '../runtime';
import {fail} from '../security';
import type {AnswerSheet} from './sheet';
type Op={kind:'text'|'rule'|'box',x:number,y:number,width:number,text?:string,size?:number,symbol?:boolean};
const W=595.28,H=841.89,LEFT=50,RIGHT=545.28,TOP=790,BOTTOM=50;
async function createPdf(){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const read=async(name:string)=>{const assets=getRuntime()?.ASSETS;if(assets){const r=await assets.fetch(new Request('https://assets/fonts/'+name));if(!r.ok)throw new Error('PDF font missing');return new Uint8Array(await r.arrayBuffer());}const fs=await import('node:fs/promises');return new Uint8Array(await fs.readFile('public/fonts/'+name));};
 const font=await pdf.embedFont(await read('NotoSans-Regular.ttf'),{subset:true}),symbol=await pdf.embedFont(await read('NotoSansMath-Regular.ttf'),{subset:true});return {pdf,font,symbol};
}
function layout(sheets:AnswerSheet[],font:PDFFont,symbol:PDFFont){
 const supported=new Set(font.getCharacterSet());
 const widths=new Map<string,number>();
 const widthOf=(text:string,size:number)=>Array.from(text).reduce((n,c)=>{const key=size+':'+c;let width=widths.get(key);if(width===undefined){width=(c==='−'?symbol:font).widthOfTextAtSize(c,size);widths.set(key,width);}return n+width;},0);
 const normalize=(text:string)=>text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ');
 const wrap=(text:string,size:number,width=RIGHT-LEFT):string[]=>{
  const result:string[]=[];
  for(const raw of normalize(text).split('\n')){
   let current='';for(const char of raw){const code=char.codePointAt(0)!;if(!supported.has(code)&&char!=='−')fail(422,`PDF: шрифт не поддерживает U+${code.toString(16).toUpperCase().padStart(4,'0')}. Скачайте DOCX: символ сохранится без замены.`);
    if(current&&widthOf(current+char,size)>width){const at=current.lastIndexOf(' ');if(at>0){result.push(current.slice(0,at));current=current.slice(at+1);}else{result.push(current);current='';}}
    current+=char;
   }result.push(current);
  }return result;
 };
 const pages:Op[][]=[];let page:Op[]=[],y=TOP,continuation='';
 const newPage=()=>{page=[];pages.push(page);y=TOP;if(continuation){lines(wrap(continuation+' · продолжение',10),10);y-=10;}};
 const ensure=(height:number)=>{if(y-height<BOTTOM)newPage();};
 const lines=(parts:string[],size=11,x=LEFT)=>{for(const text of parts){ensure(size*1.6);let cursor=x;for(const run of text.split(/(−)/).filter(Boolean)){const width=widthOf(run,size);page.push({kind:'text',x:cursor,y,width,text:run,size,symbol:run==='−'});cursor+=width;}y-=size*1.6;}};
 const text=(value:string,size=11)=>lines(wrap(value,size),size);
 sheets.forEach(sheet=>{
  continuation='';newPage();text(sheet.title,20);text(`${sheet.subject} · ${sheet.grade} класс · ${sheet.variantLabel}`);y-=10;text('ФИО: ___________________________________________');text('Класс: ____________ Дата: ________________________');if(sheet.instructions)text(sheet.instructions);text(`Максимум: ${sheet.blocks.reduce((n,b)=>n+(b.points??0),0)} баллов`);y-=8;
  sheet.blocks.forEach(b=>{
   const heading=wrap(b.title+(b.points!==undefined?` · ${b.points} баллов`:''),13),prompt=wrap(b.prompt||' ',11),options=b.options.map(o=>wrap(o.label,11,RIGHT-LEFT-20));
   const firstAnswer=26+20,total=heading.length*20.8+prompt.length*17.6+options.reduce((n,parts)=>n+parts.length*17.6,0)+firstAnswer+16;
   continuation='';ensure(total<=TOP-BOTTOM?total:heading.length*20.8+Math.min(2,prompt.length)*17.6+16);y-=12;continuation=b.title;lines(heading,13);lines(prompt);
   options.forEach(parts=>{ensure(Math.min(parts.length*17.6,TOP-BOTTOM)+18);page.push({kind:'box',x:LEFT,y:y-1,width:9});lines(parts,11,LEFT+20);});
   ensure(firstAnswer);text('Ответ / решение:',10);
   for(let i=0;i<b.answerLines;i++){ensure(26);y-=24;page.push({kind:'rule',x:LEFT,y,width:RIGHT-LEFT});}y-=12;continuation='';
  });
 });
 for(const sheet of sheets)if(sheet.teacherKeys?.length){continuation='';newPage();text('Ключи преподавателя',18);text(sheet.variantLabel,12);for(const k of sheet.teacherKeys){ensure(60);y-=12;text(sheet.blocks.find(b=>b.id===k.questionId)?.title??k.questionId,13);text(k.answer);if(k.criteria)text(k.criteria);}}
 return {pages};
}
export async function layoutAnswerSheets(sheets:AnswerSheet[]){const {font,symbol}=await createPdf();return layout(sheets,font,symbol);}
export async function exportAnswerSheetsPdf(sheets:AnswerSheet[]):Promise<Uint8Array>{
 const {pdf,font,symbol}=await createPdf(),document=layout(sheets,font,symbol);
 for(const ops of document.pages){const page=pdf.addPage([W,H]);for(const op of ops){if(op.kind==='text')page.drawText(op.text!,{x:op.x,y:op.y,font:op.symbol?symbol:font,size:op.size,color:rgb(.09,.13,.19)});else if(op.kind==='rule')page.drawLine({start:{x:op.x,y:op.y},end:{x:op.x+op.width,y:op.y},thickness:.5,color:rgb(.45,.5,.55)});else page.drawRectangle({x:op.x,y:op.y,width:9,height:9,borderWidth:.6,borderColor:rgb(.1,.15,.2)});}}
 return pdf.save();
}
export const exportAnswerSheetPdf=(sheet:AnswerSheet)=>exportAnswerSheetsPdf([sheet]);
