# Online Tests and Prose Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локально реализовать создание онлайн-контрольных, их выполнение и отражение в прогрессе, связные конспекты и безопасную адаптацию ИИ без потери старых данных.

**Architecture:** Сохранить Material/Assignment/AssessmentAttempt и их защиту; добавить строгий профиль single-choice и отдельную проекцию прогресса контрольных. Для длинной генерации добавить сохраняемые задания и отдельный Node-worker, а для конспектов — совместимый новый вариант содержимого. Общее ядро формул применяется к отображению и экспорту, но не подменяет проверку фактов.

**Tech Stack:** Существующие Next.js 16.4.1, React 19.2.6, TypeScript 5.9.3, Node >=22.13, Prisma 6.19/SQLite, Zod, KaTeX, DOCX/pdf-lib, Vitest/Playwright. Использовать установленный tsx 4.22.1 для worker. Для экспорта явно объявить прямые зависимости unified 11.0.5 и remark-parse 11.0.0 (уже установлены транзитивно); для серверных изображений формул: @mathjax/src 4.1.3, @mathjax/mathjax-newcm-font 4.1.3 и sharp 0.35.4, с фиксацией lockfile при реализации, не при планировании.

**Spec:** `docs/superpowers/specs/2026-10-23-online-tests-and-prose-notes-design.md` (утверждено). Результаты эксперимента: `C:/Users/XxX/Documents/ChatGPT/конференция/outputs/NVIDIA-Nemotron-adaptation-2026-10-23.md`.

## Global Constraints

- «Рабочий сайт пока не менять»: никаких SSH, деплоя, смены провайдера, чтения runtime.env или доступа к настоящей базе. Только локальные синтетические fixtures.
- «Не удалять пользователей, чаты, старые материалы, группы, назначения, ответы или историю»: аддитивные миграции; прошлые SQL-миграции неизменяемы.
- Новые контрольные: 10 вопросов по умолчанию, диапазон 5–30, четыре различных варианта, ровно один ключ, ровно 1 балл за верный выбор, без свободных критериев ИИ.
- Преподаватель подтверждает черновик перед выдачей; одна попытка, скрытые решения и 45 минут по умолчанию. Снимок выдачи неизменяемый.
- DOCX/PDF убрать только из контрольных, включая прямые API; экспорт личных конспектов и самостоятельных рабочих листов сохранить.
- Обычный конспект: цель 700–1000 слов, валидатор 700–1100, ориентир примерно 2–3 A4 при читаемом шаблоне. Старые v1/v2 заметки не переписывать.
- Баллы, проценты и прогресс считает сервер, без ИИ. «Незавершённую попытку нельзя считать неверной выполненной работой». Mastery тренировок не смешивать с результатами контрольных.
- До разрешённого раскрытия ключей не отдавать правильные варианты/пояснения через ученические DTO, HTML, экспорт или прогресс.
- Глобально не более 2 выполняемых/проверяемых генераций, у пользователя не более 1 активной. Одна repair-попытка, upstream timeout 120000 ms, общий deadline 300000 ms. Значения ограничивают ресурсы, не гарантируют скорость NVIDIA.
- Секреты не в Git/файлах результатов/клиенте. NVIDIA trial — только отдельная оценка. Никаких новых онлайн-запросов автоматически из CI или обычных тестов.
- Основной целевой runtime — Node/VPS. Не публиковать Sites; сохранить сборку cloud-адаптера и старые возможности, а Node-only jobs/рендер формул явно объявлять неподдерживаемыми на D1, не оставлять вечные queued-задания.
- Перед кодом читать AGENTS.md и релевантные локальные Next.js docs. Не использовать Next after() или detached Promise как надёжную очередь.

## Review Focus

1. Старая смешанная контрольная с незавершённой попыткой после миграции сохраняет ID, черновик, таймер и возможность завершения: T5/T9.
2. Повтор создания задания, отмена одновременно с завершением и перезапуск worker не создают лишний Material и не заменяют новый ввод старым ответом: T3/T4/T7.
3. Более новая попытка pending_review не превращается в нулевую оценку и не подменяется старой оценкой; повторный submit/GET не удваивает прогресс: T6.
4. LaTeX в коде, кириллица в подписи, скрытые JSON-символы и вредоносная HTML/TeX-ссылка не искажают текст и не вызывают внешнюю загрузку: T1/T8.
5. Ученик после выхода из группы видит свою историю, а преподаватель — только работы своих классов, без чужих результатов через фильтр studentId: T6.

