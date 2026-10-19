import {Document,Packer,Paragraph,TextRun,HeadingLevel,BorderStyle} from 'docx';
import type {AnswerSheet} from './sheet';
const paragraph=(text:string,keepNext=false)=>new Paragraph({children:[new TextRun(text)],keepNext,spacing:{after:120,line:300}});
function chunks(text:string){const result:string[]=[];for(const line of text.split('\n')){let rest=line;while(rest.length>700){const space=rest.lastIndexOf(' ',700),cut=space>0?space:700;result.push(rest.slice(0,cut));rest=rest.slice(cut).replace(/^ /,'');}result.push(rest);}return result;}
export async function exportAnswerSheetsDocx(sheets:AnswerSheet[]):Promise<Uint8Array>{
 const children:Paragraph[]=[];
 sheets.forEach((sheet,index)=>{
  children.push(new Paragraph({text:sheet.title,heading:HeadingLevel.TITLE,pageBreakBefore:index>0,keepNext:true}),paragraph(`${sheet.subject} · ${sheet.grade} класс · ${sheet.variantLabel}`,true),paragraph('ФИО: ______________________________________________',true),paragraph('Класс: ______________ Дата: ________________________',true));
  if(sheet.instructions)children.push(paragraph(sheet.instructions,true));children.push(paragraph(`Максимум: ${sheet.blocks.reduce((n,b)=>n+(b.points??0),0)} баллов`));
  for(const b of sheet.blocks){
   children.push(new Paragraph({text:b.title+(b.points!==undefined?` · ${b.points} баллов`:''),heading:HeadingLevel.HEADING_2,keepNext:true,spacing:{before:240,after:120}}));
   // Long conditions may split across pages; only their tail stays with the first answer line.
   const prompt=chunks(b.prompt||' ');prompt.forEach((line,i)=>children.push(paragraph(line,i===prompt.length-1&&b.options.length===0)));
   for(const [oi,o] of b.options.entries()){const parts=chunks('☐ '+o.label);parts.forEach((line,i)=>children.push(paragraph(line,oi===b.options.length-1&&i===parts.length-1)));}
   children.push(paragraph('Ответ / решение:',true));
   for(let i=0;i<b.answerLines;i++)children.push(new Paragraph({text:' ',keepNext:false,spacing:{line:360,after:120},border:{bottom:{style:BorderStyle.SINGLE,size:4,color:'7A8491'},between:{style:BorderStyle.SINGLE,size:4,color:'7A8491'}}}));
  }
 });
 for(const sheet of sheets)if(sheet.teacherKeys?.length){
  children.push(new Paragraph({text:'Ключи преподавателя · '+sheet.variantLabel,heading:HeadingLevel.HEADING_1,pageBreakBefore:true,keepNext:true}));
  for(const k of sheet.teacherKeys){children.push(new Paragraph({text:sheet.blocks.find(b=>b.id===k.questionId)?.title??k.questionId,heading:HeadingLevel.HEADING_2,keepNext:true}),paragraph(k.answer,!!k.criteria));if(k.criteria)children.push(paragraph(k.criteria));}
 }
 const doc=new Document({creator:'EduPilot',styles:{default:{document:{run:{font:'Arial',size:22,color:'172334'},paragraph:{spacing:{after:120,line:300}}},heading1:{run:{color:'172334'}},heading2:{run:{color:'172334'}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1000,bottom:1000,left:1000,right:1000}}},children}]});
 return new Uint8Array(await Packer.toBuffer(doc));
}
export const exportAnswerSheetDocx=(sheet:AnswerSheet)=>exportAnswerSheetsDocx([sheet]);
