import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/index'
import { GsiServer } from './gsi'
import { ConfigLoader, mirrorContentDir, type ConfigHandle } from './config'
import { TimingScheduler } from './timings'
import { TimingsConfigSchema, type TimingsConfig } from '@shared/schemas/timings'
import { upcomingTimingEvents, selectCompactPanelTimers } from '@engine/timings'
import {
  COMPACT_PANEL_WINDOW_ID,
  DEFAULT_COMPACT_PANEL_WIDGET_IDS,
  COMPACT_PANEL_DEFAULT_POSITION,
  COMPACT_PANEL_WIDTH,
  compactPanelHeight
} from '@shared/overlay/compactPanel'
import {
  NOTIFICATIONS_WIDTH,
  NOTIFICATIONS_HEIGHT,
  NOTIFICATIONS_POSITION
} from '@shared/overlay/notifications'
import { DRAFT_PANEL_WIDTH, DRAFT_PANEL_HEIGHT, DRAFT_PANEL_POSITION } from '@shared/overlay/draftPanel'
import { EXPANDED_PANEL_WIDTH, EXPANDED_PANEL_HEIGHT, EXPANDED_PANEL_POSITION } from '@shared/overlay/expandedPanel'
import {
  broadcast,
  registerSettingsHandlers,
  registerDraftHandlers,
  registerGsiFieldCatalogHandlers,
  registerLanePlanHandlers,
  registerBenchmarksHandlers,
  createSettingsController,
  type SettingsController
} from './ipc'
import { GsiFieldCatalogConfigSchema, type GsiFieldCatalogConfig } from '@shared/schemas/gsiFieldCatalog'
import { BenchmarksConfigSchema, type BenchmarksConfig } from '@shared/schemas/benchmarks'
import type { AppSettings } from '@shared/schemas/settings'
import { AdviceScheduler, AdviceGate } from './advice'
import type { Advice } from '@shared/schemas/advice'
import { HotkeyManager, createHotkeyBackends } from './hotkeys'
import { OverlayWindow } from './windows'
import { AutoLaunchManager } from './autolaunch'
import {
  createStratzClient,
  createOpenDotaClient,
  DataService,
  MatchupCacheStore,
  HeroPoolCacheStore,
  BuildCacheStore,
  CacheWarmer,
  type StratzClient
} from './data'
import { PatchWatcher } from './patch'
import { steamId64ToAccountId } from '@shared/steam/parseSteamId64'
import { MetaMidHeroesConfigSchema, type MetaMidHeroesConfig } from '@shared/schemas/metaMidHeroes'
import { RulesConfigSchema, type RulesConfig } from '@shared/schemas/rules'
import { HeroProfilesConfigSchema, type HeroProfilesConfig } from '@shared/schemas/heroProfiles'
import { MatchupKnowledgeConfigSchema, type MatchupKnowledgeConfig } from '@shared/schemas/matchupKnowledge'
import { buildFacts } from '@engine/facts'
import { LanePlanBuilder, type LanePlan } from './lane'
import { openDatabase, runMigrations, UserProfileRepository, AppStateStore, type DatabaseInstance } from './db'
import {
  buildGsiConfigContent,
  findDotaCfgDir,
  listCandidateDotaInstallRoots,
  GsiConfigInstaller
} from './gsiInstall'
import { SteamIdDetector } from './steam'
import { MatchCompletionDetector, MatchHistoryStore } from './matchHistory'
import { DraftContextManager, DraftService } from './draft'

/**
 * Shared-токен GSI. Секреты — только через окружение (см. CLAUDE.md §5):
 * MIDMIND_GSI_TOKEN задаётся установщиком cfg (TASK-006). Для dev — фолбэк-строка.
 */
const GSI_AUTH_TOKEN = process.env['MIDMIND_GSI_TOKEN'] ?? 'midmind-dev-token'

let gsiServer: GsiServer | null = null
let configLoader: ConfigLoader | null = null
let timingScheduler: TimingScheduler | null = null
let adviceScheduler: AdviceScheduler | null = null
let adviceGate: AdviceGate | null = null
let timingsConfigHandle: ConfigHandle<TimingsConfig> | null = null
let rulesConfigHandle: ConfigHandle<RulesConfig> | null = null
let heroProfilesConfigHandle: ConfigHandle<HeroProfilesConfig> | null = null
let matchupKnowledgeConfigHandle: ConfigHandle<MatchupKnowledgeConfig> | null = null
let metaMidHeroesConfigHandle: ConfigHandle<MetaMidHeroesConfig> | null = null
let gsiFieldCatalogConfigHandle: ConfigHandle<GsiFieldCatalogConfig> | null = null
let benchmarksConfigHandle: ConfigHandle<BenchmarksConfig> | null = null
let unsubscribeAdviceGateFacts: (() => void) | null = null
let stratzClient: StratzClient | null = null
let database: DatabaseInstance | null = null
let userProfileRepository: UserProfileRepository | null = null
let dataService: DataService | null = null
let settingsController: SettingsController | null = null
let hotkeyManager: HotkeyManager | null = null
let overlayWindow: OverlayWindow | null = null
let compactPanelWindow: OverlayWindow | null = null
let notificationsWindow: OverlayWindow | null = null
let draftPanelWindow: OverlayWindow | null = null
let expandedPanelWindow: OverlayWindow | null = null
/** Открыта ли расширенная панель (F9) — независимо от тихого режима, см. applySilentMode/onToggleExpandedPanel (TASK-037). */
let expandedPanelOpen = false
/** Последний собранный LanePlan (TASK-037) — источник для invoke lanePlan:get (окно открылось уже после финализации пиков). */
let lastLanePlan: LanePlan | null = null
let autoLaunchManager: AutoLaunchManager | null = null
let cacheWarmer: CacheWarmer | null = null
let lanePlanBuilder: LanePlanBuilder | null = null
let steamIdDetector: SteamIdDetector | null = null
let matchHistoryStore: MatchHistoryStore | null = null
let matchCompletionDetector: MatchCompletionDetector | null = null
let appStateStore: AppStateStore | null = null
let patchWatcher: PatchWatcher | null = null
let draftContextManager: DraftContextManager | null = null
let draftService: DraftService | null = null

/**
 * Поднимает config-loader (TASK-011): в проде зеркалит встроенный content/ в
 * записываемый userData (чтобы правки переживали обновление и работал watch), в
 * dev читает content/ напрямую. Конкретные конфиги (timings/rules/hero-profiles/
 * matchup-knowledge/gsi-field-catalog/benchmarks) регистрируются в своих задачах
 * (TASK-012/034/035/042/009/038) — здесь только инфраструктура и hot-reload.
 */
function startConfigLoader(): void {
  const bundledContent = app.isPackaged
    ? join(process.resourcesPath, 'content')
    : join(app.getAppPath(), 'content')
  const userContent = join(app.getPath('userData'), 'content')

  let dir = bundledContent
  if (app.isPackaged && existsSync(bundledContent)) {
    const copied = mirrorContentDir(bundledContent, userContent)
    if (copied.length > 0) {
      console.log(`[config] mirrored ${copied.length} config(s) to userData`)
    }
    dir = userContent
  }

  configLoader = new ConfigLoader({
    dir,
    logger: (message) => console.log(`[config] ${message}`),
    onReloaded: (payload) => {
      console.log(`[config] reloaded '${payload.name}': ${payload.status}`)
      broadcast('config:reloaded', payload)
    }
  })
}

