import {z} from 'zod';
import {onlineTestInputSchema} from '../assessment/online';
import {notesArticleInputSchema} from '../notes/article';
export const createGenerationSchema=z.discriminatedUnion('kind',[
 z.object({requestId:z.string().uuid(),kind:z.literal('test'),input:onlineTestInputSchema}).strict(),
 z.object({requestId:z.string().uuid(),kind:z.literal('notes'),input:notesArticleInputSchema}).strict(),
]);
export type CreateGeneration=z.infer<typeof createGenerationSchema>;
export type GenerationState='queued'|'running'|'validating'|'completed'|'failed'|'cancelled';
export type GenerationJobDTO={id:string;kind:'test'|'notes';state:GenerationState;materialId?:string;error?:{code:string;message:string;retryable:boolean};createdAt:string;updatedAt:string};
export const generationErrorMessages:Record<string,string>={
 interrupted:'Генерация прервана перезапуском или истечением времени. Можно запустить заново.',
 invalid_content:'ИИ не смог сформировать материал по требованиям после одной попытки исправления. Готовая работа не сохранена.',
 provider_unavailable:'ИИ-провайдер недоступен или не ответил вовремя. Можно повторить запрос.',
 permission_changed:'Права пользователя изменились. Генерация остановлена.',
};
