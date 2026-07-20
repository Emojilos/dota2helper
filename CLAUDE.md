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

**Целевая платформа — Windows** (PRD, раздел 1); разработка ведётся на macOS.
Следствия: (а) живые проверки поверх реальной Dota 2 (гейт TASK-008: FPS,
click-through над игрой) выполняются на Windows-машине владельца, а НЕ на
dev-Mac — отсутствие Dota 2 / Screen Recording permission на Mac не является
блокером этих задач, они просто ждут Windows-прогона; (б) реальные GSI-пакеты
(TASK-009) собираются на машине с игрой и кладутся в `test/fixtures/gsi/` —
дальше вся работа над ними платформо-независима и делается на Mac.

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
tools/        — оффлайн-инструменты (генерация benchmarks.json; gsi-capture/ —
                standalone-набор для захвата GSI-пакетов на Windows-машине с Dota 2, TASK-009).
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
  `config:reloaded`, `draft:update` (TASK-028 — F1: `{meta, personal}`, ОБА
  ранжирования `DraftCandidate[]` за один пуш — переключатель в будущей
  панели (TASK-029) сможет показывать любое мгновенно, без повторного запроса;
  рассылается на каждое изменение `DraftContext`, пока `stage='picking'`, см.
  `DraftService`, `src/main/draft/`), `settings:update` (TASK-018 — авторитетная
  проекция `AppSettings`; main рассылает её во все окна после ЛЮБОЙ мутации
  настроек, из renderer (`settings:set`) или из main (хоткей тихого режима),
  включая инициатора — renderer-стор не различает источник), `cacheWarmer:progress`
  (TASK-025 — прогресс фонового прогрева кэша матчапов), `steamId:detected`
  (TASK-030 — F6: main пушит один раз за сессию, когда в GSI приходит
  `player.steamid` при непривязанном профиле; ничего не персистится
  автоматически, renderer должен показать подтверждение и вызвать `settings:set`
  сам), `compactPanel:timers` (TASK-014 — таймеры дефолтных виджетов компактной
  панели: `nextEvent`/`nextRune`, каждый `{labelRu, secondsUntil} | null`;
  считает чистая `selectCompactPanelTimers` из `engine/timings` над тем же
  `timings.json`, что и `TimingScheduler`, без второго расписания, INV4;
  пушится на каждый тик GSI вместе с `gameState:update`), `draftContext:update`
  (TASK-027 — F1: актуальный `DraftContext` {stage, ownHeroId, allyHeroIds,
  enemyHeroIds, enemyMidHeroId, updatedAtMs}; рассылается ТОЛЬКО при реальном
  изменении контекста, не на каждый тик GSI — см. `DraftContextManager`,
  `src/main/draft/`).
- **invoke-каналы (renderer → main):** `settings:get`, `settings:set` (`steamId`
  в патче принимает и «голый» 64-bit ID, и ссылку на профиль
  `.../profiles/<id>` — `SettingsController` нормализует и валидирует через
  `parseSteamId64Input`, TASK-030; невалидный ввод бросает ошибку вместо
  молчаливого сохранения; `overlayPositions` — TASK-014, `Record<windowId,
  {x,y}>`, часть `AppSettings`/`UserProfile`, персистит позиции
  оверлей-окон), `draftContext:get`/`draftContext:applyManualAction` (TASK-027 —
  F1: GSI НЕ отдаёт пики команд игроку ни в одной из трёх захваченных сессий
  (docs/gsi-fields.md, TASK-009) — единственный источник `enemyHeroIds`/
  `allyHeroIds`/`enemyMidHeroId` — ручной ввод; `applyManualAction` принимает
  `DraftManualAction` (addAlly/removeAlly/addEnemy/removeEnemy/setEnemyMid/reset,
  `src/shared/schemas/draft.ts`) и возвращает актуальный `DraftContext`;
  стадия (idle/picking/finalized) и `ownHeroId` авто-детектятся из
  `map.gameState`/`hero.id`, реализация — чистые функции `engine/draft` +
  стейтфул-обёртка `DraftContextManager`, читает которую также
  `MatchCompletionDetector.getEnemyMidHeroId()`, TASK-033).

При изменении набора каналов или payload'ов — правь `IpcContract` и обновляй этот раздел.