/**
 * Поднимает пайплайн уведомлений F5 (TASK-013): очередь с приоритетами, не
 * более 2 уведомлений «на экране» одновременно, каждое гаснет через 5-8 сек,
 * освобождая слот следующему. Источники Advice (сейчас — TimingScheduler F3,
 * позже — advice-gate F4/TASK-044) зовут adviceScheduler.enqueue(); сама push в
 * renderer через advice:push — единственная точка, знающая про broadcast.
 */
function startAdviceScheduler(): void {
  adviceScheduler = new AdviceScheduler({
    push: (advice) => broadcast('advice:push', advice)
  })
}

/**
 * Тихий режим F5 (TASK-019): новые уведомления НЕ показываются, пока оверлей
 * скрыт — подавляются целиком (не ставятся в очередь), иначе они разом
 * посыпались бы в момент выхода из тихого режима. Единая точка входа для
 * обоих источников Advice (F3/TimingScheduler и F4/AdviceGate), чтобы
 * проверка не дублировалась в двух местах.
 */
function enqueueAdviceUnlessSilenced(advice: Advice): void {
  if (settingsController?.get().silentMode) {
    return
  }
  adviceScheduler?.enqueue(advice)
}

/**
 * Поднимает планировщик тайминговых напоминалок F3 (TASK-012): регистрирует
 * timings.json через ConfigLoader (hot-reload) и подписывает чистый движок
 * engine/timings на поток GSI из GameStateStore. Требует уже поднятых
 * configLoader (startConfigLoader), gsiServer (startGsiServer) и
 * adviceScheduler (startAdviceScheduler).
 *
 * onAlert логирует и отдаёт уведомление в очередь AdviceScheduler (TASK-013),
 * которая сама решает, когда именно оно уйдёт в renderer. Перед этим уведомление
 * проходит умное подавление AdviceGate.isSuppressed (TASK-044: не показывать
 * F3-события вроде напоминания о стаке кемпа, если герой мёртв или идёт активный
 * файт — раздел F3 PRD). GameStateStore.set() уведомляет подписчиков синхронно
 * в порядке подписки (см. GameStateStore) — поэтому startAdviceGate ДОЛЖЕН
 * подписаться на стор раньше startTimingScheduler (см. порядок вызовов в
 * app.whenReady): иначе AdviceGate.onFacts (обновляет heroAlive/health-историю)
 * ещё не отработает для текущего тика, когда сюда придёт isSuppressed, и проверка
 * будет читать состояние с предыдущего тика. Отключение типов (getDisabledEventIds)
 * подключит проекция настроек из TASK-018.
 */
function startTimingScheduler(): void {
  if (!configLoader || !gsiServer || !adviceScheduler) {
    return
  }
  timingsConfigHandle = configLoader.register('timings', TimingsConfigSchema)
  const timings = timingsConfigHandle
  timingScheduler = new TimingScheduler({
    store: gsiServer.store,
    getEvents: () => timings.get(),
    onAlert: (advice) => {
      if (adviceGate?.isSuppressed(advice.severity)) {
        console.log(`[timings] ${advice.ruleId} suppressed by advice-gate (hero dead or active fight)`)
        return
      }
      console.log(`[timings] ${advice.ruleId}: ${advice.message}`)
      enqueueAdviceUnlessSilenced(advice)
    }
  })
  timingScheduler.start()
}

/**
 * Пушит таймеры компактной панели (F5 режим 1, TASK-014: `compactPanel:timers`)
 * на каждый тик GSI: nextEvent/nextRune считает чистая selectCompactPanelTimers
 * (engine/timings) над тем же timings.json, что уже читает TimingScheduler —
 * без второго расписания (INV4). Renderer сам engine/timings не импортирует
 * (INV1), получает только готовые labelRu/secondsUntil. Требует уже поднятых
 * gsiServer (startGsiServer) и timingsConfigHandle (устанавливается внутри
 * startTimingScheduler — вызывать после неё).
 */
function startTimingsBroadcast(): void {
  if (!gsiServer || !timingsConfigHandle) {
    return
  }
  const timings = timingsConfigHandle
  gsiServer.store.subscribe((state) => {
    const clockTimeSec = state.map?.clockTime ?? null
    if (clockTimeSec === null) {
      return
    }
    const events = timings.get()?.events ?? []
    const upcoming = upcomingTimingEvents(events, clockTimeSec)
    broadcast('compactPanel:timers', selectCompactPanelTimers(upcoming))
    // F5 конструктор виджетов (TASK-016): те же upcoming-события целиком, без
    // схлопывания в nextEvent/nextRune — именованным пресетам (rune-timer/
    // stack-counter) нужен произвольный eventId, не только 'ближайшее из всех'.
    broadcast(
      'timings:upcoming',
      upcoming.map(({ eventId, labelRu, secondsUntil }) => ({ eventId, labelRu, secondsUntil }))
    )
  })
}

/**
 * Регистрирует rules.json через ConfigLoader (F4, TASK-042): формат
 * декларативных правил (JSON Logic `condition` над плоским объектом фактов,
 * TASK-041) с hot-reload — правка файла подхватывается без пересборки/рестарта
 * (INV4). Реального потребителя ещё нет: вычисление condition (json-logic
 * apply) — TASK-043 (src/engine/rules). Реальный потребитель — AdviceGate
 * (TASK-044, startAdviceGate), который читает актуальный набор правил через
 * rulesConfigHandle.get() на каждый тик GSI. Требует уже поднятого configLoader.
 */
function startRulesConfig(): void {
  if (!configLoader) {
    return
  }
  rulesConfigHandle = configLoader.register('rules', RulesConfigSchema)
  const config = rulesConfigHandle.get()
  console.log(`[rules] rules.json ready (${config?.rules.length ?? 0} rule(s))`)
}

/**
 * Регистрирует hero-profiles.json через ConfigLoader (F2/F4, TASK-034):
 * герой-зависимые параметры (ult_is_kill_window, power_spike_levels,
 * aggression_pattern, typical_level6_time_sec), на которые ссылаются
 * правила F4 (TASK-043) и fact-builder (TASK-041, estimated_enemy_level),
 * вместо жёстко зашитых по герою условий. Правка/добавление профиля
 * подхватывается hot-reload'ом без пересборки (INV4). Потребитель — AdviceGate
 * (TASK-044, startAdviceGate), который ищет профиль своего героя по
 * gameState.hero.id на каждый тик GSI. Требует уже поднятого configLoader.
 */
function startHeroProfilesConfig(): void {
  if (!configLoader) {
    return
  }
  heroProfilesConfigHandle = configLoader.register('hero-profiles', HeroProfilesConfigSchema)
  const config = heroProfilesConfigHandle.get()
  console.log(`[hero-profiles] hero-profiles.json ready (${config?.profiles.length ?? 0} profile(s))`)
}

/**
 * Регистрирует matchup-knowledge.json через ConfigLoader (F2, TASK-035):
 * направленные карточки пар (heroId, vsHeroId) — do_tips/avoid_tips/
 * power_spikes/kill_windows с позиции heroId (раздел 5.2 PRD). Правка/
 * добавление пары подхватывается hot-reload'ом без пересборки (INV4).
 * Реального потребителя ещё нет: LanePlanBuilder (TASK-036, deps на этот
 * таск) читает карточку по (свой герой, вражеский мидер) после финализации
 * пиков, а engine/facts (TASK-041, buildFacts) уже принимает опциональный
 * MatchupFactsContext.killWindowLevels аргументом — main-оркестратор сможет
 * прокинуть его в startAdviceGate, как только появится источник
 * enemyMidHeroId (детект драфта, TASK-027). Требует уже поднятого configLoader.
 */
