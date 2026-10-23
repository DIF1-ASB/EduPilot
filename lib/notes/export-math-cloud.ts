import type {FormulaAsset} from './export-math';
export async function renderFormulaAsset(_latex:string,_options:{display:boolean}):Promise<FormulaAsset>{throw Object.assign(Error('Экспорт формул конспекта доступен на Node-сервере. В облачной среде сохраните текст без формул или используйте серверную версию.'),{status:503});}
