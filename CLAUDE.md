# CLAUDE.md — живой контекст проекта MidMind

> Этот файл — единый контекст для всех агентов, работающих над проектом.
> Держи его в актуальном состоянии: см. раздел [«Обновляй меня»](#обновляй-меня).
> Первоисточники истины: [`PRD-MidMind-2026-07-07_5.md`](./PRD-MidMind-2026-07-07_5.md) (что строим и зачем)
> и [`tasks.json`](./tasks.json) (задачи, зависимости, критерии приёмки).

---

## 1. Что это

**MidMind — Dota 2 Mid Lane Assistant.** Легальный десктоп-оверлей-ассистент для
мид-игроков Dota 2: помощник по пикам, план на лайн, тайминговые напоминалки,
ситуативные подсказки, персональная статистика. Работает поверх игры в
borderless-режиме, данные получает пассивно через Game State Integration (GSI).

Подробности функций — раздел 3 PRD (F1–F6).

---

## 2. Стек

- **Electron** (main / preload / renderer) — десктоп-оболочка и оверлей-окна.
- **TypeScript (strict)** — весь код.
- **React 19 + Tailwind CSS** — renderer (UI оверлея и настроек).
- **electron-vite** — dev-сервер и сборка.
- **Zod** — рантайм-валидация GSI-пакетов и контентных конфигов; TS-типы выводятся
  через `z.infer` (без ручных дублей — INV4).
- **Zustand** — стор состояния в renderer (проекция состояния из main через IPC).
- **better-sqlite3** — локальная БД (профиль, кэш матчапов, история) в `userData`.
- **Vitest** — юнит-тесты (в первую очередь чистого ядра `src/engine/**` и `src/shared/**`).
- Внешние данные: **STRATZ GraphQL** (основной источник) → **OpenDota** (fallback).

Полный список рекомендаций по стеку — раздел 4 PRD.

---

## 3. Карта каталогов

```
src/
  main/       — бизнес-логика и данные (Electron main). Источник правды.
                GSI-сервер, окна-оверлеи, БД, config-loader, data-сервисы,
                планировщики уведомлений, регистрация хоткеев.
  preload/    — мост contextBridge → типизированный window.midmind (IpcContract).
  renderer/   — React-UI. «Тупая» проекция состояния из main через IPC.
                renderer/src/ — компоненты, сторы (Zustand), стили.
  engine/     — ЧИСТОЕ ядро без побочных эффектов: draft, facts, rules, timings.
                Принимает данные аргументами, возвращает результат. Тестируется юнит-тестами.
  shared/     — общие типы, Zod-схемы, чистые утилиты. Используется и main, и renderer.
                shared/schemas/ — Zod-схемы (gsi, gameState, advice, settings).
                shared/types/   — IpcContract и производные типы.
                shared/gsi/     — parseGameState (raw GSI → GameState).
content/      — контентные JSON-конфиги (правила, тайминги, профили героев,
                матчапы, каталог GSI-полей, бенчмарки). Правятся без пересборки (hot-reload).
test/         — Vitest-тесты; test/fixtures/ — фикстуры (в т.ч. реальные GSI-пакеты).
tools/        — оффлайн-инструменты (напр. генерация benchmarks.json).
docs/         — документация (напр. docs/gsi-fields.md — реальный состав GSI-пакетов).
```

Path-алиасы (electron.vite.config.ts + tsconfig): `@main`, `@preload`, `@renderer`,
`@engine`, `@shared`.

---

## 4. Инварианты архитектуры (INV1–INV5) — проверять в КАЖДОЙ задаче

- **INV1 — Границы main/renderer.** Вся бизнес-логика и данные живут в `main`.
  Renderer (React) — тупая проекция состояния через IPC; он НИКОГДА не импортирует
  `src/main/**` и `src/engine/{rules,draft,facts,timings}`.
- **INV2 — Чистота ядра.** `src/engine/**` и `src/shared/**` не импортируют
  electron / react / better-sqlite3 / fs / сеть. Защищается lint-правилом (TASK-003),
  а не договорённостью.
- **INV3 — Легальность.** Только пассивный приём GSI (POST на localhost) + публичные
  API. Никакого чтения памяти игры, инъекций, автоматизации ввода, снятия тумана войны.
- **INV4 — Контент vs код.** «Добавить правило / тайминг / матчап / поле каталога» =
  только данные в JSON. «Добавить новый вид факта / пресета-виджета / формат поля» =
  код + Zod-схема.
- **INV5 — Внешние данные через фасад.** Всегда через DataService-фасад, отдающий
  `{data, source, fetchedAt, stale}`. Деградация: STRATZ → OpenDota → SQLite stale →
  «нет данных». Метка давности доходит до UI.

Раздел 7 PRD — соображения безопасности и легальности.

---

## 5. Команды

Определены в [`package.json`](./package.json):

| Команда | Что делает |
|---|---|
| `npm install` | Установить зависимости (нужно один раз; native-модули под ABI Electron). |
| `npm run dev` | Поднять Electron + React через electron-vite (dev-режим, HMR). |
| `npm run build` | `typecheck` + сборка electron-vite (проверяет strict-типы). |
| `npm start` | Превью собранного приложения (`electron-vite preview`). |
| `npm run typecheck` | `tsc --noEmit` для node-части (tsconfig.node.json) и web-части (tsconfig.web.json). |
| `npm run typecheck:node` / `:web` | Проверка типов отдельно по проекту. |
| `npm test` | Юнит-тесты (`vitest run`), см. vitest.config.ts. |
| `npm run lint:boundaries` | Механическая защита границ импорта INV1/INV2 (dependency-cruiser, `.dependency-cruiser.cjs`). |
| `npm run lint` | Все линты (сейчас = `lint:boundaries`). |

> Конфигурации типов разделены: `tsconfig.node.json` (main / preload / engine / shared /
> test) и `tsconfig.web.json` (renderer). Оба в strict-режиме.

`lint:boundaries` (TASK-003) реализован через **dependency-cruiser** (конфиг
`.dependency-cruiser.cjs`, path-алиасы резолвятся из `tsconfig.node.json`):
`src/engine/**` и `src/shared/**` не импортируют electron/react/better-sqlite3/fs/сеть (INV2);
`src/renderer/**` не импортирует `src/main/**` и `src/engine/{rules,draft,facts,timings}` (INV1).

Секреты (напр. `STRATZ_API_TOKEN`) — ТОЛЬКО через переменные окружения / `.env`
(в `.gitignore`; шаблон — `.env.example`), никогда в репозиторий.

---

## 6. Границы IPC (контракт)

Единственный контракт main↔renderer — `IpcContract` в
[`src/shared/types/ipc.ts`](./src/shared/types/ipc.ts). Renderer обращается к main
только через типизированный `window.midmind`, публикуемый preload'ом
(`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — TASK-007).

- **push-каналы (main → renderer):** `gameState:update`, `advice:push`,
  `config:reloaded`, `draft:update`.
- **invoke-каналы (renderer → main):** `settings:get`, `settings:set`.

При изменении набора каналов или payload'ов — правь `IpcContract` и обновляй этот раздел.

---

## 7. Как выбирать и вести задачу (для агентов loop)

Полный протокол — блок `agent_instructions` в `tasks.json`. Кратко:

1. Прочитай `tasks.json`, `progress.txt`, этот файл и `git log --oneline -20`.
2. Возьми ОДНУ задачу со статусом `pending` и наивысшим приоритетом
   (`critical` > `high` > `medium` > `low`), все `dependencies` которой имеют статус `done`.
3. Сверься с INV1–INV5.
4. Работай ТОЛЬКО над этой задачей. Бизнес-логику пиши в `main` или чистом `src/engine/**`,
   никогда в React-компоненте.
5. Прогони ВСЕ `test_steps` end-to-end. Меняй `status` на `done` ТОЛЬКО после успешного
   прохождения. **Разрешено менять ТОЛЬКО поле `status`** — описания / критерии /
   зависимости не трогать.
6. Запиши summary в `progress.txt` (дата, TASK-id, что сделано, как проверено, риски).
7. Новую нужную задачу НЕ добавляй сам — опиши её в `progress.txt` для владельца.

### ⚠️ Известное ограничение окружения

В автономном (Ralph) цикле песочница отклоняет `npm`/`npx`/`node` и запись через git
(`git commit`) — требуют подтверждения, которое в цикле не приходит; `node_modules` не
установлен. Значит: задачи, чьё закрытие требует прогона `npm`/`vitest`/`tsc`, **нельзя
фактически верифицировать и коммитить** в этом окружении. Пиши/правь файлы и оставляй
подробную заметку в `progress.txt`, чтобы человек мог доустановить, прогнать проверки и
закоммитить. Не помечай задачу `done`, если её `test_steps` не были реально прогнаны.

---

## 8. Открытые вопросы (влияют на объём задач)

Актуальный список — `project.open_questions` в `tasks.json`. Ключевые:

- Видны ли в GSI пики обеих команд на стадии `HERO_SELECTION`? (TASK-009 → объём
  авто-режима драфта TASK-027.)
- Cooldown правил F4 — в игровом времени (`clock_time`) или wall-clock? (Фиксируется в
  `EvaluationContext`, TASK-044.)
- Отдаёт ли STRATZ поминутные бенчмарки, или нужен fallback-интерполяция? (TASK-038.)

---

## Обновляй меня

Дополняй/правь этот файл, когда:

- **После ревизии реальных GSI-полей (TASK-009)** — обнови карту полей / ссылку на
  `docs/gsi-fields.md`; здесь до этого зафиксированы предположения о составе пакетов.
- **Меняются границы IPC** — новые каналы или payload'ы в `IpcContract` → раздел 6.
- **Появляются новые команды/скрипты** (`lint:boundaries`, миграции БД и т.п.) → раздел 5.
- **Появляются новые контентные конфиги** в `content/` → карта каталогов и INV4.
- **Меняется стек или структура каталогов** → разделы 2–3.
- **Закрывается milestone** (M0–M6, раздел 8 PRD) — сверь состояние проекта с описанием.
