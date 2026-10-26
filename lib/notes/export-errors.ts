/** Only explicitly authored, non-sensitive recovery instructions may cross the download API. */
export class NotesExportError extends Error {
 readonly status=422;
}

/** The renderer already enforces a readability floor. Layout must not shrink it again. */
export function requireFormulaSpace(width:number,height:number,availableWidth:number,availableHeight:number):void{
 if(width>availableWidth+.01||height>availableHeight+.01)throw new NotesExportError('Формула не помещается в доступную область без потери читаемости. Разбейте выражение на несколько отдельных формул или вынесите его из таблицы.');
}