function startMatchupKnowledgeConfig(): void {
  if (!configLoader) {
    return
  }
  matchupKnowledgeConfigHandle = configLoader.register('matchup-knowledge', MatchupKnowledgeConfigSchema)
  const config = matchupKnowledgeConfigHandle.get()
  console.log(`[matchup-knowledge] matchup-knowledge.json ready (${config?.entries.length ?? 0} entr(y/ies))`)
}

/**
 * Поднимает F4 advice-gate (TASK-044): на каждый тик GameStateStore строит
 * Facts (TASK-041, buildFacts) из текущего GameState + профиля СВОЕГО героя
 * (hero-profiles.json по gameState.hero.id), прогоняет их через AdviceGate,
 * которая сама вызывает evaluateRules (TASK-043) над актуальным rules.json и
 * гейтит результат (per-rule cooldown, глобальный лимит ≤1/30с, умное
 * подавление на смерти/файте). Прошедшие кандидаты уходят в очередь
 * AdviceScheduler (TASK-013).
 *
 * Вражеский мидер (enemyMidHeroId/enemyHeroProfile) и matchup-контекст пока не
 * подаются — их источник (детект драфта TASK-027, matchup-knowledge TASK-035)
 * ещё не реализован; buildFacts корректно работает и без них (Facts.enemyHero
 * будет { heroId: null, ... }). timingEvents берутся из уже поднятого
 * timingsConfigHandle (TASK-012) — нужны для factов powerRuneWindow, без
 * дублирования расписания руны силы (INV4).
 *
 * Требует уже поднятых configLoader, gsiServer, adviceScheduler.
 */
function startAdviceGate(): void {
  if (!configLoader || !gsiServer || !adviceScheduler || !rulesConfigHandle || !heroProfilesConfigHandle) {
    return
  }
  adviceGate = new AdviceGate({
    emit: (advice) => {
      console.log(`[advice-gate] ${advice.ruleId}: ${advice.message}`)
      enqueueAdviceUnlessSilenced(advice)
    }
  })
  unsubscribeAdviceGateFacts = gsiServer.store.subscribe((state) => {
    const rules = rulesConfigHandle?.get()?.rules ?? []
    if (rules.length === 0) {
      return
    }
    const myHeroProfile = heroProfilesConfigHandle
      ?.get()
      ?.profiles.find((profile) => profile.heroId === state.hero?.id)
    const facts = buildFacts({
      gameState: state,
      myHeroProfile,
      timingEvents: timingsConfigHandle?.get()?.events
    })
    adviceGate?.onFacts(facts, rules)
  })
}

/**
 * Поднимает автоопределение Steam ID (F6, TASK-030): подписывает
 * SteamIdDetector на поток GSI, и как только приходит player.steamid при
 * непривязанном профиле (settingsController.get().steamId === null), пушит
 * renderer'у steamId:detected один раз за сессию. Ничего не персистится
 * автоматически — привязку подтверждает пользователь через settings:set
 * (см. renderer/src/store/steamIdStore.ts). Требует уже поднятых gsiServer
 * (startGsiServer) и settingsController (startSettings).
 */
function startSteamIdDetection(): void {
  if (!gsiServer || !settingsController) {
    return
  }
  steamIdDetector = new SteamIdDetector({
    getBoundSteamId: () => settingsController?.get().steamId ?? null,
    onDetected: (steamId) => {
      console.log(`[steam-id] detected ${steamId} from GSI — awaiting user confirmation`)
      broadcast('steamId:detected', { steamId })
    }
  })
  gsiServer.store.subscribe((state) => {
    steamIdDetector?.onGameState(state.player?.steamId)
  })
}

/**
 * Поднимает F1 детект драфта (TASK-027): подписывает DraftContextManager на
 * поток GSI — стадия драфта из map.gameState (HERO_SELECTION → picking →
 * finalized) и собственный герой (hero.id становится известен ещё на стадии
 * HERO_SELECTION, до конца пика). GSI НЕ отдаёт пики команд игроку ни в одной
 * из трёх захваченных сессий (docs/gsi-fields.md, открытый вопрос #1 TASK-009
 * закрыт) — enemyHeroIds/allyHeroIds/enemyMidHeroId наполняются ТОЛЬКО ручным
 * вводом через invoke-канал draftContext:applyManualAction
 * (registerDraftHandlers). onChange пушит draftContext:update renderer'у
 * ТОЛЬКО при реальном изменении контекста (см. DraftContextManager.setContext) —
 * не на каждый GSI-тик (~2 Гц). getEnemyMidHeroId() становится реальным
 * источником для MatchCompletionDetector (TASK-033, startMatchHistory) вместо
 * захардкоженного null — см. её комментарий. Требует уже поднятого gsiServer
 * (startGsiServer), вызывать ДО startMatchHistory.
 */
function startDraftContext(): void {
  if (!gsiServer) {
    return
  }
  draftContextManager = new DraftContextManager({
    onChange: (context) => {
      console.log(
        `[draft] stage=${context.stage} ownHero=${context.ownHeroId ?? 'unknown'} enemies=[${context.enemyHeroIds}] allies=[${context.allyHeroIds}] enemyMid=${context.enemyMidHeroId ?? 'unset'}`
      )
      broadcast('draftContext:update', context)
    }
  })
  gsiServer.store.subscribe((state) => draftContextManager?.onGameState(state))
  registerDraftHandlers(draftContextManager)
}

/**
 * Создаёт STRATZ GraphQL-клиент (TASK-021), если STRATZ_API_TOKEN задан в
 * окружении (см. .env.example). Отсутствие токена — не ошибка: приложение
 * продолжает работать, STRATZ-фичи станут доступны через DataService-фасад
 * (TASK-026) с деградацией на OpenDota/кэш (INV5).
 */
function startStratzClient(): void {
  stratzClient = createStratzClient((message) => console.log(message))
  if (stratzClient) {
    console.log(`[stratz] client ready (${stratzClient.attribution})`)
  }
}

/**
 * Собирает DataService-фасад (TASK-026) — единственную точку входа для будущих
 * потребителей (DraftService/TASK-028, LanePlanBuilder/TASK-036) для матчапов/
 * пула героев/билдов/истории матчей. Реализует лестницу деградации STRATZ →
 * OpenDota → SQLite stale-кэш → явное "нет данных" (INV5). Требует уже открытой
 * БД (startDatabase) и созданного (или отсутствующего) STRATZ-клиента
 * (startStratzClient); OpenDota-клиент не требует токена и создаётся всегда.
 */
function startDataService(): void {
  if (!database) {
    return
  }
  const openDotaClient = createOpenDotaClient((message) => console.log(message))
  dataService = new DataService(new MatchupCacheStore(database), stratzClient, openDotaClient, {
    heroPoolCacheStore: new HeroPoolCacheStore(database),
    buildCacheStore: new BuildCacheStore(database)
  })
  if (dataService) {
    console.log('[data] DataService ready (STRATZ→OpenDota→cache degradation ladder wired)')
  }
}

