# EduPilot Answer Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в готовые контрольные и рабочие листы настоящее место для письменного ответа в предпросмотре, печати, Word и PDF.

**Architecture:** Общая безопасная модель бланка поверх assessment-v2/legacy; три renderer используют одни параметры строк и вариантов. Авторизация и исключение ключей выполняются до формирования модели, а не надеются на выбранный renderer.

**Tech Stack:** React/CSS print, docx, pdf-lib/fontkit, Vitest, JSZip, Playwright; рендер Word/PDF по соответствующим skills.

**Spec:** `../specs/2026-10-17-assignment-safety-and-notes-design.md`, разделы 7, 9, 11–13; master `2026-10-17-stage1.md`. Зависимость — A1/A6/A7/A8.

## Global Constraints

- «Настройка на вопрос: 1–12 строк для решения». Default: single/multiple — строка «Ответ» и checkbox-варианты; short/numeric — 2, open — 6.
- «Блок вопроса не отрывается от первых строк ответа; крупный блок может переноситься с продолжением без выхода за A4».
- «По запросу преподавателя ключи добавляются отдельным разделом/листом после бланка; они не замещают место для работы ученика».
- «Неструктурированный раздел с несколькими вопросами не разбивается автоматически».
- Аккаунты, чаты, материалы, вложения и прежние результаты сохраняются; экспорт не пишет в базу, кроме явно отдельного сохранения редактора пользователем.
- Ограниченное изменение test/worksheet, без замены всей экспортной библиотеки/типографики всех материалов. PPTX и исторические presentation/video не ломать.

## Review Focus

1. Вопрос с 20000 символами и 12 строками не выходит за лист и не оставляет заголовок внизу страницы без начала ответа — B2.
2. answers=true из запроса ученика и неверный attemptId не открывают ключи — B1.
3. Кириллица, знак минус и обычные дроби не теряются; неподдержанный шрифтом символ даёт понятную ошибку экспорта, не 500 и не молчаливое удаление — B2.
4. Два варианта не перемешиваются в ученическом экземпляре — B1/B2.
5. Старый раздел с шестью вопросами остаётся одним legacy-разделом, а не получает шесть выдуманных ключей — B1.

## Файлы и контракты

Create `lib/assessment/sheet.ts`, `lib/assessment/export-docx.ts`, `lib/assessment/export-pdf.ts`, `components/assessment/sheet-preview.tsx`, `tests/answer-sheet.test.ts`, `tests/answer-sheet-export.test.ts`, `e2e/answer-sheet.spec.ts`. Modify `lib/export.ts`, `lib/assignments/http.ts`, `app/api/[...path]/route.ts`, `components/assessment/editor.tsx`, `app/globals.css`.

- `SheetBlock={id:string,title:string,prompt:string,options:{id:string,label:string}[],points:number|undefined,answerLines:number}`.
- `AnswerSheet={title:string,subject:string,grade:number,instructions:string,variantLabel:string,blocks:SheetBlock[],teacherKeys?:{questionId:string,answer:string,criteria?:string}[]}`.
- `buildAnswerSheet(material:MaterialRecord,{variantId?:string,includeTeacherKeys:boolean}):AnswerSheet`; raw input — только проверенный teacher snapshot/разрешённая ученическая проекция от HTTP. Для legacy blocks по sections, без преобразования исходного JSON.
- `exportAnswerSheetDocx(sheet:AnswerSheet):Promise<Uint8Array>`, `exportAnswerSheetPdf(sheet:AnswerSheet):Promise<Uint8Array>`, `SheetPreview({sheet:AnswerSheet})`.

### B1. Общая модель и предпросмотр

**Files:** sheet.ts, sheet-preview.tsx, editor/http/API, tests/answer-sheet.test.ts, app/globals.css.

**Interfaces:** Consumes A schema/defaultAnswerLines, canRevealSolutions и проверку принадлежности attempt; produces AnswerSheet и teacher preview. Ученический sheet строится всегда includeTeacherKeys=false, независимо от query answers.

- [ ] Тесты: `expect(sheet.blocks.find(b=>b.id==='open').answerLines).toBe(6)`; редактирование до 12 сохраняется; legacy добавляет пустое поле, `expect(legacyAfter).toEqual(legacyBefore)`; variant v2 не содержит v1; canary-key отсутствует в JSON ученического AnswerSheet и HTML даже при answers=true; чужой attempt →404, незавершённый →409.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/answer-sheet.test.ts --maxWorkers=1`; ожидать RED.
- [ ] Реализовать модель/preview. Шапка ФИО/класс/дата, название/вариант/инструкции, чекбоксы и строки. Teacher может preview всех вариантов отдельно и скачать все; student только свой завершённый. Скачивание общей material-ссылки студента с несколькими назначениями требует выбрать assignment, а не обходит A. В CSS печати убрать космический фон/редактор/кнопки, сохранить текст и поля.
- [ ] Повторить тест; GREEN. Изменение answerLines использует явное сохранение версии материала; само переключение предпросмотра ничего не пишет. TeacherKeys отделены визуально и структурно.
- [ ] Commit `feat: add shared printable answer sheet model`.

### B2. DOCX/PDF и визуальная приёмка

**Files:** export-docx.ts/export-pdf.ts, lib/export.ts, tests/answer-sheet-export.test.ts, e2e/answer-sheet.spec.ts.

**Interfaces:** Consumes AnswerSheet; produces bytes и существующие MIME/filename заголовки. Общая exportMaterial выбирает этот renderer только для test/worksheet; прочие legacy/notes пути сохраняются.

- [ ] Тесты: DOCX unzip содержит ФИО/класс/дату, 12 строк, page-break перед teacherKeys; student document.xml не содержит canary-key; PDF A4 страницы и ненулевые bytes, текст не выходит за bounds, отдельные ключи только teacher. Fixtures: короткая работа, 2 варианта, длинное условие, русские символы, пустой legacy-раздел и многостраничная работа. Для отсутствующего в шрифте символа — 422 с Unicode codepoint и предложением DOCX, без удаления/замены смыслового символа и без выдачи поломанного файла; формулы сохраняются текстом, без обещания полноценного нового LaTeX-renderer на этапе 1.
- [ ] Запустить `node node_modules/vitest/vitest.mjs run tests/answer-sheet-export.test.ts --maxWorkers=1`; ожидать RED.
- [ ] Реализовать DOCX абзацы/линии с keepNext для заголовка и начала ответа, разрывы листа ключей; PDF — измерение блока и постраничный layout с переносом строк, отдельными линиями и полями A4. Не рисовать один гигантский блок за пределами страницы. Шрифты берутся из existing public/fonts, сеть для рендера не нужна.
- [ ] Повторить тесты →GREEN. До визуального QA прочитать skills documents/pdf и использовать их render-and-verify инструменты. Сгенерировать только синтетические образцы в `../work/stage1-qa/`, отрендерить все страницы DOCX и PDF; проверить строки, кириллицу, начало/продолжение блока, отдельные ключи и отсутствие обрезки. Сохранить отчёт и изображения. Наличие bytes/ZIP само по себе не считается визуальной проверкой.
- [ ] `node node_modules/@playwright/test/cli.js test e2e/answer-sheet.spec.ts` на local preview →GREEN: teacher preview/download; student safe download; печать не содержит UI и приватных ключей.
- [ ] Commit `feat: export answer spaces and separate teacher keys`.
