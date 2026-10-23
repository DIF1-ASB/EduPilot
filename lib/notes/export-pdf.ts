import {PDFDocument,degrees,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {getRuntime} from '../runtime';
import {articleExportData,articleToExportBlocks,type ArticleExportMaterial,type ExportBlock,type ExportInline} from './export-blocks';
import {renderFormulaAsset} from '@notes-export-math';
type Op={kind:'text'|'image';x:number;y:number;width:number;height:number;text?:string;size?:number;bold?:boolean;italic?:boolean;strike?:boolean;png?:Uint8Array};
const W=595.28,H=841.89,M=18*72/25.4,WIDTH=W-2*M,TOP=H-M;
async function createPdf(){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const assets=getRuntime()?.ASSETS;
 const bytes=assets?await assets.fetch(new Request('https://assets/fonts/NotoSans-Regular.ttf')).then(async r=>{if(!r.ok)throw Error('PDF font missing');return new Uint8Array(await r.arrayBuffer());}):new Uint8Array(await(await import('node:fs/promises')).readFile('public/fonts/NotoSans-Regular.ttf'));
 return {pdf,font:await pdf.embedFont(bytes,{subset:true})};
}
async function layout(material:ArticleExportMaterial,font:PDFFont){
 const {doc,title,subtitle}=articleExportData(material),blocks=articleToExportBlocks(doc),supported=new Set(font.getCharacterSet());
 const pages:Op[][]=[[]];let y=TOP;
 const ensure=(height:number)=>{if(y-height<M){pages.push([]);y=TOP;}};
 const push=(op:Op)=>pages.at(-1)!.push(op);
 const width=(text:string,size:number)=>{for(const c of text)if(!supported.has(c.codePointAt(0)!))throw Object.assign(Error(`PDF: шрифт не поддерживает U+${c.codePointAt(0)!.toString(16).toUpperCase()}. Скачайте Word.`),{status:422});return font.widthOfTextAtSize(text,size);};
 const paragraph=async(inlines:ExportInline[],size=11,depth=0)=>{
  const left=M+Math.min(depth,6)*14,available=W-M-left;
  type Piece={text?:string;png?:Uint8Array;w:number;h:number;bold?:boolean;italic?:boolean;strike?:boolean};
  let line:Piece[]=[],used=0,lineHeight=size*1.4;
  const flush=()=>{ensure(lineHeight);let x=left;for(const p of line){push({kind:p.png?'image':'text',x,y:y-lineHeight+3,width:p.w,height:p.h,text:p.text,png:p.png,size,bold:p.bold,italic:p.italic,strike:p.strike});x+=p.w;}y-=lineHeight;line=[];used=0;lineHeight=size*1.4;};
  for(const item of inlines){
   if(item.kind==='math'){
    const asset=await renderFormulaAsset(item.text,{display:false}),scale=Math.min(.75,available/asset.width,(H-2*M-6)/asset.height),w=asset.width*scale,h=asset.height*scale;
    if(used+w>available&&line.length)flush();line.push({png:asset.png,w,h});used+=w;lineHeight=Math.max(lineHeight,h+6);continue;
   }
   for(const word of item.text.split(/(\s+)/u).filter(Boolean)){
    if(word.includes('\n')){flush();continue;}
    if(!line.length&&/^\s+$/.test(word))continue;
    if(used+width(word,size)>available&&line.length)flush();
    let text='';for(const c of word){if(width(text+c,size)>available){const w=width(text,size);line.push({text,w,h:size,bold:item.bold,italic:item.italic,strike:item.strike});used+=w;flush();text='';}text+=c;}
    if(!line.length&&/^\s+$/.test(text))continue;
    const w=width(text,size);line.push({text,w,h:size,bold:item.bold,italic:item.italic,strike:item.strike});used+=w;
   }
  }if(line.length)flush();y-=7;
 };
 await paragraph([{kind:'text',text:title,bold:true}],20);await paragraph([{kind:'text',text:subtitle}],10);
 if(doc.demo)await paragraph([{kind:'text',text:'Демонстрационный шаблон'}],10);
 async function add(items:ExportBlock[],depth=0){for(const block of items){
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
 for(const ops of result.pages){const page=pdf.addPage([W,H]);for(const op of ops){if(op.kind==='image'){page.drawImage(await pdf.embedPng(op.png!),{x:op.x,y:op.y,width:op.width,height:op.height});continue;}
  const options={x:op.x,y:op.y,size:op.size,font,...(op.italic?{xSkew:degrees(10)}:{})};page.drawText(op.text!,options);if(op.bold)page.drawText(op.text!,{...options,x:op.x+.18});if(op.strike)page.drawLine({start:{x:op.x,y:op.y+op.size!*.3},end:{x:op.x+op.width,y:op.y+op.size!*.3},thickness:.5});
 }}return pdf.save();
}