### Хоткеи (TASK-018)

`HotkeyManager` (`src/main/hotkeys/`) регистрирует глобальные акселераторы через
платформенный шов `HotkeyBackend` (`createHotkeyBackends`), точечно
перерегистрируя только изменившуюся роль (не `unregisterAll()`). На win32 —
`UiohookBackend` (uiohook-napi, низкоуровневый observe-only хук; живой гейт
TASK-008 показал, что `electron.globalShortcut`/RegisterHotKey НЕ срабатывает
поверх сфокусированной Dota — electron#27240) с fallback'ом на
`GlobalShortcutBackend`; на darwin-dev — `GlobalShortcutBackend`. Непарсибельный
акселератор отклоняется `SettingsController.apply()` до персиста
(`parseAccelerator` в `src/shared/hotkeys/`). Конфигурируемые хоткеи сейчас — `hotkeyExpandedPanel`
(default `F9`), `hotkeySilentMode` (default `F10`) и `hotkeyClickThroughToggle`
(default `F8`, TASK-008) в `AppSettings`/`UserProfile`; любая их смена идёт
через `SettingsController.apply()` (`src/main/ipc/SettingsController.ts`),
который персистит, рассылает `settings:update` и вызывает
`HotkeyManager.reconcile()`. Хоткей расширенной панели (F9) пока не открывает
окно (его ещё нет — TASK-037): handler логирует срабатывание как шов для
будущего подписчика.

### Overlay-окна (TASK-008)

`OverlayWindow` (`src/main/windows/OverlayWindow.ts`) — дженерик-обёртка над
`BrowserWindow` для окон поверх игры: `transparent:true`, `frame:false`,
always-on-top на уровне `'screen-saver'`, `showInactive()` (не ворует фокус),
по умолчанию click-through (`setIgnoreMouseEvents(true,{forward:true})`).
`setInteractive`/`toggleInteractive()` переключают интерактивность; состояние
эфемерно, не персистится. `main/index.ts` (`startOverlayWindow`) поднимает
один базовый инстанс с placeholder-контентом; `HotkeyManager`
(`onToggleClickThrough`) дёргает `toggleInteractive()` по `hotkeyClickThroughToggle`.
Конкретный контент (компактная панель/уведомления/расширенная панель) и
топология нескольких окон — задача TASK-014/015/037, каждая создаёт свой
инстанс `OverlayWindow`. **Проверено вживую поверх реальной Dota 2**
(Windows-машина владельца, borderless, 2026-07-19): оверлей виден поверх игры
без альтаба, click-through работает, F8-toggle срабатывает в фокусе игры
(uiohook-бэкенд), FPS 120/120 — просадка 0% при критерии ≤5%; детали —
`docs/overlay-performance.md`. Поверх эксклюзивного фулскрина оверлей не
отрисовывается (ограничение ОС) — целевой режим borderless (PRD).

### Компактная панель (F5 режим 1, TASK-014)

Второй инстанс `OverlayWindow` (`startCompactPanelWindow` в `main/index.ts`),
но с реальным React-контентом, а не placeholder — одна renderer-сборка
обслуживает несколько окон через query-параметр: `main/index.ts` грузит
`index.html?window=compact-panel`, `renderer/src/main.tsx` по этому параметру
рендерит `CompactPanel` вместо `App` (без роутера — на два «маршрута» он был
бы лишней абстракцией). Дефолтный набор виджетов (не настраиваемый,
`DEFAULT_COMPACT_PANEL_WIDGET_IDS` в `src/shared/overlay/compactPanel.ts`) —
таймер ближайшего события, фаза игры, индикатор ближайшей руны (раздел F5
PRD); полный конструктор по каталогу GSI-полей — TASK-016/017. Высота окна
считается из числа виджетов (`compactPanelHeight`) — «панель адаптируется к
набору». Тема — `rgba(10,12,16,0.85)`, скруглённые углы, тонкий бордер
(раздел 6 PRD).

Перетаскивание — нативное (`-webkit-app-region: drag` на всём контейнере
`CompactPanel.tsx`, внутри нет кликабельных элементов) и работает только в
интерактивном режиме: `onToggleClickThrough` (F8) переключает эту панель
синхронно с базовым overlayWindow (TASK-008) — один хоткей на все текущие
оверлей-окна, а не по окну на окно. Итоговую позицию `OverlayWindow.onMoved`
персистит в `AppSettings.overlayPositions.compactPanel` (`{x,y}`, дебаунс
200мс от последнего сдвига, чтобы не писать в БД на каждый промежуточный
пиксель) через `SettingsController.apply()` — переживает перезапуск; при
первом запуске (нет сохранённой позиции) — `COMPACT_PANEL_DEFAULT_POSITION`
(верхний левый угол ниже топ-бара, ниже TASK-008 placeholder'а, чтобы не
перекрывать его в деве).

Живой прогон поверх реальной Dota 2 (позиционирование относительно миникарты/
топ-бара/панели героя на разных разрешениях) — ждёт Windows-машины владельца,
как и гейт TASK-008 (см. раздел 1); на dev-Mac проверено через `npm run dev` +
синтетический GSI-пакет (`curl` на локальный GSI-сервер) — окно поднимается,
таймеры считаются и пушатся без ошибок.

---

### Детект драфта и панель драфта (F1, TASK-027)

GSI НЕ отдаёт пики команд игроку ни в одной из трёх захваченных сессий
(`docs/gsi-fields.md`, открытый вопрос закрыт TASK-009) — `draft={}` во всех
пакетах, включая полную рейтинговую стадию пиков. Поэтому авто-детект
ограничен ДВУМЯ вещами: стадией драфта (`map.gameState`) и собственным героем
(`hero.id`, который становится известен ещё во время `HERO_SELECTION`, до
конца пика). Всё остальное — `enemyHeroIds`/`allyHeroIds`/`enemyMidHeroId` —
только ручной ввод.

Чистая логика — `src/engine/draft/` (`deriveDraftStage`,
`updateDraftContextFromGameState`, `applyDraftManualAction`): стадии
`idle → picking → finalized`, `WAIT_FOR_PLAYERS_TO_LOAD` сбрасывает контекст
на `idle` (новый матч — старые ручные пики теряют смысл). Стейтфул-обёртка —
`DraftContextManager` (`src/main/draft/`), держит `DraftContext` между тиками
GSI (`onGameState`) и ручными действиями (`applyManualAction`), уведомляет
подписчика ТОЛЬКО при реальном изменении (engine/draft возвращает тот же
объект по reference, если тик ничего не поменял — иначе `draftContext:update`
пушился бы на каждый GSI-тик, ~2 Гц, впустую). `getEnemyMidHeroId()` — реальный
источник для `MatchCompletionDetector` (TASK-033, раньше был захардкожен
`null`); `LanePlanBuilder` (TASK-036) тоже сможет читать его, как только
появится потребитель (расширенная панель, TASK-037 — сам вызов `build()` на
финализацию пиков пока НЕ добавлен, т.к. показывать результат пока негде).

Третий инстанс `OverlayWindow` (`startDraftPanelWindow`, `?window=draft-panel`
→ `DraftPanel.tsx`) — в отличие от компактной панели/уведомлений интерактивен
ВСЕГДА (нужны клики по кнопкам ручного ввода), не участвует в
`onToggleClickThrough` (F8) и не персистит позицию (`src/shared/overlay/draftPanel.ts`,
правый верхний угол — координаты не откалиброваны под реальный HUD, ждут
Windows-машины владельца, как и остальные overlay-окна). Ввод героев — по
числовому ID (нет готового справочника ID→имя для всех героев, только для
профилей топ-20 мидеров — TASK-034); человекочитаемые имена в конструкторе
драфта — потенциальный follow-up вместе с TASK-016 (каталог GSI-полей).

Проверено на dev-Mac: `npm run dev` + `curl` синтетического HERO_SELECTION-
пакета (`test/fixtures/gsi/raw/ranked-1/00164_...json`) — лог показывает
`[draft] stage=picking ownHero=25 ...`; следующий пакет той же сессии
(STRATEGY_TIME) — `stage=finalized`; `?window=draft-panel` компилируется и
отдаётся dev-сервером Vite без ошибок. Живой прогон (позиционирование не
перекрывает сетку выбора героя, клики по кнопкам поверх реальной Dota) — ждёт
Windows-машины владельца.

### Скоринг кандидатов на пик (F1, TASK-028)

Формула раздела F1 PRD — чистые функции `engine/draft`
(`scoreDraftCandidate`/`rankDraftCandidates`):

```
score = w1*counterScore + w2*synergyScore + w3*personalWinrate
```

`counterScore` — взвешенное среднее винрейтов кандидата `relation='vs'` против
каждого ОТКРЫТОГО вражеского пика (`enemyMidHeroId` — вес ×2, остальные враги
×1); `synergyScore` — среднее винрейтов `relation='with'` с каждым открытым
союзником (×1). Герой без матчап-данных против конкретного открытого пика даёт
нейтральные 0.5 (не 0 — отсутствие данных не должно топить кандидата ниже
реально слабых). Дефолтные веса — `DEFAULT_DRAFT_SCORING_WEIGHTS` (0.5/0.4/0.1,
Personal-режим); `metaScoringWeights()` обнуляет w3 (Meta-режим — `personalWinrate`
не участвует). Оба веса — аргументы, движок не хранит состояния и не читает
конфиг сам (INV2).

Main-оркестратор — `DraftService` (`src/main/draft/DraftService.ts`):
пул кандидатов — тот же `content/meta-mid-heroes.json` (топ-40 мид-героев
меты), что греет `CacheWarmer` (TASK-025) при старте — поэтому
`DataService.getHeroMatchups` на реальном драфте почти всегда попадает в
SQLite-кэш, а не в сеть (регистрация конфига вынесена в отдельную
`startMetaMidHeroesConfig()`, общую для `CacheWarmer` и `DraftService` —
`ConfigLoader.register()` бросает при повторной регистрации одного имени).
Уже занятые в текущем драфте герои (свой/союзники/враги) исключаются из
кандидатов. Личная статистика — `DataService.getHeroPool` (TASK-031), только
если Steam ID привязан; без привязки `personalWinrate=null` у всех кандидатов.
`computeRankings()` считает Meta И Personal ЗА ОДИН вызов над одним и тем же
набором данных — `draft:update` пушит оба массива вместе (см. раздел 6),
переключатель в панели драфта (TASK-029) показывает любой мгновенно, без
повторного запроса. Отказ `getHeroMatchups` для одного героя
(`Promise.allSettled`) не прерывает построение остальных кандидатов.
`DraftRankings`/`DraftRankingsPayload` также несут агрегированные
`dataSource`/`dataStale` (TASK-029) — по всем УСПЕШНО полученным матчапам:
`'mixed'`, если разные кандидаты получили данные из разных источников
(нормально — часть уже в SQLite-кэше от `CacheWarmer`, часть только что
дошла до STRATZ/OpenDota), `'none'` — если ни один кандидат не получил
данных вовсе; `dataStale=true`, если хотя бы один источник — протухший
кэш (INV5). `DraftCandidate` также несёт `vsBreakdown`/`withBreakdown`
(`DraftMatchupBreakdownEntry[]`, `src/shared/schemas/advice.ts`) — по одному
элементу на КАЖДЫЙ открытый вражеский/союзный пик (даже без матчап-данных —
тогда `sampleSize=0`, `winrate=NEUTRAL_WINRATE`, а не пропуск элемента).

`DraftContextManager.subscribe()` (второй, независимый от `options.onChange`
канал уведомлений — тот уже занят логом+`draftContext:update`) пересчитывает
рейтинги на КАЖДОЕ изменение `DraftContext`, пока `stage='picking'`.
`heroName` пока заглушка `Hero <id>` — единого каталога id→имя героя ещё нет
(та же находка, что в TASK-027 про ручной ввод пиков) — follow-up для
владельца, теперь видимый напрямую в панели драфта (TASK-029).

Проверено на dev-Mac: `npm run dev` (с `MIDMIND_GSI_TOKEN` совпадающим с
токеном фикстуры, иначе GSI-сервер отвечает 401) + `curl` того же
HERO_SELECTION-пакета — лог показывает `[draft] stage=picking ownHero=25 ...`
сразу за ним `[draft-service] recomputed rankings (meta=39, personal=39)`
(39 = 40 кандидатов меты минус уже пикнутый свой герой); без `STRATZ_API_TOKEN`
матчапы шли через OpenDota-фолбэк (INV5) — весь прогон занял ~30с (сеть,
холодный кэш), что ожидаемо для первого прогона до `CacheWarmer`. Живой замер
задержки «≤2 сек после нового пика» на прогретом кэше — ждёт Windows-машины
владельца (как и остальные живые гейты, см. раздел 1); юнит-тесты
(`test/engine/draft.test.ts`, `test/main/draftService.test.ts`) покрывают
формулу и оркестрацию изолированно от сети.

### Панель драфта: список кандидатов (F1, TASK-029)

`DraftPanel.tsx` (`src/renderer/src/draftPanel/`, окно поднято TASK-027)
дополнен подпиской на `draft:update` (единственный потребитель канала до этой
задачи — раньше объявлен, но не читался renderer'ом). Переключатель
Meta/Personal читает/пишет `AppSettings.draftRankingMode` через
`settingsStore` (TASK-018) как единственный источник правды — НЕ локальный
`useState` — так режим переживает переоткрытие панели и остаётся синхронным
с остальными окнами одного профиля; переключение чисто локальный рендер (оба
ранжирования уже посчитаны в main за один вызов, TASK-028), без IPC-похода.
Строка кандидата разворачивается по клику — раскрытая карточка показывает
`vsBreakdown`/`withBreakdown` (винрейт+`sampleSize` по каждому открытому
пику, «нет данных» вместо 0%, если `sampleSize=0`), личный винрейт (или «Steam
ID не привязан») и общий `sampleSize`. `DataFreshnessBadge` — жёлтая метка
при `dataStale`, красная «нет данных по матчапам» при `dataSource='none'`.
`DRAFT_PANEL_WIDTH/HEIGHT` (`src/shared/overlay/draftPanel.ts`) увеличены
280×260 → 320×480 под список; координаты позиции по-прежнему не
откалиброваны под реальный HUD (ждут Windows-машины владельца).

Проверено на dev-Mac: `npm run dev` + `curl` того же HERO_SELECTION-пакета,
что в TASK-027/028 — `[draft-service] recomputed rankings (meta=39,
personal=39)`; `curl http://localhost:5173/index.html?window=draft-panel` —
HTTP 200, Vite компилирует `DraftPanel.tsx` без ошибок. Живой визуальный
прогон (список кликабелен поверх Dota, позиционирование не перекрывает сетку
выбора героя) — ждёт Windows-машины владельца, как и остальные живые гейты
(раздел 1); на dev-Mac нет Dota 2 для визуальной проверки клика по строке.

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

### Окружение цикла (Ralph)

`ralph.sh` запускает агента через `claude --dangerously-skip-permissions` с
`ECC_GATEGUARD=off`, поэтому `npm`/`npx`/`node`/`git commit` работают без подтверждений.
`node_modules` установлен. Значит агент ОБЯЗАН в каждой итерации:

1. реально прогнать `npm run typecheck` и `npm test` (не «предположить», что пройдут);
2. пометить задачу `done` ТОЛЬКО после того, как её `test_steps` реально прошли;
3. **сделать `git commit`** для завершённой фичи — это часть итерации, а не опция.

> История: раньше здесь стояло ограничение «песочница не даёт `npm`/`git commit`» — оно
> устарело (снято 2026-07-09; настоящей причиной был `acceptEdits`-режим в `ralph.sh`).
> Не переноси этот запрет обратно: если коммит вдруг не проходит — чини причину, а не
> отказывайся коммитить.

---

## 8. Открытые вопросы (влияют на объём задач)

Полный список — `project.open_questions` в `tasks.json` (текст там не правится
задним числом за пределами `status` задач — актуальность see ниже).

- ~~Видны ли в GSI пики обеих команд на стадии `HERO_SELECTION`?~~ ЗАКРЫТО
  (TASK-009, `docs/gsi-fields.md`): **нет** — `draft` пуст `{}` во всех
  пакетах всех трёх собранных сессий, включая полную рейтинговую стадию
  пиков; видны только баны (`CHAT_MESSAGE_HERO_BANNED`). TASK-027 строится
  на ручном вводе пиков, авто-детект через GSI в игроцком режиме исключён.
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
