# EduPilot Assignments and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать безопасное назначение, выполнение и проверку работ с сохранением старых материалов и результатов.

**Architecture:** Версионированные материалы и неизменяемый снимок назначения; отдельный сервис попыток с атомарными операциями и публичными DTO по белому списку. Старые QuizSession/QuizAttempt сохраняются, но не дают обхода новых правил.

**Tech Stack:** Next.js 16.4.1, React 19, TypeScript, Zod 3, Prisma 6.19, better-sqlite3, D1 batch, Vitest, Playwright.

**Spec:** `../specs/2026-10-17-assignment-safety-and-notes-design.md`, разделы 1–8, 11–13. Общие ограничения и публикация: `2026-10-17-stage1.md`.

## Global Constraints

- «Сохраняются все аккаунты, пароли, роли, чаты, материалы, вложения, назначения и результаты».
- «Текущая чистая рабочая копия используется без создания другого worktree».
- «Целевая публикация — VPS edupilotmfua.ru; старый приватный сайт Sites не обновляется, не перепубликуется и не получает копию новых пользовательских данных».
- «Создание презентаций и видео остаётся отключённым».
- «По умолчанию: одна попытка, 45 минут, раскрытие только вручную преподавателем и пока не разрешено».
- Лимит 1–10; длительность 5–240 минут; баллы вопроса 0–1000, сумма варианта 1–1000; 1–30 вопросов, 1–4 варианта, всего ≤100.
- Развёрнутый непустой ответ проверяет преподаватель. ИИ не определяет баллы объективных вопросов.
- Запрещены reset, повторный импорт, изменение применённых SQL-миграций и копирование локальной базы на VPS.

## Review Focus

1. Повтор startRequestId после завершения попытки не расходует новый номер; разные id в двух вкладках также возобновляют одну попытку — A4.
2. Потерянный ответ на submit и устаревший autosave не меняют уже сданную работу — A5.
3. Отчисленный ученик и тот же materialId в двух классах не получают чужой результат/снимок — A3/A7.
4. Старые answersJson и экспортные ссылки не возвращают ключи в обход новой политики — A6/A7.
5. Публикация решений одновременно со стартом или увеличением лимита не оставляет доступную повторную сдачу — A6.

## Карта файлов и договорённости

- `lib/materials/content.ts`: общий parser/union; `lib/assessment/schema.ts`: вопросы и ответы; `lib/notes/schema.ts`: контракт конспекта (полностью реализуется в N1); до N1 unknown notes-v2 не принимается как legacy.
- `lib/materials/policy.ts`: доступ; `lib/assessment/grading.ts`: чистое оценивание; `lib/assignments/service.ts`: назначения/домашние работы; `lib/assessment/service.ts`: жизненный цикл; `lib/assessment/projection.ts`: DTO.
- `lib/assessment/store.ts` и `lib/assessment/local-store.ts`: параметризованные SQL-batch и локальная native-транзакция. Нативный импорт только в local-store, не в Worker bundle.
- `lib/assignments/contracts.ts`: общие AssignmentStudentDTO/TeacherAssignmentDTO/SubmissionDTO без runtime-импортов; `lib/assessment/public.ts`: PublicQuestion/AttemptDTO без приватных полей; `lib/assignments/http.ts`: HTTP-диспетчер внутри существующего API после csrf/requireUser/rateLimit.
- `components/assignments/{list,detail,attempt,teacher}.tsx`, `components/assessment/{editor,question-input}.tsx`: профильный UI.
- Изменяемые интеграции: `lib/domain.ts`, `lib/ai.ts`, `app/api/[...path]/route.ts`, `components/edupilot-app.tsx`, `components/workspace/{materials,classes}.tsx`, `app/[[...page]]/page.tsx`, `app/globals.css`, `prisma/schema.prisma`.

Стабильные контракты (типы экспортируются из указанных модулей, не создаются разные локальные копии):