## File Structure and Dependency Order

- `lib/content/math.ts`, `components/content/markdown.tsx`, `lib/ai/client.ts`: нормализация/валидация текста, общий экранный рендер и HTTP-клиент провайдера. T1.
- `lib/assessment/online.ts`, `lib/notes/article.ts`: входные/выходные контракты новых материалов и промпты, без БД и UI. T2.
- `lib/generation/{contracts,service,worker,http}.ts`, `scripts/generation-worker.ts`: задания, leases, API и ограниченное исполнение. T3.
- `components/assessment/{create-test,online-editor}.tsx`, `components/generation/{status,use-generation-job}.tsx`: преподавательский сценарий. T4.
- `lib/assessment/presentation.ts`, существующие store/service/projection/question-input: неизменяемое представление вариантов и ученик. T5.
- `lib/learning/assessment-progress.ts`, `components/learning/assessment-progress.tsx`: отдельные DTO/сводки контрольных, включённые в существующие progress/analytics. T6.
- `components/notes/{article-editor,article-preview}.tsx` и существующие form/content/editor: связный конспект и совместимость. T7.
- `lib/notes/{export-blocks,export-math,export-docx,export-pdf}.ts`: безопасные блоки документа и серверные изображения формул. T8.
- `e2e/online-tests.spec.ts`, `e2e/prose-notes.spec.ts`, `docs/ops/online-learning-local.md`: сквозная приёмка и инструкция без деплоя. T9.
- Общие изменения точечно: `app/api/[...path]/route.ts`, `app/api/learning/[...path]/route.ts`, `lib/materials/content.ts`, `lib/domain.ts`, `lib/export.ts`, `prisma/schema.prisma`, конфиги алиасов/пакетов и существующие компоненты. Не переписывать монолитные файлы целиком.

---

### Task 1: Общий рендер математики и адаптер провайдера

**Files:** Create `lib/content/math.ts`, `components/content/markdown.tsx`, `lib/ai/client.ts`, `tests/content-math.test.ts`, `tests/ai-client.test.ts`; modify `lib/ai.ts`, `components/workspace/chat.tsx`.

**Interfaces:** `normalizeMathMarkdown(source:string):string`; `assertSafeMathText(value:unknown):void`; `MarkdownContent({source,inline?})`; `requestCompletion(messages:ConversationMessage[], options?:{structured?:boolean,signal?:AbortSignal,timeoutMs?:number,maxTokens?:number}):Promise<string>`. Последние два значения по умолчанию 45000 и 6000, для job задаются явно. NVIDIA endpoint включает reasoning=false; другим endpoint не посылать NVIDIA-only kwargs.

Точные базовые assertions:

~~~ts
expect(normalizeMathMarkdown('\\(x+1\\)')).toBe('$x+1$');
expect(normalizeMathMarkdown('\u0060\\(x\\)\u0060')).toBe('\u0060\\(x\\)\u0060');
expect(() => assertSafeMathText('x\right')).toThrow();
~~~

Во второй строке U+0060 задаёт обратные кавычки inline-кода. В третьей строке намеренно используется JS CR, имитирующий испорченный JSON.

- [ ] **1. Write failing tests:** `legacy_delimiters_render_and_code_is_unchanged` проверяет KaTeX, idempotence и fenced/inline code; `json_latex_controls_are_rejected` отклоняет CR/FF/backspace и ошибочный tab-command; `cyrillic_arrow_label_renders` требует text-обёртку; `unsafe_markup_is_not_executed` исключает raw HTML/опасные ссылки. `nvidia_request_disables_thinking` перехватывает fetch, проверяет false, отсутствие kwargs у Cloudflare, abort/timeout/length и отсутствие ключа в ошибках.
- [ ] **2. Red:** `npx vitest run tests/content-math.test.ts tests/ai-client.test.ts` — новые импорты/поведение отсутствуют, зафиксировать ожидаемое падение.
- [ ] **3. Implement:** перенести клиент в отдельную функцию, сохранив прежний интерфейс LiveAIProvider; использовать безопасный ReactMarkdown/KaTeX (`trust:false`, без raw HTML). Нормализация не исправляет математический смысл; после JSON.parse подозрительные управляющие символы отклоняются.
- [ ] **4. Green:** повторить тесты плюс `tests/notes-generation.test.ts` и `tests/assessment-generation.test.ts`; старые сообщения/провайдеры остаются совместимыми.
- [ ] **5. Commit:** только файлы T1, сообщение `feat: add safe shared math rendering and provider client`.

