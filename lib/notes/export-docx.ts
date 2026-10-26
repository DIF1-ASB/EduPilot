import {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,Table,TableRow,TableCell,WidthType,BorderStyle,VerticalAlign,AlignmentType,TableLayoutType,type ParagraphChild} from 'docx';
import {articleExportData,articleToExportBlocks,tableColumnFractions,type ArticleExportMaterial,type ExportBlock,type ExportInline} from './export-blocks';
import {renderFormulaAsset} from '@notes-export-math';
export async function exportNotesArticleDocx(material:ArticleExportMaterial):Promise<Uint8Array>{
 const {doc,title,subtitle}=articleExportData(material),blocks=articleToExportBlocks(doc);
 const runs=async(inlines:ExportInline[],available=657):Promise<ParagraphChild[]>=>{
  const result:ParagraphChild[]=[];
  for(const item of inlines){
   if(item.kind==='math'){const asset=await renderFormulaAsset(item.text,{display:false}),scale=Math.min(1,available/asset.width);result.push(new ImageRun({data:asset.png,type:'png',transformation:{width:asset.width*scale,height:asset.height*scale},altText:{name:'Формула',description:item.text,title:'Формула'}}));continue;}
   for(const [index,text]of item.text.split('\n').entries())result.push(new TextRun({text,...(index?{break:1}:{}),bold:item.bold,italics:item.italic,strike:item.strike,font:item.code?'Consolas':undefined}));
  }return result;
 };
 const children:(Paragraph|Table)[]=[new Paragraph({text:title,heading:HeadingLevel.TITLE,keepNext:true}),new Paragraph({text:subtitle,keepNext:true,spacing:{after:240}})];
 if(doc.demo)children.push(new Paragraph({text:'Демонстрационный шаблон',keepNext:true}));
 async function add(items:ExportBlock[],depth=0){for(const block of items){
  const indent=depth?{left:Math.min(depth,6)*280}:undefined;
  if(block.kind==='table'){
   const total=9866-Math.min(depth,6)*280,widths=tableColumnFractions(block).map(f=>Math.floor(total*f));
   widths[widths.length-1]+=total-widths.reduce((a,b)=>a+b,0);
   const border={style:BorderStyle.SINGLE,size:4,color:'D9D9D9'};
   const rows:TableRow[]=[];
   for(const [index,row]of block.rows.entries())rows.push(new TableRow({tableHeader:index===0,
    // Keep ordinary rows intact; very long cells must remain free to flow across pages.
    cantSplit:row.every((cell,col)=>cell.reduce((n,i)=>n+i.text.length,0)/Math.max(1,(widths[col]-200)/120)<25),
    children:await Promise.all(row.map(async(cell,col)=>new TableCell({
    width:{size:widths[col],type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,margins:{top:100,bottom:100,left:100,right:100},
    shading:index===0?{fill:'EDF1F4'}:undefined,
    children:[new Paragraph({children:await runs(cell.map(i=>({...i,bold:index===0||i.bold})),Math.max(1,(widths[col]-200)/15)),alignment:block.align[col]==='right'?AlignmentType.RIGHT:block.align[col]==='center'?AlignmentType.CENTER:AlignmentType.LEFT,spacing:{after:0,line:300}})],
   })))}));
   children.push(new Table({rows,columnWidths:widths,width:{size:total,type:WidthType.DXA},layout:TableLayoutType.FIXED,borders:{top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border}}),new Paragraph({spacing:{after:80}}));continue;
  }
  if(block.kind==='list'){for(const [index,item] of block.items.entries()){
   const first=item[0],label=block.ordered?`${block.start+index}. `:'• ';
   if(first?.kind==='paragraph')children.push(new Paragraph({children:[new TextRun(label),...await runs(first.inlines)],indent:{left:Math.min(depth+1,6)*280,hanging:220}}));
   else children.push(new Paragraph({text:label,indent}));
   await add(first?.kind==='paragraph'?item.slice(1):item,depth+1);
  }continue;}
  if(block.kind==='heading'){children.push(new Paragraph({children:await runs(block.inlines),heading:block.level<=2?HeadingLevel.HEADING_1:HeadingLevel.HEADING_2,keepNext:true,indent}));continue;}
  if(block.kind==='math'){
   const asset=await renderFormulaAsset(block.text,{display:true}),scale=Math.min(1,(657-depth*19)/asset.width,840/asset.height);
   children.push(new Paragraph({children:[new ImageRun({data:asset.png,type:'png',transformation:{width:asset.width*scale,height:asset.height*scale},altText:{name:'Формула',description:block.text,title:'Формула'}})],indent,spacing:{before:120,after:180}}));continue;
  }
  if(block.kind==='code'){for(const line of block.text.split('\n'))children.push(new Paragraph({children:[new TextRun({text:line||' ',font:'Consolas',size:20})],indent,spacing:{after:40}}));continue;}
  children.push(new Paragraph({children:await runs(block.inlines),indent}));
 }}
 await add(blocks);
 const word=new Document({
  creator:'EduPilot',
  styles:{default:{
   document:{run:{font:'Noto Sans',size:22,color:'000000'},paragraph:{spacing:{after:140,line:300}}},
   title:{run:{font:'Noto Sans',size:38,color:'000000'},paragraph:{spacing:{after:180}}},
   heading1:{run:{font:'Noto Sans',size:28,bold:true,color:'000000'},paragraph:{spacing:{before:260,after:120},keepNext:true}},
   heading2:{run:{font:'Noto Sans',size:25,bold:true,color:'000000'},paragraph:{spacing:{before:220,after:120},keepNext:true}},
  }},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1020,bottom:1020,left:1020,right:1020}}},children}],
 });
 return new Uint8Array(await Packer.toBuffer(word));
}
