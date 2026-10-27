import {mathjax} from '@mathjax/src/js/mathjax.js';
import {TeX} from '@mathjax/src/js/input/tex.js';
import {SVG} from '@mathjax/src/js/output/svg.js';
import {liteAdaptor} from '@mathjax/src/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import {MathJaxNewcmFont} from '@mathjax/mathjax-newcm-font/js/svg.js';
import sharp from 'sharp';
export type FormulaAsset={png:Uint8Array;width:number;height:number};
// No autoload, require, user-defined macros, URL support, or network font loading.
mathjax.asyncLoad=(name:string)=>{
 if(!/^@mathjax\/mathjax-newcm-font\/js\/svg\/dynamic\/[\w-]+\.js$/.test(name))throw Error('Недопустимый ресурс формулы.');
 return import(/* webpackIgnore: true */ name);
};
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const tex=new TeX({packages:['base','ams'],maxBuffer:2000,maxMacros:1000,formatError:(_jax:unknown,error:Error)=>{throw Error('Не удалось разобрать формулу: '+error.message);}});
const svgOutput=new SVG({fontCache:'local',font:new MathJaxNewcmFont(),linebreaks:{inline:false}});
const document=mathjax.document('',{InputJax:tex,OutputJax:svgOutput});
// The parser and font cache are shared; serialize conversion, including async font loads.
let tail:Promise<unknown>=Promise.resolve();
export function renderFormulaAsset(latex:string,{display}:{display:boolean}):Promise<FormulaAsset>{
 const task=tail.then(async()=>{
  if(!latex.trim()||latex.length>2000||/[\u0000-\u0008\u000b-\u001f]/u.test(latex)||/\\(?:require|href|url|includegraphics|html\w*|class|style|cssId|def|gdef|edef|newcommand|renewcommand|let|csname|input|unicode)\b/i.test(latex))throw Error('Недопустимая или слишком длинная формула.');
  const node=await document.convertPromise(latex,{display,em:16,ex:8,containerWidth:658});
  const outer=adaptor.serializeXML(node),start=outer.indexOf('<svg'),end=outer.lastIndexOf('</svg>');
  if(start<0||end<start||/data-mml-node="merror"/.test(outer))throw Error('Не удалось отобразить формулу.');
  let svg=outer.slice(start,end+6);const box=svg.match(/viewBox="([^"]+)"/);if(!box)throw Error('Отсутствуют размеры формулы.');
  const [, ,w,h]=box[1].trim().split(/\s+/).map(Number);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Недопустимые размеры формулы.');
  const scale=16/1000,naturalWidth=w*scale,width=Math.min(657,naturalWidth),fit=width/naturalWidth;
  // The normal 12pt equation may shrink only to 10.2pt, never into a hairline.
  if(fit<0.85)throw Error('Формула слишком широкая для читаемого экспорта. Разбейте выражение на несколько отдельных формул.');
  const height=h*scale*fit;
  if(height>900)throw Error('Формула слишком высокая для страницы.');
  svg=svg.replace(/width="[^"]*"/,`width="${Math.ceil(width*3)}"`).replace(/height="[^"]*"/,`height="${Math.ceil(height*3)}"`).replace(/currentColor/g,'#000000');
  if(/<(?:image|foreignObject)\b|(?:href|xlink:href)="(?!#)/i.test(svg))throw Error('Внешние ресурсы формулы запрещены.');
  return {png:new Uint8Array(await sharp(Buffer.from(svg),{limitInputPixels:8_000_000}).png().toBuffer()),width,height};
 });tail=task.catch(()=>undefined);return task;
}
