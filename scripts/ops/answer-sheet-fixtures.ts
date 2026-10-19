// Synthetic-only document QA. Never imports or opens a database.
import {mkdir,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {sheetFixtures} from '../../tests/helpers/answer-sheets';
import {exportAnswerSheetsDocx} from '../../lib/assessment/export-docx';
import {exportAnswerSheetsPdf,layoutAnswerSheets} from '../../lib/assessment/export-pdf';
const root=resolve('../work/stage1-qa/answer-sheets');await mkdir(root,{recursive:true});
const report=[];
for(const [name,sheets] of Object.entries(sheetFixtures)){
 await writeFile(join(root,name+'.docx'),await exportAnswerSheetsDocx(sheets));await writeFile(join(root,name+'.pdf'),await exportAnswerSheetsPdf(sheets));
 const layout=await layoutAnswerSheets(sheets);report.push({name,pdfPages:layout.pages.length,lines:layout.pages.flat().filter(op=>op.kind==='rule').length});
}
await writeFile(join(root,'layout-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({root,fixtures:report}));