### Task 2: Контракты онлайн-теста и связного конспекта

**Files:** Create `lib/assessment/online.ts`, `lib/notes/article.ts`, `tests/online-test-generation.test.ts`, `tests/notes-article.test.ts`; modify `lib/materials/content.ts`, `lib/domain.ts`, `lib/ai.ts`.

**Interfaces:** `OnlineTestInput={title,subject,grade,count=10,difficulty='Средний',clarifications=''}`; `buildOnlineTestMessages(input,invalidReply?):ConversationMessage[]`; `parseOnlineTestReply(raw,input):AssessmentDocument`; `canonicalizeQuizOptionIds(doc):AssessmentDocument` заменяет ID опций и ключи только у нового снимка, не мутируя аргумент. `NotesArticleDocument={schemaVersion:3,kind:'notes-article',demo:boolean,bodyMarkdown:string}`; `NotesArticleInput={title,subject,grade,clarifications:''}`; `buildArticleMessages(input,invalidReply?)`; `validateNotesArticle(raw,{ready:boolean}):NotesArticleDocument`; `parseArticleReply(raw):NotesArticleDocument`. Заголовок материала берётся из формы, не дублируется как независимый источник истины.

Assertion fixtures: `expect(() => parseOnlineTestReply(fiveQuestionJson, {...input,count:10})).toThrow()`; `expect(() => validateNotesArticle({schemaVersion:3,kind:'notes-article',demo:false,bodyMarkdown:'Короткий ответ'},{ready:true})).toThrow()`. `fiveQuestionJson` — полный валидный fixture на 5 вопросов, чтобы причина отказа была именно count.

- [ ] **1. Write failing tests:** single/4/1-point/unique constraints, исключение критериев и short/open; старые ошибочные fixtures первого прогона отклоняются. Канонизация сохраняет выбранные правильные подписи, создаёт непрозрачные UUID и не меняет исходник. Статья принимается с >=4 разделами и 700–1100 словами, отклоняются пустота/Q&A-заглушка/неожиданный язык для русской математики/биологии; legacy v1/v2 читаются без переписывания.
- [ ] **2. Red:** `npx vitest run tests/online-test-generation.test.ts tests/notes-article.test.ts tests/material-policy.test.ts` — новые контракты пока отсутствуют.
- [ ] **3. Implement:** использовать прежний AssessmentDocument для single-профиля и отдельный новый discriminator для статьи; добавить методы провайдера для обоих форматов, не ломая legacy-методы. Генерация возвращает только черновик; mock явно demo, не «качественный ИИ». Для статьи цель 700–1000 слов, для теста обязательны предметная тема и отдельное пояснение ключа.
- [ ] **4. Green:** запустить указанные тесты и все `tests/assessment-*.test.ts`, `tests/notes-*.test.ts`; обновлять только действительно изменённые ожидания, не ослаблять старые проверки доступа.
- [ ] **5. Commit:** файлы T2, `feat: define online quiz and prose notes content contracts`.

### Task 3: Сохраняемые генерации, API и worker

**Files:** Create `lib/generation/{contracts,service,worker,http}.ts`, `scripts/generation-worker.ts`, `scripts/ops/edupilot-generation-worker.service`, `tests/generation-{api,worker,migration}.test.ts`, `prisma/migrations/202610230001_generation_jobs/migration.sql`; modify `prisma/schema.prisma`, `app/api/[...path]/route.ts`, `lib/ai.ts`, `.env.example`, `package.json`, `package-lock.json`; sync additive `drizzle` migration via existing script.

**Interfaces:** `CreateGeneration={requestId:UUID,kind:'test'|'notes',input:OnlineTestInput|NotesArticleInput}`; `GenerationJobDTO={id,kind,state,materialId?:string,error?:{code,message,retryable},createdAt,updatedAt}` без исходного ответа/ключа. `createGeneration(actor,input):Promise<GenerationJobDTO>`, `getGeneration(actor,id)`, `cancelGeneration(actor,id)`, `processGenerationBatch({clock,provider,concurrency=2}):Promise<number>`, `recoverExpiredJobs(clock):Promise<number>`. HTTP: POST/GET `/api/generation-jobs`, GET `/api/generation-jobs/:id`, POST `/:id/cancel`; метод списка возвращает только свои последние 50 заданий. Завершение создаёт Material draft и terminal job в одной транзакции, возвращает materialId.

