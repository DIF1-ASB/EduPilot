# EduPilot Dedicated Student Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать ученику самостоятельный конспект с собственной формой, содержанием и редактором вместо плана урока.

**Architecture:** NotesDocument версии 2 и отдельный AI-контракт; общая сущность Material и права из пакета A. Старые заметки читаются через legacy-адаптер без изменения записи.

**Tech Stack:** Next.js/React, TypeScript, Zod, существующий AIProvider, Vitest/Playwright, существующие DOCX/PDF-библиотеки.

**Spec:** `../specs/2026-10-17-assignment-safety-and-notes-design.md`, разделы 4, 10–13; master `2026-10-17-stage1.md`. Зависимость — A1/A3 и общий AI dispatch A8.

## Global Constraints

- «Сохраняются все аккаунты, пароли, роли, чаты, материалы, вложения, назначения и результаты».
- «Полей „минуты“, „этап урока“, „оборудование“ и „домашнее задание“ нет».
- «Модель не должна заявлять, что читала файл, по одной ссылке на него».
- Тема 2–200 символов; исходный текст ≤20000; акцент ≤2000; объём short/normal/detailed, default normal; самопроверка 3–5 вопросов в готовом конспекте.
- Не подключать платную модель, OCR или новый сервис; не менять AI_BASE_URL/ключи при этой работе.
- Старый Site не перепубликовывать; серверные данные и .env не копировать в тесты/репозиторий.

## Review Focus

1. Конспект по педагогике законно может упоминать «урок»: запрещать структуру lesson, не слова в тексте — N1.
2. Пустой ручной черновик должен сохраняться как draft, но не выдаваться за готовый результат — N1/N2.
3. Устаревший AI-ответ после изменения темы не перезаписывает свежий ручной ввод — N2.
4. Инструкции внутри исходного текста не меняют системные правила и не создают заявление о чтении файла — N1.
5. Старый notes с duration читается без минут в новом редакторе и не переписывается от открытия — N2.

## Файлы и контракты

Create `lib/notes/schema.ts`, `lib/notes/generation.ts`, `components/notes/form.tsx`, `components/notes/editor.tsx`, `components/notes/preview.tsx`, `tests/notes-generation.test.ts`, `tests/notes-ui.test.ts`, `e2e/notes.spec.ts`. Modify `lib/materials/content.ts`, `lib/domain.ts`, `lib/ai.ts`, `lib/export.ts`, `app/api/[...path]/route.ts`, `components/edupilot-app.tsx`, `components/workspace/materials.tsx`, `app/globals.css`.

- `NotesInput={title,subject,grade,volume:'short'|'normal'|'detailed',sourceText:string,focus:string}`; grade integer 1–11, поля строк с ограничениями выше.
- `NotesDocument={schemaVersion:2,kind:'notes',demo:boolean,summary:string,concepts:{term:string,definition:string}[],theses:string[],examples:{title:string,body:string}[],conclusion:string,selfCheck:{id:string,question:string,answer:string}[]}`. Поля структуры strict; примеры могут отсутствовать как пустой массив. Готовый результат: непустые summary/conclusion, непустые concepts или theses, 3–5 selfCheck, нет одних заглушек. draft разрешает незаполненные строки.
- `validateNotes(input:unknown,{ready:boolean}):NotesDocument`, `createNotesDraft():NotesDocument`, `buildNotesMessages(input:NotesInput,invalidReply?:string):ConversationMessage[]`, `parseNotesReply(raw:string):NotesDocument`, `notesToSections(doc:NotesDocument):Section[]`.
- `AIProvider.generateNotes(input:NotesInput):Promise<NotesDocument>` использует у Live существующий private request(messages,true). `NotesForm({onCreated})`, `NotesEditor({material,onSave})`, `NotesPreview({document})`.

### N1. Контракт и генерация конспекта

**Files:** Schema/generation/content/domain/ai/API и `tests/notes-generation.test.ts` из карты выше.

**Interfaces:** Consumes A `MaterialContent`, policy, общий транспорт AIProvider; produces NotesInput/NotesDocument и функции из контракта.

- [ ] Тесты: обычный NotesDocument принимается; `{sections:[{title:'Объяснение новой темы',duration:15,...}]}` не считается v2-конспектом. NotesDocument с допустимым тезисом о плане урока принимается. `expect(createNotesDraft().kind).toBe('notes')`, ready=false допускает незаполненный draft, ready=true отвергает. sourceText длиной 20001 и focus 2001 →400; source-инструкция остаётся в отдельном недоверенном пользовательском блоке, а не в system.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/notes-generation.test.ts --maxWorkers=1`; ожидать RED.
- [ ] Реализовать schema и prompt-builder. Dispatch generate по type=notes валидирует NotesInput отдельно от generatorSchema урока; нет утечки duration/default lesson. AI может один раз исправить структуру, всего ≤2 вызовов; обе ошибки →502 без сохранённого ready Material. Mock — явно demo=true и ручной шаблон. Сохранение ready требует validateNotes ready=true, draft — false. Поля arbitrary lesson не просачиваются в contentJson.
- [ ] Повторить тесты; GREEN. Добавить fake replies для всех трёх объёмов и проверки отсутствия заявления об обработке вложения; это проверка сформированных инструкций/структуры, не гарантия предметной истинности любой live-модели. notesToSections даёт упорядоченные заголовки и самопроверку для существующего экспорта без duration.
- [ ] Commit `feat: add dedicated notes contract and generation`.

### N2. Профильная форма, ручной режим и совместимость

**Files:** Компоненты notes, интеграции маршрутов/библиотеки/export, `tests/notes-ui.test.ts`, `e2e/notes.spec.ts`.

**Interfaces:** Consumes N1, `/api/generate` type=notes, `/api/materials` POST/PATCH и A policy; produces `/notes/new`, редактирование notes в `/materials/:id`, печать и DOCX/PDF через notesToSections.

- [ ] Тесты UI: форма содержит «Тема», «Объём», «Исходный текст», но не input минут/оборудования; кнопка ручного заполнения не вызывает AI. В библиотеке ученика нет «Новый материал»→lesson. Fixture legacy notes с duration открывается без минут и без PATCH. Изменение темы во время запроса не заменяет новый ввод старым ответом — запрос привязан к revision, устаревший ответ предлагается отдельно.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/notes-ui.test.ts tests/notes-generation.test.ts --maxWorkers=1` и `node node_modules/@playwright/test/cli.js test e2e/notes.spec.ts` на изолированном preview; ожидать RED до формы.
- [ ] Реализовать форму и редактор: собственные блоки, понятия/тезисы/примеры/итог, раскрытие selfCheck отдельно. Отмена не теряет существующие данные; сохранение с version, конфликты не затираются. При legacy читать view-адаптером; обновлять формат только после явного сохранения, не угадывать содержание/формулы. Загрузка старой записи сохраняет её id/title/type. Экспорт old notes не переписывает contentJson.
- [ ] Обе команды →GREEN; браузер: student создаёт вручную, сохраняет, reload, редактирует, скачивает DOCX/PDF; teacher notes также работает. Проверить desktop и 390×844, aria labels, кириллицу и отсутствие JS-errors. Существующие chat/lesson/worksheet не меняются.
- [ ] Commit `feat: add separate notes form editor and export adapter`.
