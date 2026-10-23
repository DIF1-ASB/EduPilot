import {config} from '../runtime';
import {HttpError} from '../security';
import {z} from 'zod';

export type CompletionOptions = {structured?: boolean; signal?: AbortSignal; timeoutMs?: number; maxTokens?: number};
export async function requestCompletion(messages: unknown[], options: CompletionOptions = {}): Promise<string> {
  const base = config('AI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '');
  let url: URL;
  try { url = new URL(base); } catch { throw new HttpError(503, 'Некорректный адрес ИИ-провайдера.'); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)))
    throw new HttpError(503, 'Провайдер должен использовать HTTPS.');
  const timeoutMs = options.timeoutMs ?? 45000, maxTokens = options.maxTokens ?? 6000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 16000)
    throw new HttpError(503, 'Некорректный лимит ИИ-запроса.');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    signal.throwIfAborted();
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST', redirect: 'error',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${config('AI_API_KEY')}`},
      body: JSON.stringify({model: config('AI_MODEL', 'gpt-4.1-mini'), messages, max_tokens: maxTokens,
        ...(options.structured ? {response_format: {type: 'json_object'}} : {}),
        ...(url.hostname === 'integrate.api.nvidia.com' ? {chat_template_kwargs: {enable_thinking: false}} : {}),
      }), signal,
    });
  } catch { throw new HttpError(503, 'ИИ-запрос отменён или провайдер не ответил вовремя. Повторите запрос.'); }
  if (!response.ok) throw new HttpError(502, `Ошибка ИИ-провайдера (${response.status}). Проверьте серверную конфигурацию.`);
  try {
    const data = z.object({choices:z.array(z.object({finish_reason:z.string().nullable().optional(),message:z.object({content:z.string()})}))}).parse(await response.json());
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length' || typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new Error('Invalid completion');
    return choice.message.content;
  } catch { throw new HttpError(502, 'Провайдер вернул неполный или некорректный ответ. Повторите запрос.'); }
}