Assertions на временном fixture: `expect((await createGeneration(teacher,payload)).id).toBe((await createGeneration(teacher,payload)).id)`; `expect(outsiderRead.status).toBe(403)`; после двух конкурентных worker `expect(provider.maxConcurrent).toBeLessThanOrEqual(2)` и `expect(createdMaterials).toHaveLength(1)` для одного requestId.

- [ ] **1. Write failing tests:** только teacher может kind=test, notes — владелец любой роли; CSRF/owner/outsider; одинаковый requestId+payload даёт один job/material, другой payload — 409. Частичный unique index запрещает >1 queued/running/validating на пользователя. Два worker не превышают общий предел 2; cancel-vs-complete создаёт максимум один результат; restart/просроченный lease завершает задачу понятной retryable-ошибкой, не повторяет upstream бесконтрольно. Материал, не прошедший один repair, не становится ready. D1-runtime возвращает явную недоступность jobs.
- [ ] **2. Red:** `npx vitest run tests/generation-api.test.ts tests/generation-worker.test.ts tests/generation-migration.test.ts`; все БД — из временного fixture, настоящие env/файлы не читать.
- [ ] **3. Implement:** GenerationJob с owner/requestId/inputHash/state/inputJson/resultMaterialId/errorCode/attemptCount/lease/deadline/timestamps. Claim/update и finish/cancel через атомарные условия; upstream 120 с, общий бюджет 300 с, heartbeat 30 с, lease 180 с. На crash истёкший job становится failed с возможностью явного нового запуска. Максимум два upstream-вызова на job (первый+repair). Перенести уже установленный tsx 4.22.1 в runtime dependencies; `npm run generation:worker` запускает `node --import tsx scripts/generation-worker.ts`. У worker отдельный процесс, SIGTERM/abort и ограниченная конкуренция; systemd-файл только шаблон, не установка.
- [ ] **4. Green:** повторить tests, `npx prisma generate`, `node scripts/sync-cloud-migrations.mjs`, `npm run typecheck`, `npm run sites:build`. Проверить CLI worker на изолированной БД с fake provider; готовый job только draft, без автоназначения. В api.session ai-capabilities добавить jobsAvailable; default `GENERATION_JOBS_ENABLED=false`, локальная инструкция включает явно.
- [ ] **5. Commit:** файлы T3 и новая неизменяемая миграция, `feat: add durable generation jobs and bounded worker`.

### Task 4: Создание и подтверждение контрольной преподавателем, отключение её экспортов

**Files:** Create `components/assessment/create-test.tsx`, `components/assessment/online-editor.tsx`, `components/generation/status.tsx`, `components/generation/use-generation-job.tsx`, `tests/online-test-ui.test.ts`, `tests/control-test-export-policy.test.ts`; modify `components/workspace/materials.tsx`, `components/assignments/{teacher,downloads}.tsx`, `lib/assignments/{service,sheets}.ts`, `lib/export.ts`, `app/api/[...path]/route.ts`, `app/globals.css`.

**Interfaces:** `useGenerationJob():{jobs,start(kind,input),cancel(id),refresh(),busy,error}` использует DTO T3 и не хранит ключи. `CreateOnlineTest({onCreated})`; `OnlineTestEditor({material,onChange,onSave})`. Новый материал помечается `metadataJson.onlineTestVersion=1`; старые mixed-работы используют прежний редактор. Любая правка сбрасывает подтверждение, createAssignment привязывается к проверенной версии, канонизирует новый снимок через T2.

Assertions: `expect(controlExport.status).toBe(410)`; `expect(worksheetExport.status).toBe(200)`; `expect(unconfirmedAssignment.status).toBe(422)`. Fixture последнего запроса имеет корректные остальные поля, но не подтверждённые ключи.