- `AssessmentDocument = {schemaVersion:2,kind:'assessment',demo:boolean,instructions:string,variants:{id:string,label:string,questions:Question[]}[]}`.
- `Question` — discriminated union по `kind: 'single'|'multiple'|'short'|'numeric'|'open'`; общие `id,prompt,points,answerLines`. Выбор: `options:{id,label}[]`, приватный `correctOptionIds:string[]`; short/numeric: `acceptedAnswers:string[]`; open: `criteria:string`. Приватное `explanation?:string` отдельно от prompt.
- `AnswerMap = Record<string,string|string[]>`; `validateAnswers(document,variantId,answers): AnswerMap` проверяет типы, неизвестные вопросы/id, дубликаты множественного выбора; нет данных от другого варианта.
- `MaterialContent = LegacyDocument | AssessmentDocument | NotesDocument`. `parseMaterialContent(raw:unknown): MaterialContent`; legacy — существующий documentSchema без изменения JSON. NotesDocument появляется после N1; parser подключается там. `MaterialRecord.contentJson` использует этот union.
- `Actor={id:string,role:'teacher'|'student'}` экспортируется из policy.ts. `Clock=()=>Date` и `PrivateAttempt=AssessmentAttempt & {assignment:Assignment,snapshot:AssessmentDocument}` — из assessment/service.ts, default clock — серверное время. Результат сервиса приватен; HTTP получает только DTO из projection.
- `AssignmentPolicy={maxAttempts:number,durationMinutes:number,answerPolicy:'manual'|'after_due'|'after_last',dueDate:string|null}`. `AssignmentStudentDTO` содержит id, kind, title, classId/name, subject, teacherName, dueDate, policy, usedAttempts, bestScore и собственные состояния; до старта вопросов нет.
- `PublicQuestion={id:string,kind:Question['kind'],prompt:string,points:number,answerLines:number,options?:{id:string,label:string}[]}`. `AttemptDTO` содержит id, assignmentId, number, variantId, status, version, startedAt/expiresAt, свои answers, `questions:PublicQuestion[]` и разрешённый result. У result — score (null до окончательной проверки), autoScore, maxScore, teacherComments; поле solutions с поэлементными correct/answer/explanation существует только после разрешения. Ни один приватный Question/GradeResult не сериализуется напрямую. AssignmentStudentDTO не содержит snapshotJson; TeacherAssignmentDTO содержит приватный снимок и ученические результаты своего класса; SubmissionDTO — id/assignmentId/studentId/text/submittedAt/подтверждённая grade.

Все новые тесты используют `tests/helpers/platform.ts`: `openPlatformFixture(name): Promise<PlatformFixture>` с `call(path,method,body,cookie)`, `teacher`, `student`, `outsider`, `client`, `close()`. До импорта приложения fixture задаёт уникальные временные DATABASE_URL/STORAGE_DIRECTORY и AI_MODE=mock, применяет все SQL-миграции; создаёт только синтетические записи. Не читает рабочую локальную или серверную базу.

### Task 1: A1. Схема заданий и совместимое чтение

**Files:** Create `lib/assessment/schema.ts`, `lib/materials/content.ts`, `tests/assessment-schema.test.ts`; Modify `lib/domain.ts`, typed-reader ветви в `components/workspace/materials.tsx`, `lib/export.ts`; Test `tests/platform.test.ts`.

**Interfaces:** Produces `AssessmentDocument`, `Question`, `AnswerMap`, `validateAnswers`, `parseMaterialContent`; `validateAssessment(doc,{publishable:boolean}): AssessmentDocument` и `defaultAnswerLines(kind): number`. До N1 MaterialContent — legacy/assessment; N1 расширяет union.

- [ ] Написать тесты: `expect(parseMaterialContent(legacy)).toEqual(legacy)`; нулевые points сохраняются; 31 вопрос, 5 вариантов, >100 вопросов, разные суммы, дубликаты id/options и неверные ключи дают ошибку. Черновик с незаполненным ключом допускается только publishable=false; назначение — нет.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assessment-schema.test.ts --maxWorkers=1`; ожидать RED отсутствующих интерфейсов/проверок, не сбой окружения.
- [ ] Реализовать контракты и type narrowing читателей. legacy JSON не менять при чтении; неизвестный schemaVersion отвергать. `defaultAnswerLines`: single/multiple=1, short/numeric=2, open=6; разрешить 1–12.
- [ ] Повторить команду плюс `tests/platform.test.ts`; ожидать GREEN и сохранение чтения/экспорта legacy. Для новых assessment экспорт до пакета B использует безопасную обычную текстовую проекцию без ключей ученику, не падает на отсутствии sections.
- [ ] Commit `feat: add versioned assessment contracts and legacy readers` с только файлами задачи.

### Task 2: A2. Аддитивная миграция и тестовая база

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/202610170001_assignments/migration.sql`, `tests/helpers/platform.ts`, `tests/assignment-migration.test.ts`; Generate `drizzle/0003_assignments.sql`, `drizzle/meta/_journal.json` существующим sync-скриптом.