/**
 * PatchWatcher (TASK-047): при старте (после startDatabase/startStratzClient)
 * сверяет текущий патч STRATZ с последним увиденным (app_state.lastSeenPatch)
 * и, если он реально сменился с прошлого запуска, рассылает баннер
 * 'patch:changed' во все окна ("данные обновляются" — раздел M6 PRD). Без
 * STRATZ-клиента (нет токена/офлайн) check() тихо возвращает null — ничего не
 * рассылается, ничего не падает (INV5-совместимая деградация). Вызывается
 * без await — не блокирует запуск приложения, как и CacheWarmer.
 */
function startPatchWatcher(): void {
  if (!database) {
    return
  }
  appStateStore = new AppStateStore(database)
  patchWatcher = new PatchWatcher(stratzClient, appStateStore, {
    logger: (message) => console.log(message)
  })
  void patchWatcher.check().then((result) => {
    if (result?.changed) {
      broadcast('patch:changed', { patch: result.patch })
      console.log(`[patch] broadcast patch:changed (${result.patch})`)
    }
  })
}

/**
 * Регистрирует content/meta-mid-heroes.json (TASK-011 hot-reload) — список
 * топ-мид-героев меты + scope (patch/rankBracket), общий для CacheWarmer
 * (TASK-025, startCacheWarmer) и DraftService (TASK-028, startDraftService:
 * пул кандидатов на пик). Регистрируется ОДИН раз здесь, а не в каждом
 * потребителе — ConfigLoader.register() бросает при повторной регистрации
 * того же имени. Требует уже поднятого configLoader.
 */
function startMetaMidHeroesConfig(): void {
  if (!configLoader) {
    return
  }
  metaMidHeroesConfigHandle = configLoader.register('meta-mid-heroes', MetaMidHeroesConfigSchema)
}

/**
 * Регистрирует gsi-field-catalog.json через ConfigLoader (F5, TASK-016):
 * каталог сырых GSI-полей для конструктора виджетов (fieldPath/labelRu/
 * category/format/preset, TASK-009). Правка/добавление поля подхватывается
 * hot-reload'ом без пересборки (INV4) — renderer узнаёт об этом из уже
 * существующего 'config:reloaded' (name='gsi-field-catalog') и перезапрашивает
 * актуальную версию через invoke-канал gsiFieldCatalog:get
 * (registerGsiFieldCatalogHandlers). Требует уже поднятого configLoader.
 */
function startGsiFieldCatalogConfig(): void {
  if (!configLoader) {
    return
  }
  gsiFieldCatalogConfigHandle = configLoader.register('gsi-field-catalog', GsiFieldCatalogConfigSchema)
  registerGsiFieldCatalogHandlers(gsiFieldCatalogConfigHandle)
  const config = gsiFieldCatalogConfigHandle.get()
  console.log(`[gsi-field-catalog] gsi-field-catalog.json ready (${config?.fields.length ?? 0} field(s))`)
}

/**
 * Регистрирует content/benchmarks.json через ConfigLoader (F5, TASK-039):
 * эталонные поминутные кривые LH/networth/XP (TASK-038) для бенчмарк-
 * виджетов конструктора. Правка/перегенерация файла (напр. после смены
 * патча) подхватывается hot-reload'ом без пересборки (INV4) — renderer
 * узнаёт об этом из уже существующего 'config:reloaded' (name='benchmarks')
 * и перезапрашивает актуальную версию через invoke-канал benchmarks:get
 * (registerBenchmarksHandlers). Требует уже поднятого configLoader.
 */
function startBenchmarksConfig(): void {
  if (!configLoader) {
    return
  }
  benchmarksConfigHandle = configLoader.register('benchmarks', BenchmarksConfigSchema)
  registerBenchmarksHandlers(benchmarksConfigHandle)
  const config = benchmarksConfigHandle.get()
  console.log(`[benchmarks] benchmarks.json ready (${config?.length ?? 0} point(s))`)
}

/**
 * Запускает фоновый прогрев кэша матчапов (CacheWarmer, TASK-025): греет
 * MatchupCacheStore по списку топ-мид-героев меты (metaMidHeroesConfigHandle,
 * startMetaMidHeroesConfig) через уже собранный DataService (STRATZ→OpenDota→cache,
 * TASK-026), чтобы первый скрининг драфта не ждал сети. Требует
 * metaMidHeroesConfigHandle и dataService. Вызывается БЕЗ await — прогрев не
 * блокирует запуск/показ окна; ошибки отдельных героев не прерывают его (см.
 * CacheWarmer.run()).
 */
function startCacheWarmer(): void {
  if (!metaMidHeroesConfigHandle || !dataService) {
    return
  }
  const config = metaMidHeroesConfigHandle.get()
  if (!config) {
    console.log('[cache-warmer] meta-mid-heroes.json invalid or missing — warmer not started')
    return
  }
  cacheWarmer = new CacheWarmer(dataService, config.heroIds, {
    patch: config.patch,
    rankBracket: config.rankBracket
  }, {
    onProgress: (progress) => broadcast('cacheWarmer:progress', progress),
    logger: (message) => console.log(message)
  })
  void cacheWarmer.run()
}

/**
 * Собирает DraftService (F1, TASK-028): скоринг кандидатов на пик по формуле
 * раздела F1 PRD (score = w1*counter + w2*synergy + w3*personal, engine/draft).
 * Пул кандидатов — тот же content/meta-mid-heroes.json, что греет CacheWarmer
 * (metaMidHeroesConfigHandle, startMetaMidHeroesConfig) — поэтому матчапы
 * почти всегда уже в SQLite-кэше к моменту реального драфта. heroName пока
 * заглушка `Hero <id>` — единого каталога id→имя героя ещё нет (см. находку
 * TASK-027 в progress.txt); UI-задача TASK-029 сможет заменить геттер, когда
 * каталог появится, без изменений в DraftService.
 *
 * Подписывается на draftContextManager.subscribe() (не options.onChange —
 * тот уже занят логом+draftContext:update, см. startDraftContext) и на
 * КАЖДОЕ изменение контекста ПОКА stage='picking' пересчитывает оба
 * ранжирования и пушит их в draft:update (TASK-028 test step 3: "≤2 сек
 * после нового пика" — задержка целиком определяется тем, что матчапы уже в
 * кэше, а не сетью). steamAccountId берётся из settingsController на момент
 * пересчёта (может быть null — тогда personalWinrate=null у всех кандидатов).
 *
 * Требует уже поднятых dataService, metaMidHeroesConfigHandle и
 * draftContextManager (startDataService/startMetaMidHeroesConfig/startDraftContext).
 */
function startDraftService(): void {
  if (!dataService || !metaMidHeroesConfigHandle || !draftContextManager) {
    return
  }
  draftService = new DraftService(
    dataService,
    () => {
      const config = metaMidHeroesConfigHandle?.get()
      return config ? { heroIds: config.heroIds, scope: { patch: config.patch, rankBracket: config.rankBracket } } : null
    },
    (heroId) => `Hero ${heroId}`,
    { logger: (message) => console.log(message) }
  )
  draftContextManager.subscribe((context) => {
    if (context.stage !== 'picking' || !draftService) {
      return
    }
    const steamId64 = settingsController?.get().steamId
    const steamAccountId = steamId64 ? steamId64ToAccountId(steamId64) : null
    void draftService.computeRankings(context, steamAccountId).then((rankings) => {
      console.log(`[draft-service] recomputed rankings (meta=${rankings.meta.length}, personal=${rankings.personal.length})`)
      broadcast('draft:update', rankings)
    })
  })
}