- [ ] **1. Write failing tests:** форма имеет тему/предмет/класс/уточнения и дополнительные count/difficulty, но не criteria/questionTypes/answerLines. Сгенерированный черновик требует просмотра/подтверждения. После изменения ключа выдача без нового подтверждения отклоняется. Старый и новый Material type=test не скачиваются через docx/pdf прямой API (410); assignment.kind=test не обходит через worksheet-snapshot. Standalone worksheet/lesson/notes сохраняют экспорт.
- [ ] **2. Red:** `npx vitest run tests/online-test-ui.test.ts tests/control-test-export-policy.test.ts tests/assignment-api.test.ts`.
- [ ] **3. Implement:** короткая форма, статус job, библиотека готовых draft, просмотр/редактирование и отдельная выдача группе; стандартный стиль приложения сохранить. Завершение старого job при изменённой форме только предлагает открыть сохранённый материал, не подменяет текущие параметры. Убрать кнопки скачивания контрольных у обеих ролей и закрыть все соответствующие API, не удаляя старые материалы.
- [ ] **4. Green:** повторить тесты; обновить существующие `answer-sheet*.test.ts` только в части контрольных экспорта, сохранить низкоуровневые и worksheet-проверки. Ручной teacher preview не создаёт AssessmentAttempt и не попадает в прогресс.
- [ ] **5. Commit:** файлы T4, `feat: add teacher online test creation and confirmation flow`.

### Task 5: Ученический тест, устойчивый порядок ответов и защита ключей

**Files:** Create `lib/assessment/presentation.ts`, `tests/assessment-presentation.test.ts`, `prisma/migrations/202610230002_attempt_option_order/migration.sql`; modify `prisma/schema.prisma`, `lib/assessment/{store,service,projection,public}.ts`, `components/assessment/question-input.tsx`, `components/assignments/{attempt,detail}.tsx`, `tests/assessment-disclosure.test.ts`, `tests/assessment-concurrency.test.ts`; sync additive drizzle SQL.

**Interfaces:** `buildOptionOrder(doc,variantId,random?):Record<questionId,string[]>`; `applyOptionOrder(publicQuestions,order):PublicQuestion[]`. New `AssessmentAttempt.optionOrderJson` default `{}`; пустое значение у старых строк сохраняет исходный порядок. Созданные после T4 снимки имеют непрозрачные ID опций. Grade и draft используют ID, не позицию; порядок хранится на сервере вместе со стартом и остаётся прежним после GET/reload.

Assertions: `expect(afterReload.questions).toEqual(beforeReload.questions)`; `expect(emptySubmit.status).toBe(422)`; `expect(JSON.stringify(studentDto)).not.toMatch(/correctOptionIds|explanation|teacherCriteria/)` до раскрытия. Для пяти single-вопросов таблица server-grade fixtures: `[allCorrect,5]`, `[twoWrong,3]`, `[allWrong,0]` при `maxScore=5`.

- [ ] **1. Write failing tests:** shuffle меняет порядок без потери/дубликатов, по одному ключу и правильный балл в каждой перестановке. После сохранения/reload порядок и ответы прежние; старый mixed snapshot/draft с исходными ID завершается. До разрешения serialized student DTO не содержит correctOptionIds/explanation/teacher criteria, включая результат и progress. Пустая сдача 422, expired-драфт финализируется, повторный submit идемпотентен, лимит попыток и disclosure-lock остаются действующими.
- [ ] **2. Red:** `npx vitest run tests/assessment-presentation.test.ts tests/assessment-start.test.ts tests/assessment-submit.test.ts tests/assessment-disclosure.test.ts tests/assessment-concurrency.test.ts`.
- [ ] **3. Implement:** серверный Fisher–Yates с crypto.randomValues и сохранением order в атомарном старте. Подключить общий MarkdownContent к условиям/опциям/разрешённым объяснениям; радиокнопки, счётчик отвеченных, таймер, навигация/сохранение и результат остаются доступными с клавиатуры. Legacy mixed-типы не преобразовывать и не удалять.
- [ ] **4. Green:** те же tests плюс `tests/assessment-d1.test.ts`, `tests/assignment-ui.test.ts`; повторное раскрытие/новый старт/чужая роль проверяются сервером, а не только UI.
- [ ] **5. Commit:** файлы T5, `feat: harden student quiz presentation and stable option order`.

### Task 6: Контрольные в прогрессе и аналитике без двойного учёта

**Files:** Create `lib/learning/assessment-progress.ts`, `components/learning/assessment-progress.tsx`, `tests/assessment-progress.test.ts`, `tests/assessment-progress-api.test.ts`; modify `app/api/learning/[...path]/route.ts`, `components/learning/progress.tsx`, `components/learning/shared.tsx`.