**Interfaces:** Produces поля Assignment: `kind='homework'`, `maxAttempts=1`, `durationMinutes=45`, `answerPolicy='manual'`, `solutionsReleasedAt DateTime?` (ручная публикация), `disclosureLockedAt DateTime?` (любое состоявшееся раскрытие), `closedAt DateTime?`, `version=1`, `snapshotJson Json?`, `materialVersion Int?`. Новые AssessmentAttempt и AssessmentStartRequest.

- [ ] Написать migration-тест: создать базу из трёх старых миграций с User/Session/Chat/Message/Material/FileAttachment/Assignment/Submission/Grade/QuizSession/QuizAttempt/Training*; сохранить manifest старых строк и полей; применить новую миграцию; `expect(afterOldColumns).toEqual(before)` и `integrity_check='ok'`, FK=0; старое назначение kind=homework.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assignment-migration.test.ts --maxWorkers=1`; ожидать RED отсутствующей миграции.
- [ ] Добавить nullable/default-поля и новые таблицы, не перестраивать и не очищать пользовательские таблицы. AssessmentAttempt: id, assignmentId, studentId, number, startRequestId, variantId, startedAt, expiresAt, status, version=1, draftAnswersJson, submittedAnswersJson?, submittedAt?, completionKind?, resultJson?, reviewJson?, reviewedAt?. Unique по (assignmentId,studentId,number) и (assignmentId,studentId,startRequestId); partial unique index на (assignmentId,studentId) WHERE status='in_progress'. AssessmentStartRequest: composite primary (assignmentId,studentId,requestId), attemptId FK и createdAt; это ledger алиасов повторного старта/возобновления, а не ещё одна попытка.
- [ ] Выполнить `node node_modules/prisma/build/index.js generate`, `node scripts/sync-cloud-migrations.mjs`, повторить тест; ожидать GREEN. Поля времени сериализовать согласованно с текущим Prisma adapter; тестировать чтение через Prisma и raw SQL, не смешивать ISO-text и epoch-ms молча.
- [ ] Commit `feat: add additive assignment and attempt persistence` с миграцией, схемой, fixture и тестом. Ранее применённые SQL-файлы неизменны.

### Task 3: A3. Роли, назначения и домашние работы

**Files:** Create `lib/materials/policy.ts`, `lib/assignments/contracts.ts`, `lib/assignments/service.ts`, `tests/material-policy.test.ts`, `tests/assignment-service.test.ts`; Modify `app/api/[...path]/route.ts`.

**Interfaces:** `canCreateMaterial(actor,type):boolean`, `canEditMaterial(actor,material):boolean`; `createAssignment(actor,classId,input):Promise<AssignmentStudentDTO|TeacherAssignmentDTO>`; `listAssignments(actor,kind?):Promise<AssignmentStudentDTO[]|TeacherAssignmentDTO[]>`; `readAssignment(actor,id):Promise<...>`; `submitHomework(actor,id,{text}):Promise<SubmissionDTO>`. Teacher DTO приватен и не наследуется ученическим DTO.

- [ ] Тесты: student generate/create/PATCH/duplicate для lesson/worksheet/test/review →403 до вызова mock AI; own notes разрешён; чужое →404. Два назначения того же материала имеют разные id/snapshots; отчисленный ученик →404. Некорректная dueDate →400, after_due без дедлайна →400; исходный material edit не меняет snapshot. Homework повторная сдача до grade/deadline разрешена, после —409/422.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/material-policy.test.ts tests/assignment-service.test.ts --maxWorkers=1`; ожидать RED.
- [ ] Реализовать доступ и снимок только для подтверждённого publishable assessment и точной materialVersion. Ключи утверждаются явным `keysConfirmed:true`; новая редакция материала сбрасывает подтверждение. Новое обычное homework сохраняет текущую Submission/Grade-модель. Материал test назначается только kind=test; иначе это обход таймера. Legacy test для обычной старой homework остаётся в прежнем read-only потоке, но новое назначение требует разметки.
- [ ] Повторить тесты; GREEN. Старые ученические teacher-only материалы доступны чтению/безопасному экспорту, но не изменению; старый тип запрещено менять PATCH-запросом. Доступ к материалам homework не даёт чтения чужих Submission.
- [ ] Commit `feat: enforce material roles and assignment ownership`.