/**
 * Собирает LanePlanBuilder (F2, TASK-036): единственную точку сборки плана
 * на лайн для пары (свой герой, вражеский мидер) — билд+скиллбилд из
 * DataService.getHeroBuilds, карточка матчапа из matchup-knowledge.json
 * (heroProfilesConfigHandle/matchupKnowledgeConfigHandle уже подняты
 * startHeroProfilesConfig/startMatchupKnowledgeConfig), винрейт пары из
 * DataService.getHeroMatchups, личная статистика пары из
 * MatchHistoryStore.personalMatchupRecord (TASK-037). Требует уже собранного
 * dataService (startDataService) и draftContextManager (startDraftContext);
 * matchHistoryStore опционален — без него personalMatchup всегда null (не
 * блокирует сборку плана).
 *
 * Реальный триггер (TASK-037): подписка на draftContextManager.subscribe()
 * (не options.onChange — тот уже занят логом+draftContext:update, см.
 * startDraftContext; тот же приём, что startDraftService) вызывает build()
 * на КАЖДЫЙ переход контекста в stage='finalized' с известными ownHeroId и
 * enemyMidHeroId, и рассылает результат в 'lanePlan:update' — расширенная
 * панель (startExpandedPanelWindow) её единственный текущий подписчик.
 * Переход в stage='idle' (новый матч, DraftContextManager) сбрасывает
 * lastLanePlan/рассылает null — старый план из прошлого матча не должен
 * висеть в открытой панели. scope (patch/rankBracket) — тот же
 * metaMidHeroesConfigHandle, что использует DraftService (startDraftService).
 */
function startLanePlanBuilder(): void {
  if (!dataService || !heroProfilesConfigHandle || !matchupKnowledgeConfigHandle || !draftContextManager) {
    return
  }
  lanePlanBuilder = new LanePlanBuilder(
    dataService,
    () => heroProfilesConfigHandle?.get() ?? null,
    () => matchupKnowledgeConfigHandle?.get() ?? null,
    (heroId, enemyHeroId) => matchHistoryStore?.personalMatchupRecord(heroId, enemyHeroId) ?? null,
    { logger: (message) => console.log(message) }
  )
  console.log(`[lane-plan] LanePlanBuilder ready: ${lanePlanBuilder !== null}`)

  draftContextManager.subscribe((context) => {
    if (context.stage === 'idle') {
      lastLanePlan = null
      broadcast('lanePlan:update', null)
      return
    }
    if (context.stage !== 'finalized' || context.ownHeroId === null || context.enemyMidHeroId === null) {
      return
    }
    const metaConfig = metaMidHeroesConfigHandle?.get()
    const scope = { patch: metaConfig?.patch ?? 'unknown', rankBracket: metaConfig?.rankBracket ?? 'unknown' }
    void lanePlanBuilder?.build(context.ownHeroId, context.enemyMidHeroId, scope).then((plan) => {
      lastLanePlan = plan
      broadcast('lanePlan:update', plan)
      console.log(`[lane-plan] built plan for hero ${plan.myHeroId} vs enemy mid ${plan.enemyHeroId}`)
    })
  })
}

/**
 * Поднимает F6 историю матчей (TASK-033): подписывает MatchCompletionDetector
 * на поток GameState и на каждый обнаруженный завершённый матч (переход в
 * DOTA_GAMERULES_STATE_POST_GAME для нового matchId) пишет сводку в
 * MatchHistoryStore (match_history) и точечно освежает HeroPoolCacheStore
 * (matches_count/winrate текущего героя) для привязанного профиля — без
 * привязанного Steam ID пул героев не обновляется (нет строки, которую можно
 * было бы освежить), но история матча всё равно записывается. enemyMidHeroId
 * берётся из DraftContextManager.getEnemyMidHeroId() (TASK-027, ручной ввод —
 * GSI пики команд не отдаёт) — null, пока пользователь не задал мидера
 * вручную. Требует уже поднятых database (startDatabase) и gsiServer
 * (startGsiServer); settingsController опционален (может быть ещё не
 * поднят/профиль не привязан); вызывать ПОСЛЕ startDraftContext.
 */
function startMatchHistory(): void {
  if (!database || !gsiServer) {
    return
  }
  matchHistoryStore = new MatchHistoryStore(database)
  const heroPoolStore = new HeroPoolCacheStore(database)

  matchCompletionDetector = new MatchCompletionDetector({
    getEnemyMidHeroId: () => draftContextManager?.getEnemyMidHeroId() ?? null,
    logger: (message) => console.log(message),
    onMatchCompleted: (summary) => {
      matchHistoryStore?.write(summary)
      console.log(
        `[match-history] recorded match ${summary.matchId} (hero ${summary.heroId}, result=${summary.result})`
      )
      const steamId64 = settingsController?.get().steamId
      if (steamId64) {
        const accountId = steamId64ToAccountId(steamId64)
        heroPoolStore.applyMatchResult(String(accountId), summary.heroId, summary.result, new Date().toISOString())
      }
    }
  })
  gsiServer.store.subscribe((state) => matchCompletionDetector?.onGameState(state))
}

/**
 * Открывает SQLite-БД в userData (TASK-010), применяет миграции идемпотентно и
 * гарантирует наличие профиля пользователя (создаёт дефолтный при первом
 * запуске: verbosity=experienced, hotkey=F9, draft_mode=meta — см. shared
 * DEFAULT_USER_PROFILE_FIELDS).
 */
function startDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'midmind.db')
  database = openDatabase(dbPath)
  runMigrations(database)
  userProfileRepository = new UserProfileRepository(database)
  const profile = userProfileRepository.getOrCreate()
  console.log(`[db] profile ready (verbosity=${profile.verbosity}, hotkey=${profile.hotkeyExpandedPanel})`)
}

/**
 * Единственная точка мутации настроек (TASK-018): и invoke-обработчик
 * settings:set (renderer-инициированные изменения), и хоткей тихого режима
 * (main-инициированные) идут через SettingsController.apply(), которая сама
 * персистит (UserProfileRepository), рассылает settings:update во все окна
 * (main — источник правды, включая инициатора) и реконсилирует HotkeyManager,
 * если сменился один из акселераторов.
 *
 * F6 (TASK-031): дополнительно отслеживает предыдущее значение steamId в
 * замыкании (previousSteamId) — как только apply() персистит НОВОЕ непустое
 * значение (привязка или смена ID, не отвязка/не повторный apply того же
 * значения от другого поля патча), запускает синхронизацию пула героев
 * (syncHeroPool). SteamIdDetector (startSteamIdDetection) сюда не достаёт —
 * он только предлагает id, реальная привязка всегда идёт через apply().
 *
 * M6 (TASK-046): также держит OS-регистрацию автозапуска (AutoLaunchManager)
 * в согласии с AppSettings.autoLaunch — реконсилирует её один раз сразу
 * после чтения текущего профиля (на случай рассинхрона с прошлого запуска)
 * и на каждую последующую мутацию, тем же приёмом, что HotkeyManager.
 */
