import {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,type ParagraphChild} from 'docx';
import {articleExportData,articleToExportBlocks,type ArticleExportMaterial,type ExportBlock,type ExportInline} from './export-blocks';
import {renderFormulaAsset} from '@notes-export-math';
export async function exportNotesArticleDocx(material:ArticleExportMaterial):Promise<Uint8Array>{
 const {doc,title,subtitle}=articleExportData(material),blocks=articleToExportBlocks(doc);
 const runs=async(inlines:ExportInline[]):Promise<ParagraphChild[]>=>Promise.all(inlines.map(async item=>{
  if(item.kind==='math'){const asset=await renderFormulaAsset(item.text,{display:false});return new ImageRun({data:asset.png,type:'png',transformation:{width:asset.width,height:asset.height},altText:{name:'Формула',description:item.text,title:'Формула'}});}
  return new TextRun({text:item.text,bold:item.bold,italics:item.italic,strike:item.strike,font:item.code?'Consolas':undefined});
 }));
 const children:Paragraph[]=[new Paragraph({text:title,heading:HeadingLevel.TITLE,keepNext:true}),new Paragraph({text:subtitle,keepNext:true,spacing:{after:240}})];
 if(doc.demo)children.push(new Paragraph({text:'Демонстрационный шаблон',keepNext:true}));
 async function add(items:ExportBlock[],depth=0){for(const block of items){
  const indent=depth?{left:Math.min(depth,6)*280}:undefined;
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