### Task 4: A4. Атомарный старт, возобновление и лимит

**Files:** Create `lib/assessment/store.ts`, `lib/assessment/local-store.ts`, `lib/assessment/service.ts`, `tests/assessment-start.test.ts`, `tests/assessment-d1.test.ts`.

**Interfaces:** `SqlStatement={sql:string,params:(string|number|null)[]}`; `runAssessmentBatch(statements:SqlStatement[]):Promise<{rows:Record<string,unknown>[],changes:number}[]>`. `startAttempt(actor,assignmentId,{requestId:string},clock?:Clock):Promise<PrivateAttempt>`; `loadAttempt(actor,assignmentId,attemptId,clock?:Clock):Promise<PrivateAttempt>`.

- [ ] Тесты: два concurrent start с разными UUID → один attempt.id и одинаковый expiresAt; maxAttempts=1 запрещает второй номер после завершения; тот же UUID после завершения возвращает прежний id. UUID второго окна, ранее возобновившего попытку, тоже повторно возвращает её после завершения. Изменение закрытия/дедлайна между чтением и записью не допускает старт; deadline сокращает срок до min(duration,due).
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assessment-start.test.ts tests/assessment-d1.test.ts --maxWorkers=1`; ожидать RED. На локальной SQLite использовать разные соединения/worker, а не только Promise.all над синхронным одним соединением.
- [ ] Реализовать batch: условный INSERT попытки с проверкой enrolment, teacher ownership назначения, version/closed/deadline/лимита и отсутствия активной; затем INSERT ledger SELECT id созданной/активной попытки; затем SELECT по ledger. Повтор requestId сначала читается из ledger с проверкой текущего доступа. Номер MAX(number)+1 и count проверяются внутри INSERT, не только JS. Unique constraints остаются последней защитой. При конфликте перечитать безопасно, не делать слепой повтор create.
- [ ] Для local-store выполнять список в одной better-sqlite3 transaction().immediate(); для D1 — native prepared `.batch()`, без интерактивного Prisma `$transaction`. D1-документация: [batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) описывает rollback последовательности при ошибке; условные SQL-предикаты и индексы нужны независимо от этого. Повторить тесты, включая rollback после искусственной ошибки второго statement и проверку local/D1-параметров; ожидать GREEN. Mock D1 не считать доказательством реального параллелизма: запуск local Wrangler-контракта — интеграционный gate A10.
- [ ] Commit `feat: make assessment admission atomic and idempotent`.

### Task 5: A5. Оценивание, черновик, сдача и ручная проверка

**Files:** Create `lib/assessment/grading.ts`, `tests/assessment-grading.test.ts`, `tests/assessment-submit.test.ts`; Modify `lib/assessment/service.ts`.

**Interfaces:** `gradeVariant(document,variantId,answers):GradeResult`; `GradeResult={autoScore:number,maxScore:number,pendingQuestionIds:string[],items:PrivateQuestionResult[]}`. `saveDraft(actor,assignmentId,attemptId,{version,answers},clock?):Promise<PrivateAttempt>`; `submitAttempt(actor,assignmentId,attemptId,{version,answers},clock?):Promise<PrivateAttempt>`; `expireAttempt(actor,assignmentId,attemptId,clock?):Promise<PrivateAttempt>`; `reviewAttempt(teacher,assignmentId,attemptId,{version,marks:{questionId,points,comment}[]}):Promise<PrivateAttempt>`.

- [ ] Тесты: single по id; multiple порядок не важен; unknown/duplicate id →400; 0 points остаётся 0; short NFC/пробелы/регистр, ё≠е; numeric 0,5=0.5=1/2, знаменатель 0/выражение JS/NaN отвергаются; открытый непустой →pending, пустой/нулебалльный →0 без ожидания. Предел numeric: ≤100 символов, модуль числителя и знаменателя ≤10^18, преобразование в BigInt и сокращение, без exponent/eval. Максимум только выбранного варианта.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assessment-grading.test.ts tests/assessment-submit.test.ts --maxWorkers=1`; ожидать RED.
- [ ] Реализовать gradeVariant чистой функцией. Сохранение и сдача — compare-and-swap по status/version/expiresAt; финальная запись ответа и результата одним UPDATE. Полностью пустая ручная сдача →422, активная запись не меняется. После срока использовать только сохранённый draft; client payload игнорируется/отвергается. completionKind хранит submitted/expired отдельно от итогового status pending_review/graded. Граничное время now===expiresAt считается истечением. Повтор submit с другой версией/телом возвращает уже зафиксированный результат, не переоценивает.
- [ ] Повторить тесты; GREEN. Проверить потерянный HTTP-ответ, поздний autosave, refresh, stale version →409 без потери текущего ответа. Ручная оценка принимает только open-question ids и points 0..max; итог вычисляется сервером, конкурентные review не затираются. Лучший итог берётся только из graded.
- [ ] Commit `feat: persist and grade assessment attempts safely`.