**Interfaces:** `AssessmentProgressEntry={attemptId,assignmentId,studentId,subject,topic,grade,classId,className,submittedAt,number,status,completionKind,score:number|null,maxScore:number|null,percentage:number|null,durationMs}`; `AssessmentProgressDTO={history,latest,totals:{completedWorks,awaitingReview,score,maxScore,percentage},topics}`. `studentAssessmentProgress(userId):Promise<AssessmentProgressDTO>`; `teacherAssessmentProgress(teacherId,{classId?,studentId?}):Promise<AssessmentProgressDTO>`. Подключить к существующим progress/analytics под отдельным ключом `assessments`; legacy metrics/training DTO без изменения семантики.

Assertions для двух попыток одной работы 2/5→4/5: `expect(dto.history).toHaveLength(2)`; `expect(dto.latest).toHaveLength(1)`; `expect(dto.totals.percentage).toBe(80)`. Для следующей pending_review: `expect(dto.latest[0].percentage).toBeNull()`; `expect(dto.totals.awaitingReview).toBe(1)`; баллы прошлой попытки в totals этой работы не учитываются.

- [ ] **1. Write failing tests:** graded=3/5 даёт 60%; повторные GET/submit не меняют число записей; сводка использует последнюю submitted/expired попытку, история хранит все. Более новая pending_review показывает null/ожидание, не 0 и не старый процент. Draft/teacher preview не входят; demo тренировок не смешивается. Выход ученика из группы не стирает его собственную историю; учитель видит только свои классы, outsider studentId/classId — 403. DTO не содержит содержимого ключей/ответов/решений.
- [ ] **2. Red:** `npx vitest run tests/assessment-progress.test.ts tests/assessment-progress-api.test.ts tests/learning-api.test.ts tests/learning-metrics.test.ts`.
- [ ] **3. Implement:** читать финализированные AssessmentAttempt через ограниченные JOIN/chunk-запросы, не вести второй счётчик и не создавать TrainingAttempt. Latest сортировать submittedAt, затем id для стабильности; pending latest исключается из баллов/знаменателя, отдельно считается awaitingReview. Группировать по данным назначения, не угадывать тему тренировочного банка. Добавить историю/фильтры/проценты и пояснение «последняя завершённая попытка».
- [ ] **4. Green:** повторить tests; искусственные история 2/5 → 4/5 даёт одну работу 80% и две строки истории; pending затем teacher review обновляет данные без дополнительной строки. Проверить 100+ учеников без безграничного числа SQL-плейсхолдеров.
- [ ] **5. Commit:** файлы T6, `feat: include assigned tests in student and teacher progress`.

### Task 7: Создание, чтение и редактирование связного конспекта

**Files:** Create `components/notes/article-editor.tsx`, `components/notes/article-preview.tsx`, `tests/notes-article-ui.test.ts`, `tests/notes-article-api.test.ts`; modify `components/notes/{form,editor}.tsx`, `components/workspace/materials.tsx`, `lib/materials/content.ts`, `lib/domain.ts`, `app/api/[...path]/route.ts`, `app/globals.css`.

**Interfaces:** T2 NotesArticleDocument/T3 jobs. `NotesArticlePreview({document})`; `NotesArticleEditor({material,onSave})` сохраняет через существующий version/CAS Material API. Прежний NotesEditor остаётся для v1/v2; новый discriminator проверяется до общей ветки AssessmentEditor.

Assertions: `expect(articleHtml).toContain('katex')` для math fixture; `expect(articleHtml).not.toContain('Минут')`; `expect(staleSave.status).toBe(409)`; `expect(legacyAfterSave.contentJson).toEqual(legacyBeforeSave.contentJson)` при сохранении неизменённого legacy fixture.

- [ ] **1. Write failing tests:** новая форма тема/предмет/класс/уточнения, без обязательных тезисов/самопроверки/минут/оборудования; целый bodyMarkdown показывается как статья с заголовками/абзацами/формулами. v1/v2 рендерятся и сохраняются без потери полей; v3 не попадает в AssessmentEditor. Только владелец редактирует; после позднего job/stale save новый ввод не заменяется; job failed не создаёт ready Material. DOCX/PDF кнопки конспекта остаются.
- [ ] **2. Red:** `npx vitest run tests/notes-article-ui.test.ts tests/notes-article-api.test.ts tests/notes-ui.test.ts tests/material-policy.test.ts`.
- [ ] **3. Implement:** простой ввод + status T3, статья с общей математикой, редактирование цельного текста, версия/конфликт сохранения. ИИ-предупреждение и draft-статус не означают независимую проверку фактов. Не усиливать качество фиктивными «прочитал учебник» или «подтверждённый ответ». Прежние статьи не массово перегенерировать.
- [ ] **4. Green:** повторить tests; адаптировать только ожидания старой формы, сохранить legacy-editor/export coverage. Результат 70+ секунд должен открываться из библиотеки после ухода и возврата.
- [ ] **5. Commit:** файлы T7, `feat: add full prose notes creation and compatible editing`.

