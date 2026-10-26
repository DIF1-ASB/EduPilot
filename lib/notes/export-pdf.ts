import {PDFDocument,degrees,rgb,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {getRuntime} from '../runtime';
import {articleExportData,articleToExportBlocks,tableColumnFractions,type ArticleExportMaterial,type ExportBlock,type ExportInline,type ExportTable} from './export-blocks';
import {renderFormulaAsset} from '@notes-export-math';
type Op={kind:'text'|'image'|'border';x:number;y:number;width:number;height:number;text?:string;size?:number;bold?:boolean;italic?:boolean;strike?:boolean;png?:Uint8Array;header?:boolean};
type Piece={text?:string;png?:Uint8Array;w:number;h:number;bold?:boolean;italic?:boolean;strike?:boolean};
type Line={pieces:Piece[];height:number;width:number};
const W=595.28,H=841.89,M=18*72/25.4,WIDTH=W-2*M,TOP=H-M,PAD=5;
async function createPdf(){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const assets=getRuntime()?.ASSETS;
 const bytes=assets?await assets.fetch(new Request('https://assets/fonts/NotoSans-Regular.ttf')).then(async r=>{if(!r.ok)throw Error('PDF font missing');return new Uint8Array(await r.arrayBuffer());}):new Uint8Array(await(await import('node:fs/promises')).readFile('public/fonts/NotoSans-Regular.ttf'));
 return {pdf,font:await pdf.embedFont(bytes,{subset:true})};
}
async function layout(material:ArticleExportMaterial,font:PDFFont){
 const {doc,title,subtitle}=articleExportData(material),blocks=articleToExportBlocks(doc),supported=new Set(font.getCharacterSet());
 const pages:Op[][]=[[]];let y=TOP;
 const newPage=()=>{pages.push([]);y=TOP;};
 const ensure=(height:number)=>{if(y-height<M)newPage();};
 const push=(op:Op)=>pages.at(-1)!.push(op);
 const width=(text:string,size:number)=>{for(const c of text)if(!supported.has(c.codePointAt(0)!))throw Object.assign(Error(`PDF: шрифт не поддерживает U+${c.codePointAt(0)!.toString(16).toUpperCase()}. Скачайте Word.`),{status:422});return font.widthOfTextAtSize(text,size);};
 // Wrapping does not place pages: paragraphs and table cells share exactly the same metrics.
 const wrap=async(inlines:ExportInline[],size:number,available:number):Promise<Line[]>=>{
  const lines:Line[]=[];let pieces:Piece[]=[],used=0,height=size*1.4;
  const flush=()=>{lines.push({pieces,height,width:used});pieces=[];used=0;height=size*1.4;};
  for(const item of inlines){
   if(item.kind==='math'){
    const asset=await renderFormulaAsset(item.text,{display:false}),scale=Math.min(.75,available/asset.width,(H-2*M-40)/asset.height),w=asset.width*scale,h=asset.height*scale;
    if(used+w>available&&pieces.length)flush();pieces.push({png:asset.png,w,h});used+=w;height=Math.max(height,h+6);continue;
   }
   for(const token of item.text.split(/(\n|[^\S\n]+)/u).filter(Boolean)){
    if(token==='\n'){flush();continue;}
    if(!pieces.length&&/^\s+$/u.test(token))continue;
    const overhang=item.italic?size*Math.tan(10*Math.PI/180):0;
    if(used+width(token,size)+overhang>available&&pieces.length)flush();
    let text='';
    for(const c of token){if(width(text+c,size)+overhang>available&&text){const w=width(text,size);pieces.push({text,w,h:size,bold:item.bold,italic:item.italic,strike:item.strike});used+=w;flush();text='';}text+=c;}
    if(!pieces.length&&/^\s+$/u.test(text))continue;
    const w=width(text,size);pieces.push({text,w,h:size,bold:item.bold,italic:item.italic,strike:item.strike});used+=w;
   }
  }if(pieces.length)flush();return lines;
 };
 const drawLine=(line:Line,left:number,top:number,size:number)=>{
  let x=left;for(const p of line.pieces){push({kind:p.png?'image':'text',x,y:top-line.height+3,width:p.w,height:p.h,text:p.text,png:p.png,size,bold:p.bold,italic:p.italic,strike:p.strike});x+=p.w;}
 };
 const paragraph=async(inlines:ExportInline[],size=11,depth=0)=>{
  const left=M+Math.min(depth,6)*14;
  for(const line of await wrap(inlines,size,W-M-left)){ensure(line.height);drawLine(line,left,y,size);y-=line.height;}y-=7;
 };
 const table=async(block:ExportTable,depth:number)=>{
  if(!block.rows.length)return;
  const left=M+Math.min(depth,6)*14,widths=tableColumnFractions(block).map(f=>f*(W-M-left)),size=11;
  if(widths.some(w=>w-2*PAD<size*2))throw Object.assign(Error('Слишком много узких столбцов для PDF. Разделите таблицу или скачайте Word.'),{status:422});
  const rows=await Promise.all(block.rows.map((row,index)=>Promise.all(widths.map((w,col)=>wrap((row[col]??[]).map(i=>({...i,bold:index===0||i.bold})),size,Math.max(1,w-2*PAD))))));
  const rowHeight=(cells:Line[][])=>Math.max(size*1.4,...cells.map(lines=>lines.reduce((n,l)=>n+l.height,0)))+2*PAD;
  const drawCells=(cells:Line[][],height:number,header:boolean)=>{
   let x=left;
   for(const [col,lines]of cells.entries()){
    push({kind:'border',x,y:y-height,width:widths[col],height,header});let top=y-PAD;
    for(const line of lines){const align=block.align[col],offset=align==='right'?widths[col]-2*PAD-line.width:align==='center'?(widths[col]-2*PAD-line.width)/2:0;drawLine(line,x+PAD+Math.max(0,offset),top,size);top-=line.height;}
    x+=widths[col];
   }y-=height;
  };
  const header=rows[0],headerHeight=rowHeight(header);
  if(headerHeight+size*1.4+2*PAD>H-2*M)throw Object.assign(Error('Заголовок таблицы слишком велик для PDF. Сократите его или скачайте Word.'),{status:422});
  ensure(headerHeight+(rows.length>1?Math.min(rowHeight(rows[1]),size*1.4+2*PAD):0));drawCells(header,headerHeight,true);
  for(const original of rows.slice(1)){
   let cells=original.map(lines=>[...lines]);
   if(!cells.some(lines=>lines.length)){const height=rowHeight(cells);if(y-height<M){newPage();drawCells(header,headerHeight,true);}drawCells(cells,height,false);continue;}
   while(cells.some(lines=>lines.length)){
    let fullHeight=rowHeight(cells);
    // Keep normal rows together; split only a row taller than the remaining full-page capacity.
    if(fullHeight>y-M&&fullHeight<=TOP-M-headerHeight){newPage();drawCells(header,headerHeight,true);}
    if(y-M<Math.max(...cells.map(lines=>lines[0]?.height??0))+2*PAD){newPage();drawCells(header,headerHeight,true);}
    const room=y-M-2*PAD;
    const chunk=cells.map(lines=>{let used=0,count=0;for(const line of lines){if(used+line.height>room+.001)break;used+=line.height;count++;}return lines.slice(0,count);});
    if(!chunk.some(lines=>lines.length))throw Object.assign(Error('Строка таблицы не помещается в PDF. Скачайте Word.'),{status:422});
    fullHeight=rowHeight(chunk);drawCells(chunk,fullHeight,false);cells=cells.map((lines,col)=>lines.slice(chunk[col].length));
    if(cells.some(lines=>lines.length)){newPage();drawCells(header,headerHeight,true);}
   }
  }y-=10;
 };
 await paragraph([{kind:'text',text:title,bold:true}],20);await paragraph([{kind:'text',text:subtitle}],10);
 if(doc.demo)await paragraph([{kind:'text',text:'Демонстрационный шаблон'}],10);
 async function add(items:ExportBlock[],depth=0){for(const block of items){
  if(block.kind==='table'){await table(block,depth);continue;}
  if(block.kind==='list'){for(const [i,item]of block.items.entries()){const first=item[0];if(first?.kind==='paragraph')await paragraph([{kind:'text',text:block.ordered?`${block.start+i}. `:'• '},...first.inlines],11,depth+1);await add(first?.kind==='paragraph'?item.slice(1):item,depth+1);}continue;}
  if(block.kind==='heading'){const size=block.level<=2?14:12.5;const text=block.inlines.map(i=>i.text).join('');ensure(Math.ceil(Math.max(1,width(text,size)/WIDTH))*size*1.4+45);y-=8;await paragraph(block.inlines.map(i=>({...i,bold:true})),size,depth);continue;}
  if(block.kind==='math'){
   const a=await renderFormulaAsset(block.text,{display:true}),available=WIDTH-Math.min(depth,6)*14,scale=Math.min(.75,available/a.width,(H-2*M-24)/a.height),w=a.width*scale,h=a.height*scale;
   ensure(h+14);y-=h+4;push({kind:'image',x:M+Math.min(depth,6)*14,y,width:w,height:h,png:a.png});y-=10;continue;
  }
  if(block.kind==='code'){await paragraph([{kind:'text',text:block.text,code:true}],10,depth);continue;}
  await paragraph(block.inlines,11,depth);
 }}await add(blocks);return {pages};
}
export async function layoutNotesArticlePdf(material:ArticleExportMaterial){const {font}=await createPdf();return layout(material,font);}
export async function exportNotesArticlePdf(material:ArticleExportMaterial):Promise<Uint8Array>{
 const {pdf,font}=await createPdf(),result=await layout(material,font);
 for(const ops of result.pages){const page=pdf.addPage([W,H]);for(const op of ops){
  if(op.kind==='border'){page.drawRectangle({x:op.x,y:op.y,width:op.width,height:op.height,borderWidth:.5,borderColor:rgb(.85,.85,.85),...(op.header?{color:rgb(.93,.95,.96)}:{})});continue;}
  if(op.kind==='image'){page.drawImage(await pdf.embedPng(op.png!),{x:op.x,y:op.y,width:op.width,height:op.height});continue;}
  const options={x:op.x,y:op.y,size:op.size,font,...(op.italic?{ySkew:degrees(10)}:{})};page.drawText(op.text!,options);if(op.bold)page.drawText(op.text!,{...options,x:op.x+.18});if(op.strike)page.drawLine({start:{x:op.x,y:op.y+op.size!*.3},end:{x:op.x+op.width,y:op.y+op.size!*.3},thickness:.5});
 }}return pdf.save();
}