### Task 6: A6. Политики раскрытия, DTO и изменение настроек

**Files:** Create `lib/assessment/projection.ts`, `lib/assessment/public.ts`, `tests/assessment-disclosure.test.ts`; Modify `lib/assignments/service.ts`, `lib/assessment/service.ts`.

**Interfaces:** `canRevealSolutions(assignment,attempt,usedAttempts,now:Date):boolean`; `toStudentAttempt(assignment,attempt,usedAttempts,now):AttemptDTO`; `toLegacyAttempt(row):LegacyAttemptDTO` (id/material title/date/score/maxScore/own answers, без raw answersJson); `getStudentAttemptView(actor,assignmentId,attemptId,clock?:Clock):Promise<AttemptDTO>`; `updateAssignment(teacher,id,{version,...policy}):Promise<TeacherAssignmentDTO>`; `releaseSolutions(teacher,id,{version},clock?):Promise<TeacherAssignmentDTO>`.

- [ ] Тесты: canary `SECRET_KEY_...` и private criteria/explanation/correct отсутствуют рекурсивно в скрытых DTO; manual до/после release, after_due до/в момент срока, after_last до/после лимита. Для in_progress раскрытие всегда false, даже если maxAttempts=usedAttempts=1. Старая answersJson с answer/result не попадает в LegacyAttemptDTO. В скрытом результате только общий/предварительный балл, собственный ввод и status.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assessment-disclosure.test.ts --maxWorkers=1`; ожидать RED.
- [ ] Реализовать DTO явным перечислением полей, не spread приватного объекта. Ввод question/feedback белым списком; pending manual не показывается как финальный ноль. `disclosureLockedAt` — монотонная блокировка увеличения лимита после любого раскрытия; `solutionsReleasedAt` выставляет только ручная публикация. Для after_last/after_due первый флаг записывается при первом серверном разрешении публикации атомарно с проверкой версии/политики; при конфликте перечитать, не раскрывать по устаревшим настройкам. Политика остаётся основанием персонального доступа: disclosureLockedAt не даёт ключи всем автоматически.
- [ ] getStudentAttemptView авторизует, завершает истёкшую попытку, выполняет disclosure gate и только после успешного gate вызывает чистую toStudentAttempt. При конфликте политики — одно перечитывание, затем 409 без ключей. Все HTTP-ответы start/draft/submit/history/detail используют этот же gate; прямой вызов serializer на устаревших private rows запрещён. Добавить тест изменения policy между чтением и сериализацией: старый снимок не раскрывается.
- [ ] Добавить и выполнить гонки release/start и раскрытие/update(maxAttempts): никто не стартует после ручного закрытия, увеличение не проходит после публикации, действующая неистёкшая попытка блокирует release 409. Изменения длительности/срока влияют только на новые попытки; уменьшение лимита не удаляет старые. GREEN.
- [ ] Commit `feat: control solution disclosure across results and history`.

### Task 7: A7. HTTP-контракты и закрытие legacy-обходов

**Files:** Create `lib/assignments/http.ts`, `tests/assignment-api.test.ts`; Modify `app/api/[...path]/route.ts`, `tests/platform.test.ts`, `tests/creation-ui.test.ts`.

**Interfaces:** `handleAssignmentRequest(req:Request,actor:Actor):Promise<Response|null>` вызывается после общего auth/CSRF/rate limit. Точные пути:

| Метод и путь /api | Тело/выдача |
| --- | --- |
| GET assignments?kind=homework\|test | Список разрешённых карточек |
| POST classes/:classId/assignment | materialId, materialVersion, title, kind, policy, keysConfirmed для test |
| GET assignments/:id | Разрешённая карточка; homework — безопасный материал и собственная Submission |
| PATCH assignments/:id | version и изменённые поля policy |
| POST assignments/:id/start | requestId UUID → AttemptDTO |
| GET assignments/:id/attempts | Только свои попытки; учитель своего класса — все |
| GET assignments/:id/attempts/:attemptId | AttemptDTO |
| PATCH assignments/:id/attempts/:attemptId/draft | version, answers |
| POST assignments/:id/attempts/:attemptId/submit | version, answers |
| POST assignments/:id/attempts/:attemptId/review | version, marks |
| POST assignments/:id/release | version |
| POST assignments/:id/homework | text; существующий classes/:id/submit делегирует тому же сервису |
| GET assignments/:id/export?attemptId=...&format=docx\|pdf | Студент — только свой завершённый вариант без ключей; реализация renderer в B |

- [ ] Тесты: каждый путь — teacher/student/outsider/anonymous, CSRF, 400/401/403/404/409/422; no-store. POST legacy materials/:id/quiz-start и /quiz →410 без записи для обеих ролей; учитель использует чистый preview. GET attempts — безопасная прежняя история. Прямые GET/export materialId ученика не выдают тест до начала и не выбирают случайное назначение при нескольких доступных.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assignment-api.test.ts tests/platform.test.ts tests/creation-ui.test.ts --maxWorkers=1`; ожидать RED новых проверок. Старый тест server-session заменить новым тестом preview и назначенных попыток, не удалить доказательство защиты повторной сдачи.
- [ ] Реализовать router и адаптеры старых путей. GET materials списка не должен содержать приватные legacy-key поля для старых собственных teacher-only материалов ученика. Проверить Attachment/metadata и list serializers, не только detail. Генерация teacher-only закрывается до AI. До B endpoint экспорта безопасно возвращает 503 с понятным сообщением, а не сырые приватные JSON.
- [ ] Повторить тесты; GREEN. Ошибки не содержат snapshot/private SQL/ключи. Нельзя подменить actor, studentId, score, expiresAt или variantId через body/query.
- [ ] Commit `feat: expose assignment API and close legacy quiz bypasses`.