function startSettings(): void {
  if (!userProfileRepository) {
    return
  }
  const initialProfile = userProfileRepository.getOrCreate()
  let previousSteamId = initialProfile.steamId
  autoLaunchManager = new AutoLaunchManager({ logger: (message) => console.log(`[autolaunch] ${message}`) })
  autoLaunchManager.reconcile(initialProfile.autoLaunch)
  settingsController = createSettingsController(userProfileRepository, (settings) => {
    broadcast('settings:update', settings)
    hotkeyManager?.reconcile(settings)
    autoLaunchManager?.reconcile(settings.autoLaunch)
    resizeCompactPanelWindow(settings)
    applySilentMode(settings.silentMode)
    if (settings.steamId && settings.steamId !== previousSteamId) {
      syncHeroPool(settings.steamId)
    }
    previousSteamId = settings.steamId
  })
  registerSettingsHandlers(settingsController)
}

/**
 * Тихий режим F5 (TASK-019): один хоткей/toggle скрывает или показывает СРАЗУ
 * все элементы оверлея — базовое placeholder-окно (TASK-008), компактную
 * панель (TASK-014), уведомления (TASK-015) и панель драфта (TASK-027).
 * hide()/show() не трогают click-through/позицию — при повторном show() окно
 * возвращается в прежнем состоянии. Вызывается и из onApplied (реакция на
 * смену настройки — хоткей ИЛИ будущий UI-переключатель), и один раз при
 * старте, чтобы применить сохранённое между сессиями состояние к только что
 * созданным окнам (onApplied реагирует только на МУТАЦИИ настроек, а не на
 * их первоначальную загрузку).
 *
 * Расширенная панель (TASK-037) обрабатывается ОТДЕЛЬНО от четырёх остальных:
 * у неё есть собственное открыто/закрыто-состояние (expandedPanelOpen,
 * переключается F9, см. onToggleExpandedPanel в startHotkeys), не связанное
 * с тихим режимом. Включение тихого режима скрывает панель, ДАЖЕ если она
 * была открыта (тихий режим — «скрыть всё»); выключение возвращает её ТОЛЬКО
 * если она была открыта до включения тихого режима — иначе un-silencing
 * заново открывал бы панель, которую пользователь сам закрыл F9 ещё до
 * входа в тихий режим.
 */
function applySilentMode(silentMode: boolean): void {
  const overlayWindows = [overlayWindow, compactPanelWindow, notificationsWindow, draftPanelWindow]
  for (const win of overlayWindows) {
    if (!win) {
      continue
    }
    if (silentMode) {
      win.hide()
    } else {
      win.show()
    }
  }
  if (expandedPanelWindow) {
    if (silentMode) {
      expandedPanelWindow.hide()
    } else if (expandedPanelOpen) {
      expandedPanelWindow.show()
    }
  }
}

/**
 * F6 (TASK-031): после привязки/смены Steam ID подтягивает пул героев через
 * DataService.getHeroPool (STRATZ → OpenDota → SQLite-кэш, INV5), которая сама
 * persists результат в hero_pool_stats (HeroPoolCacheStore) — здесь только
 * триггер и лог. Вызывается без await из onApplied — не должна блокировать
 * settings:set. steamId в AppSettings — 64-bit (см. parseSteamId64Input);
 * STRATZ/OpenDota ждут 32-bit account id, отсюда конвертация.
 */
function syncHeroPool(steamId64: string): void {
  if (!dataService) {
    return
  }
  const accountId = steamId64ToAccountId(steamId64)
  void dataService.getHeroPool(accountId).then((result) => {
    if (result.status === 'ok') {
      console.log(`[hero-pool] synced ${result.data.length} hero(es) for account ${accountId} (source=${result.source})`)
    } else {
      console.log(`[hero-pool] sync skipped for account ${accountId}: ${result.reason}`)
    }
  })
}

/**
 * Поднимает регистрацию глобальных хоткеев (TASK-018): F9 (расширенная
 * панель, TASK-037 — открывает/закрывает expandedPanelWindow, см.
 * startExpandedPanelWindow), тихий режим (флипает persisted silentMode через
 * settingsController.apply — onApplied дальше сам скрывает/показывает все
 * overlay-окна и подавляет новые уведомления, см.
 * applySilentMode/enqueueAdviceUnlessSilenced, TASK-019) и toggle
 * click-through (TASK-008, F8 по умолчанию) — переключает интерактивность
 * базового overlay-окна (startOverlayWindow). Механизм — платформенные
 * бэкенды createHotkeyBackends: на win32 uiohook (globalShortcut не
 * срабатывает поверх сфокусированной Dota — находка живого гейта TASK-008),
 * на darwin-dev globalShortcut. Требует уже поднятого overlayWindow.
 */
function startHotkeys(): void {
  if (!settingsController) {
    return
  }
  const backends = createHotkeyBackends((message) => console.log(`[hotkeys] ${message}`))
  hotkeyManager = new HotkeyManager({
    backend: backends.backend,
    fallbackBackend: backends.fallbackBackend,
    onToggleExpandedPanel: () => {
      if (!expandedPanelWindow) {
        console.log('[hotkeys] expanded panel toggle pressed — window not created yet')
        return
      }
      expandedPanelOpen = !expandedPanelOpen
      // В тихом режиме окно физически скрыто (applySilentMode) — F9 только
      // меняет логическое состояние open/closed, реальный show() придёт при
      // выходе из тихого режима, если expandedPanelOpen всё ещё true.
      if (settingsController?.get().silentMode) {
        console.log(`[hotkeys] expanded panel toggled -> open=${expandedPanelOpen} (suppressed, silent mode active)`)
        return
      }
      if (expandedPanelOpen) {
        expandedPanelWindow.show()
      } else {
        expandedPanelWindow.hide()
      }
      console.log(`[hotkeys] expanded panel toggled -> open=${expandedPanelOpen}`)
    },
    onToggleSilentMode: () => {
      const current = settingsController?.get()
      if (!current) {
        return
      }
      const next = settingsController?.apply({ silentMode: !current.silentMode })
      console.log(`[hotkeys] silent mode toggled -> ${next?.silentMode}`)
    },
    onToggleClickThrough: () => {
      const interactive = overlayWindow?.toggleInteractive()
      if (interactive !== undefined) {
        setOverlayPlaceholderState(interactive)
        // Компактная панель (TASK-014) переключается синхронно с базовым
        // overlayWindow: один хоткей — один переключатель "режим взаимодействия
        // с оверлеем" для всех текущих окон, а не по окну на окно.
        compactPanelWindow?.setInteractive(interactive)
      }
      console.log(`[hotkeys] overlay click-through toggled -> interactive=${interactive}`)
    },
    logger: (message) => console.log(`[hotkeys] ${message}`)
  })
  hotkeyManager.reconcile(settingsController.get())
}

/**
 * Поднимает локальный GSI-сервер приёма пакетов Dota (TASK-005). Ошибку биндинга
 * логируем, но приложение не роняем — оверлей должен работать и без потока GSI.
 */
async function startGsiServer(): Promise<void> {
  gsiServer = new GsiServer({
    authToken: GSI_AUTH_TOKEN,
    logger: (message) => console.log(`[gsi] ${message}`)
  })
  gsiServer.store.subscribe((state) => {
    console.log(
      `[gsi] update: state=${state.map?.gameState ?? 'unknown'} clock=${state.map?.clockTime ?? 0} hero=${state.hero?.name ?? 'none'}`
    )
    broadcast('gameState:update', state)
  })
  // F5 конструктор виджетов (TASK-016): санитизированный срез сырого пакета
  // (см. doc-комментарий GsiServer) — отдельный стор, но тот же flush(), что
  // и store.set(), поэтому оба push-канала идут в lockstep на одной частоте.
  gsiServer.rawStore.subscribe((snapshot) => {
    broadcast('gsiRaw:update', snapshot)
  })
  try {
    const port = await gsiServer.start()
    logGsiInstallerPreview(port)
  } catch (error) {
    console.error('[gsi] failed to start GSI server:', error)
  }
}