### Task 8: Экспорт связного конспекта с читаемыми формулами

**Files:** Create `lib/notes/{export-blocks,export-math,export-docx,export-pdf}.ts`, `lib/notes/export-math-cloud.ts`, `tests/notes-article-export.test.ts`, `tests/notes-math-assets.test.ts`; modify `lib/export.ts`, `tsconfig.json`, `vite.config.ts`, `package.json`, `package-lock.json`, `next.config.ts` если нужны serverExternalPackages.

**Interfaces:** `articleToExportBlocks(doc):ExportBlock[]` (heading/paragraph/list/code/math; вложенные inline text/emphasis/math); `renderFormulaAsset(latex:string,{display:boolean}):Promise<{png:Uint8Array,width:number,height:number}>`; `exportNotesArticleDocx(material):Promise<Uint8Array>` и `exportNotesArticlePdf(material):Promise<Uint8Array>`. Остальные material exports не меняют контракт.

Assertions: `expect(Array.from(asset.png.slice(0,8))).toEqual([137,80,78,71,13,10,26,10])`; `expect(asset.width).toBeGreaterThan(0)`; `await expect(renderFormulaAsset('x'.repeat(2001),{display:false})).rejects.toThrow()`; DOCX ZIP содержит `word/media/` для формулы, PDF имеет >=1 страницу. Эти проверки не заменяют визуальный осмотр.

- [ ] **1. Write failing tests:** кириллица/заголовки/абзацы/list/inline и display дробь/степень/подпись стрелки; ни сырых `$`/Markdown-маркеров, ни обрезанных изображений в готовых файлах. Небезопасные require/href/includegraphics и чрезмерные формулы отклоняются без сети; legacy notes и standalone worksheet экспорт остаётся, type=test всё ещё 410.
- [ ] **2. Red:** `npx vitest run tests/notes-article-export.test.ts tests/notes-math-assets.test.ts tests/control-test-export-policy.test.ts`.
- [ ] **3. Implement:** безопасное дерево Markdown через unified/remark-parse с существующими remark-gfm/remark-math, локальный MathJax TeX→SVG (base/ams, без autoload/require/URL), sharp SVG→PNG, изображения в docx/pdf-lib; лимиты 2000 символов/формулу, 128 формул/документ, отказ с понятной ошибкой вместо битого файла. Прямые зависимости объявить по Tech Stack и зафиксировать lockfile, не обновлять Next/React. Читаемый A4-шаблон: Noto Sans 11 pt, поля 18 mm, заголовки не отрывать от первого абзаца, формулы не масштабировать за ширину страницы. На cloud runtime использовать явный capability/stub без загрузки native sharp; старые экспорты не отключать.
- [ ] **4. Green + visual QA:** unit tests, `npm run typecheck`, Node build и Sites build. До создания/рендера проверочных файлов прочитать skills documents/pdf, затем сгенерировать синтетические DOCX/PDF во временный output, отрендерить все страницы, осмотреть кириллицу/формулы/переносы/объём. Не выдавать extractText за визуальную проверку. Основной критерий читаемость; диапазон 2–3 страниц уточнить на реальном обычном примере, не уменьшать шрифт скрытно.
- [ ] **5. Commit:** файлы T8, `feat: export prose notes with formatted text and math assets`.

### Task 9: Сквозная локальная приёмка, миграционный прогон и handoff

**Files:** Create `e2e/online-tests.spec.ts`, `e2e/prose-notes.spec.ts`, `docs/ops/online-learning-local.md`, `tests/online-learning-preservation.test.ts`; modify fixtures/config только для отдельного локального тестового экземпляра и поддержать старые E2E-ожидания новых контролов.

**Interfaces:** обычные npm scripts и HTTP-контракты T3–T8. Все аккаунты example.invalid и временная SQLite из fixture; перед браузерным запуском выставить EDUPILOT_TEST_URL на изолированный localhost. Управление production-машиной отсутствует.