### Task 8: A8. Генератор и редактор контрольной преподавателя

**Files:** Create `components/assessment/editor.tsx`, `lib/assessment/generation.ts`, `tests/assessment-generation.test.ts`, `tests/assessment-editor.test.ts`; Modify `lib/ai.ts`, `components/workspace/materials.tsx`.

**Interfaces:** `generateAssessment(input:GeneratorInput):Promise<AssessmentDocument>` в AIProvider; в `lib/assessment/generation.ts` — `buildAssessmentMessages(input:GeneratorInput,invalidReply?:string):ConversationMessage[]` и `parseAssessmentReply(raw:string,input:GeneratorInput):AssessmentDocument`; `AssessmentEditor({material,onChange,onSave,onPreview})`. Mock/Live реализуют одинаковый контракт; Live использует существующий private request(messages,true), контроллер не дублирует API-ключи/fetch.

- [ ] Тесты: модель с одним body вместо questions не сохраняется; количество/максимум/типы/варианты проверяются; максимум два обращения к модели (первое + одно исправление); 502 не оставляет готового Material. Demo не назначается с незаполненными ключами. Редактор сохраняет стабильные ids, 0 points, тип и answerLines; изменение поля сбрасывает keysConfirmed.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assessment-generation.test.ts tests/assessment-editor.test.ts --maxWorkers=1`; ожидать RED. AI-тесты подменяют transport, не тратят живую квоту.
- [ ] Реализовать типовую схему generation и редактор. Поля prompt/options/keys разделены; убрать неподдержанные matching/sequence из работающих автотипов. Ручная разметка legacy создаёт новую явную v2-редакцию через сохранение пользователем; открытие не меняет запись. Нельзя автоматически угадать ключ по тексту.
- [ ] Повторить тесты; GREEN. Teacher preview и редактор не создают реальный AssessmentAttempt. Не менять генерацию lesson/review сверх требуемого общего dispatch.
- [ ] Commit `feat: author structured assessments with explicit keys`.

### Task 9: A9. Ученический и преподавательский интерфейсы назначений

**Files:** Create `components/assignments/list.tsx`, `components/assignments/detail.tsx`, `components/assignments/attempt.tsx`, `components/assignments/teacher.tsx`, `components/assessment/question-input.tsx`, `e2e/assignments.spec.ts`; Modify `components/edupilot-app.tsx`, `components/workspace/classes.tsx`, `components/workspace/materials.tsx`, `app/[[...page]]/page.tsx`, `app/globals.css`.

**Interfaces:** `AssignmentsPage({kind:'homework'|'test'})`, `AssignmentPage({id:string})`, `AttemptPage({assignmentId,attemptId})`, `AssignmentTeacherPanel({assignmentId})`, `QuestionInput({question:PublicQuestion,value,onChange,disabled})`. PublicQuestion производится только projection, без импортирования private Question в данные UI.

- [ ] Browser-тест: teacher создаёт/назначает 2 варианта; student через /assignments/tests начинает ровно один; radio/checkbox сохраняются после reload, таймер не сбрасывается, после сдачи нет ключей. Homework открывает реальную форму, отправка видна учителю, grade — ученику. Прямой запрещённый URL не показывает форму, новый материал ученика ведёт в notes/new.
- [ ] До browser-команд прочитать Sites `references/preview/local.md` и выбранный browser skill. Запустить тест на отдельной local preview с test DB и AI_MODE=mock; ожидать RED отсутствующих страниц, не 404 из-за забытых server roots. Добавить assignments и notes в allowlist авторизованных путей.
- [ ] Реализовать UI с API A7: отдельная кнопка старта, предупреждение о пропусках, autosave status/version и восстановление, серверный expiresAt. После 409 autosave не стирать локальный ввод: показать конфликт и дать скопировать текст/загрузить серверную версию. Pending-review показывать отдельно; история только текущего назначения. Teacher форму создания/изменения policy, ручные marks и предупреждение о необратимой публикации решений.
- [ ] Запустить `node node_modules/@playwright/test/cli.js test e2e/assignments.spec.ts` при EDUPILOT_TEST_URL локального тестового сервера; GREEN на desktop и 390×844, управление клавиатурой и подписанные inputs. Авторизованные /quiz/:materialId и /materials/:id ведут в правильный контур, не запускают обходную попытку.
- [ ] Commit `feat: add role-specific homework and assessment screens`.

### Task 10: A10. Интеграционный gate пакета A

**Files:** Create `tests/assessment-concurrency.test.ts`, `scripts/verify-assessment-d1.mjs`; Modify необходимые `e2e/assignments.spec.ts`, `tests/assignment-api.test.ts`.

**Interfaces:** CLI `node scripts/verify-assessment-d1.mjs --local` использует только локальную Wrangler D1 и завершает процесс 0 при выполнении контракта A4/A5, не имеет remote режима.

- [ ] Записать тесты через разные соединения: 20 одновременных start →1 attempt; повторные 20 submit →один сохранённый ответ/итог; CAS draft/review; release/start; снятие enrolment. В API body и истории нет canary-key до разрешения, включая query answers=true и старые URLs.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/assessment-concurrency.test.ts --maxWorkers=1`. Если обнаружен обход, зафиксировать воспроизводимый RED перед исправлением соответствующего сервиса. Если проверки сразу GREEN благодаря A4–A7, записать их как regression coverage: не ломать корректный код искусственно ради RED. Не ослаблять тест из-за гонки.
- [ ] Проверить те же SQL-batch под локальным D1, включая rollback при ошибке, миграцию и форматы времени. Не утверждать безопасность D1-параллелизма по одному mock-тесту; если тест недоступен, это фиксированный blocker D1-совместимости, не разрешение публиковать старый сайт.
- [ ] `node node_modules/vitest/vitest.mjs run --maxWorkers=1` и local `node scripts/verify-assessment-d1.mjs --local` →GREEN. Production build/общий browser gate выполняются master-планом после N/B, не на реальной пользовательской базе.
- [ ] Commit `test: cover concurrent assessment and legacy access boundaries`.