/**
 * Ищет установку Dota и логирует preview gamestate_integration-конфига
 * (TASK-006). Штатный механизм Valve — только preview на этом этапе: реальная
 * запись файла (install()) требует явного подтверждения пользователя в UI,
 * которого пока нет (появится вместе с IPC-мостом TASK-007 и окном настроек).
 * Аналогично befor — если Dota не найдена ни по одному известному пути, здесь
 * только лог понятного сообщения; ручной выбор папки — тоже часть будущего UI.
 */
function logGsiInstallerPreview(port: number): void {
  const installer = new GsiConfigInstaller()
  const location = findDotaCfgDir(listCandidateDotaInstallRoots())
  if (!location) {
    console.log(
      '[gsi-install] Dota installation not found automatically — manual folder selection required (UI: TASK-007+)'
    )
    return
  }
  const content = buildGsiConfigContent({ host: '127.0.0.1', port, token: GSI_AUTH_TOKEN })
  const preview = installer.preview(location.cfgDir, content)
  console.log(
    `[gsi-install] found Dota at ${location.installRoot}; would write ${preview.filePath} (already installed: ${preview.alreadyInstalled}) — awaiting user confirmation via UI`
  )
}

/**
 * Поднимает базовое overlay-окно (TASK-008): always-on-top/click-through
 * поверх игры, без контента-потребителя (тот появится в TASK-014/015/037,
 * как отдельные инстансы OverlayWindow). Пока рисует placeholder через
 * data:-URL — не тянуть renderer-роут ради теста механики окна. Placeholder
 * отражает текущее состояние интерактивности: setIgnoreMouseEvents сам по
 * себе визуально никак не проявляется, и без индикации F8-toggle невозможно
 * проверить глазами при живом гейте. Хоткей toggle click-through —
 * startHotkeys, он же перерисовывает placeholder после переключения.
 */
function overlayPlaceholderHtml(interactive: boolean): string {
  const state = interactive
    ? 'INTERACTIVE — окно ловит клики (F8: вернуть click-through)'
    : 'click-through — клики проходят сквозь окно (F8: сделать кликабельным)'
  const accent = interactive ? '#f0a832' : '#4caf7d'
  return (
    '<html><body style="margin:0;font:14px sans-serif;color:#e6e6e6;' +
    `background:rgba(10,12,16,0.85);padding:12px;border-radius:8px;border-left:4px solid ${accent};">` +
    `MidMind overlay: ${state}</body></html>`
  )
}