Assertions: `expect(oldRowsAfterMigration).toEqual(oldRowsBeforeMigration)` для manifest всех прежних таблиц/полей; `expect(restoredManifest).toEqual(oldRowsBeforeMigration)` после восстановления синтетической копии. Новые поля не включать в legacy manifest. В E2E проверять `await expect(page.getByRole('radio')).toHaveCount(40)` для теста по умолчанию и отсутствие второго результата после повторной отправки.

- [ ] **1. Write failing acceptance tests:** teacher генерирует/правит/подтверждает/выдаёт → два student выполняют с выбором, один сохраняет и перезагружает → одинаковые баллы у учителя и ученика → одна запись latest в прогрессе → экспорт контрольной недоступен. Notes: generate job, уход/возврат, редактор, DOCX/PDF; old mixed active attempt и old v1/v2 notes продолжают работать. Проверить прямые закрытые URL и API, не только кнопки.
- [ ] **2. Red / preservation fixture:** создать до-миграционную синтетическую БД с аккаунтами, чатами, материалами, активной попыткой и завершённой историей; применить новые миграции, сравнить manifest всех старых строк и проверить backup/restore на этой же временной копии. Падения должны отражать отсутствующие возможности, а не случайную ошибку fixture.
- [ ] **3. Implement remaining integration only:** локальный запуск app+worker, журнал ошибок без секретов, инструкция включения/остановки worker и совместимости. Ничего не устанавливать на VPS. Документировать, что не все реальные ответы Nemotron качественны и производственный провайдер не выбран.
- [ ] **4. Verify:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run sites:build`, затем `npm run test:e2e` на fixture URL. Реальные UI осмотреть через доступный браузерный инструмент, сохранить доказательные скриншоты. Если отдельный оценочный онлайн-прогон будет утверждён вместе с этим планом: максимум 8 NVIDIA-запросов суммарно, включая repair; только синтетика/DPAPI, без VPS, без последующего бесконечного улучшения промпта. Иначе только mock, отметить это явно. Не запускать такую оценку автоматически из CI.
- [ ] **5. Commit + review:** только проверенные файлы T9, `test: verify online learning workflows and data preservation`. При Native — один независимый whole-branch review после полного прогона; при Subagent-driven — task gates и финальный branch review. Исправления проверяются повторно. Передавать локальный результат и отчёт; push/деплой только по отдельному запросу.

## Self-Review and Handoff

- Coverage: spec 4→T2/T4; 5→T1/T5; 6→T6; 7→T2/T7/T8; 8→T1/T2/T3; 9→T3/T4/T7; 10→T3/T5/T9; acceptance 11→T1–T9. Экспортный запрет проверяется на обоих путях, не только material.type.
- Interfaces: новые формы используют CreateGeneration.kind/input и DTO, результат — materialId. Статья всегда discriminator v3/notes-article, контрольная сохраняет прежний AssessmentDocument. Публичный progress никогда не возвращает приватный GradeResult.items.answer.
- Review Focus привязан к указанным задачам/проверкам. В плане нет обязательного Redis, смены framework-версий, удаления старой базы или публикации.
- Worker/runtime зависимости и math/export зависимости входят в задачи, которым нужны, а не отдельный бессодержательный setup.
- Ожидаемый способ исполнения пока не выбран. Рекомендация: Native (один исполнитель по задачам), потому что изменения тесно связаны общей схемой материалов, job-контрактом и API; это экономнее пересоздания контекста на каждый этап. В конце нужен независимый review.
- Перед реализацией пользователь должен проверить этот план и выбрать Native либо Subagent-driven. Если просит изменить объём/контракты, обновить план до кода. План не является отчётом об уже реализованных изменениях.

## Technical References for Implementation

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` и `.../03-api-reference/04-functions/after.md`: читать локальные версии, очередь не заменять after().
- MathJax Node/SVG: https://docs.mathjax.org/en/latest/server/components.html (локальные input/tex, output/svg, liteDOM; запретить динамическую загрузку TeX-расширений). Версии mathjax 4.1.3 подтверждены registry metadata при планировании.
- Для тестов использовать существующие `tests/helpers/platform.ts`, D1 contract fixtures и точные временные пути. Не переиспользовать настоящие пользовательские базы или файлы секретов в unit/E2E.
