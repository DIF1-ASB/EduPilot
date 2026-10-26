import {describe,it,expect} from 'vitest';
import {renderFormulaAsset} from '../lib/notes/export-math';
describe('local formula assets',()=>{
 it('renders fractions, powers and Cyrillic arrow labels as finite transparent PNGs',async()=>{
  for(const latex of [String.raw`\frac{3}{4}+x^2`,String.raw`A\xrightarrow{\text{нагревание}}B`]){
   const asset=await renderFormulaAsset(latex,{display:true});
   expect(Array.from(asset.png.slice(0,8))).toEqual([137,80,78,71,13,10,26,10]);
   expect(asset.width).toBeGreaterThan(0);expect(asset.height).toBeGreaterThan(0);expect(asset.width).toBeLessThanOrEqual(658);
  }
 });
 it('refuses oversized, unsafe and malformed TeX instead of exporting an error image',async()=>{
  for(const latex of ['x'.repeat(2001),String.raw`\require{html}`,String.raw`\href{https://example.invalid}{x}`,String.raw`\includegraphics{https://example.invalid/x}`,String.raw`\unknowncommand{x}`])await expect(renderFormulaAsset(latex,{display:false})).rejects.toThrow();
 });
 it('refuses length-valid wide formulas instead of shrinking them into unreadable lines',async()=>{
  for(const terms of [100,300])await expect(renderFormulaAsset(Array(terms).fill('x').join('+'),{display:true})).rejects.toThrow(/широк|читаем|разбей/i);
 });
});