function setOverlayPlaceholderState(interactive: boolean): void {
  void overlayWindow?.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(overlayPlaceholderHtml(interactive))}`
  )
}

function startOverlayWindow(): void {
  overlayWindow = new OverlayWindow({ width: 320, height: 120, x: 24, y: 24 })
  setOverlayPlaceholderState(false)
  overlayWindow.show()
}

/**
 * Загружает реальный renderer-контент компактной панели (TASK-014) в
 * OverlayWindow-инстанс — тот же бандл, что и основное окно настроек
 * (createWindow), но с `?window=compact-panel`: main.tsx по этому параметру
 * выбирает CompactPanel вместо App. В отличие от startOverlayWindow (TASK-008,
 * placeholder через data:-URL — механика окна без реального UI), здесь нужен
 * настоящий React-роут.
 */
function loadCompactPanelContent(win: OverlayWindow): void {
  const query = { window: 'compact-panel' }
  if (process.env['ELECTRON_RENDERER_URL']) {
    const qs = new URLSearchParams(query).toString()
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${qs}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

/**
 * Поднимает компактную панель F5 режим 1 (TASK-014): свой инстанс
 * OverlayWindow (по топологии из комментария startOverlayWindow — каждый
 * режим оверлея получает отдельное окно). Дефолтная позиция — верхний левый
 * угол ниже топ-бара счёта (раздел 6 PRD, зоны свободные от HUD), если
 * пользователь ещё ни разу не передвигал панель
 * (AppSettings.overlayPositions[COMPACT_PANEL_WINDOW_ID] отсутствует).
 * Высота считается из числа виджетов (compactPanelHeight, compactPanelWidgetCount)
 * — «панель адаптируется к набору виджетов»: 3 фиксированных дефолтных
 * (DEFAULT_COMPACT_PANEL_WIDGET_IDS) + все включённые в конструкторе
 * (AppSettings.widgetsConfig, TASK-017); resizeCompactPanelWindow пересчитывает
 * и живьём ресайзит окно на каждую мутацию настроек (onApplied в startSettings),
 * а не только при создании — иначе включение виджета в конструкторе обрезало
 * бы контент высотой окна до перезапуска.
 *
 * Перетаскивание доступно в интерактивном режиме (F8, см. onToggleClickThrough
 * в startHotkeys — переключает эту панель вместе с базовым overlayWindow);
 * сам drag — нативный, через `-webkit-app-region: drag` в CompactPanel.tsx.
 * Итоговую позицию персистим на событие 'moved', дебаунсированное на 200мс
 * тишины после последнего сдвига — иначе живое перетаскивание писало бы в
 * БД на каждый промежуточный пиксель.
 *
 * Требует уже поднятого settingsController (startSettings).
 */
/**
 * Число виджетов панели (TASK-017): фиксированные 3 дефолтных + все ВКЛЮЧЁННЫЕ
 * записи widgets_config (конструктор). Не сверяется с текущим каталогом
 * (gsi-field-catalog) — устаревший id просто рендерится пустым местом в
 * CompactPanel.tsx (renderWidget возвращает null), это не ломает подсчёт,
 * только может завысить высоту на редком переходном кадре после удаления
 * поля из каталога.
 */
function compactPanelWidgetCount(settings: AppSettings): number {
  return DEFAULT_COMPACT_PANEL_WIDGET_IDS.length + settings.widgetsConfig.filter((entry) => entry.enabled).length
}

/** Живой ресайз компактной панели (TASK-017) на изменение widgets_config — без пересоздания окна/потери позиции. */
function resizeCompactPanelWindow(settings: AppSettings): void {
  compactPanelWindow?.setSize(COMPACT_PANEL_WIDTH, compactPanelHeight(compactPanelWidgetCount(settings)))
}

function startCompactPanelWindow(): void {
  if (!settingsController) {
    return
  }
  const initialSettings = settingsController.get()
  const savedPosition = initialSettings.overlayPositions[COMPACT_PANEL_WINDOW_ID]
  const position = savedPosition ?? COMPACT_PANEL_DEFAULT_POSITION
  const height = compactPanelHeight(compactPanelWidgetCount(initialSettings))

  const win = new OverlayWindow({ width: COMPACT_PANEL_WIDTH, height, x: position.x, y: position.y })
  compactPanelWindow = win
  loadCompactPanelContent(win)
  win.show()

  let moveDebounce: ReturnType<typeof setTimeout> | null = null
  win.onMoved(() => {
    if (moveDebounce) {
      clearTimeout(moveDebounce)
    }
    moveDebounce = setTimeout(() => {
      const [x, y] = win.getPosition()
      const current = settingsController?.get().overlayPositions ?? {}
      settingsController?.apply({
        overlayPositions: { ...current, [COMPACT_PANEL_WINDOW_ID]: { x, y } }
      })
    }, 200)
  })
}

/**
 * Загружает реальный renderer-контент окна уведомлений (TASK-015) — тот же
 * бандл, что и остальные окна, с `?window=notifications` (main.tsx выбирает
 * NotificationsPanel). См. комментарий loadCompactPanelContent — тот же приём.
 */
function loadNotificationsContent(win: OverlayWindow): void {
  const query = { window: 'notifications' }
  if (process.env['ELECTRON_RENDERER_URL']) {
    const qs = new URLSearchParams(query).toString()
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${qs}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

/**
 * Поднимает окно всплывающих уведомлений F5 режим 2 (TASK-015): свой инстанс
 * OverlayWindow в фиксированной зоне над панелью героя со смещением вверх
 * (раздел 6 PRD, координаты — src/shared/overlay/notifications.ts,
 * откалиброваны под референсное разрешение 1920x1080). В отличие от
 * компактной панели (TASK-014) НЕ перетаскивается и НЕ участвует в
 * onToggleClickThrough (F8) — остаётся click-through всегда, поэтому позиция
 * не персистится (нечему меняться между сессиями).
 *
 * Контент — очередь Advice из AdviceScheduler (TASK-013): main просто
 * рассылает advice:push всем окнам (broadcast), это окно — один из
 * подписчиков наравне с главным окном настроек, без отдельного wiring.
 */
function startNotificationsWindow(): void {
  const win = new OverlayWindow({
    width: NOTIFICATIONS_WIDTH,
    height: NOTIFICATIONS_HEIGHT,
    x: NOTIFICATIONS_POSITION.x,
    y: NOTIFICATIONS_POSITION.y
  })
  notificationsWindow = win
  loadNotificationsContent(win)
  win.show()
}

/**
 * Загружает реальный renderer-контент панели драфта (TASK-027) — тот же
 * бандл, что и остальные окна, с `?window=draft-panel` (main.tsx выбирает
 * DraftPanel). См. комментарий loadCompactPanelContent — тот же приём.
 */
function loadDraftPanelContent(win: OverlayWindow): void {
  const query = { window: 'draft-panel' }
  if (process.env['ELECTRON_RENDERER_URL']) {
    const qs = new URLSearchParams(query).toString()
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${qs}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

/**
 * Поднимает панель драфта F1 (TASK-027): свой инстанс OverlayWindow с
 * позицией из src/shared/overlay/draftPanel.ts (правый верхний угол — не
 * пересекается с компактной панелью TASK-014/уведомлениями TASK-015).
 * В отличие от обоих — интерактивна ВСЕГДА, а не только в режиме F8 (нужны
 * клики по кнопкам ручного ввода пиков), и НЕ участвует в
 * onToggleClickThrough (F8 трогает только click-through-по-умолчанию окна).
 * Контент подписывается на draftContext:get/draftContext:update сам
 * (DraftPanel.tsx) — здесь только механика окна. Требует уже поднятого
 * draftContextManager (startDraftContext), но не блокируется его отсутствием —
 * окно показывает EMPTY_DRAFT_CONTEXT, пока main не пришлёт первое обновление.
 */
function startDraftPanelWindow(): void {
  const win = new OverlayWindow({
    width: DRAFT_PANEL_WIDTH,
    height: DRAFT_PANEL_HEIGHT,
    x: DRAFT_PANEL_POSITION.x,
    y: DRAFT_PANEL_POSITION.y
  })
  draftPanelWindow = win
  win.setInteractive(true)
  loadDraftPanelContent(win)
  win.show()
}

/**
 * Загружает реальный renderer-контент расширенной панели (TASK-037) — тот же
 * бандл, что и остальные окна, с `?window=expanded-panel` (main.tsx выбирает
 * ExpandedPanel). См. комментарий loadCompactPanelContent — тот же приём.
 */
function loadExpandedPanelContent(win: OverlayWindow): void {
  const query = { window: 'expanded-panel' }
  if (process.env['ELECTRON_RENDERER_URL']) {
    const qs = new URLSearchParams(query).toString()
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${qs}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

/**
 * Поднимает расширенную панель F5 режим 3 (TASK-037): свой инстанс
 * OverlayWindow, интерактивен ВСЕГДА (та же логика, что панель драфта,
 * TASK-027 — план на лайн не требует кликов сейчас, но зарезервировано под
 * будущие действия панели), позиция — src/shared/overlay/expandedPanel.ts
 * (центр экрана, ждёт калибровки под реальный HUD, см. CLAUDE.md §1).
 *
 * В отличие от остальных overlay-окон создаётся СКРЫТЫМ (win.show() не
 * вызывается здесь) — открывается/закрывается по F9 (onToggleExpandedPanel,
 * startHotkeys), а не показывается сразу при старте приложения. Регистрирует
 * invoke-обработчик lanePlan:get поверх замыкания над lastLanePlan — план
 * приходит push'ем (lanePlan:update, startLanePlanBuilder), invoke нужен
 * только окну, открытому уже после финализации пиков.
 */
function startExpandedPanelWindow(): void {
  const win = new OverlayWindow({
    width: EXPANDED_PANEL_WIDTH,
    height: EXPANDED_PANEL_HEIGHT,
    x: EXPANDED_PANEL_POSITION.x,
    y: EXPANDED_PANEL_POSITION.y
  })
  expandedPanelWindow = win
  win.setInteractive(true)
  loadExpandedPanelContent(win)
  registerLanePlanHandlers(() => lastLanePlan)
}

/**
 * Создаёт основное окно приложения (настройки/статус). Прозрачное безрамочное
 * окно с React-рендерером; preload поднят с contextIsolation/nodeIntegration/
 * sandbox по CLAUDE.md §6 (TASK-007). Базовое overlay-окно поверх игры
 * (always-on-top, click-through) — отдельный инстанс, см. startOverlayWindow
 * (TASK-008).
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  startOverlayWindow()
  startDatabase()
  startSettings()
  startCompactPanelWindow()
  startNotificationsWindow()
  startDraftPanelWindow()
  startExpandedPanelWindow()
  // applySilentMode(onApplied) реагирует только на будущие мутации настроек —
  // применяем сохранённое между сессиями состояние к только что созданным
  // окнам явно, один раз при старте (TASK-019).
  applySilentMode(settingsController?.get().silentMode ?? false)
  startHotkeys()
  startConfigLoader()
  void startGsiServer()
  startSteamIdDetection()
  startDraftContext()
  startMatchHistory()
  startAdviceScheduler()
  startRulesConfig()
  startHeroProfilesConfig()
  startMatchupKnowledgeConfig()
  startAdviceGate()
  startTimingScheduler()
  startTimingsBroadcast()
  startStratzClient()
  startDataService()
  startPatchWatcher()
  startMetaMidHeroesConfig()
  startGsiFieldCatalogConfig()
  startBenchmarksConfig()
  startCacheWarmer()
  startDraftService()
  startLanePlanBuilder()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  timingScheduler?.stop()
  unsubscribeAdviceGateFacts?.()
  adviceScheduler?.stop()
  hotkeyManager?.stop()
  void gsiServer?.stop()
  configLoader?.stop()
  database?.close()
})
