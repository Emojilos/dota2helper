import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/index'
import { GsiServer } from './gsi'
import { ConfigLoader, mirrorContentDir, type ConfigHandle } from './config'
import { TimingScheduler } from './timings'
import { TimingsConfigSchema, type TimingsConfig } from '@shared/schemas/timings'
import { broadcast, registerSettingsHandlers, createSettingsController, type SettingsController } from './ipc'
import { AdviceScheduler, AdviceGate } from './advice'
import { HotkeyManager } from './hotkeys'
import {
  createStratzClient,
  createOpenDotaClient,
  DataService,
  MatchupCacheStore,
  CacheWarmer,
  type StratzClient
} from './data'
import { MetaMidHeroesConfigSchema } from '@shared/schemas/metaMidHeroes'
import { RulesConfigSchema, type RulesConfig } from '@shared/schemas/rules'
import { HeroProfilesConfigSchema, type HeroProfilesConfig } from '@shared/schemas/heroProfiles'
import { MatchupKnowledgeConfigSchema, type MatchupKnowledgeConfig } from '@shared/schemas/matchupKnowledge'
import { buildFacts } from '@engine/facts'
import { openDatabase, runMigrations, UserProfileRepository, type DatabaseInstance } from './db'
import {
  buildGsiConfigContent,
  findDotaCfgDir,
  listCandidateDotaInstallRoots,
  GsiConfigInstaller
} from './gsiInstall'

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
let unsubscribeAdviceGateFacts: (() => void) | null = null
let stratzClient: StratzClient | null = null
let database: DatabaseInstance | null = null
let userProfileRepository: UserProfileRepository | null = null
let dataService: DataService | null = null
let settingsController: SettingsController | null = null
let hotkeyManager: HotkeyManager | null = null
let cacheWarmer: CacheWarmer | null = null

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
 * файт — раздел F3 PRD) — этот вызов безопасен и до старта adviceGate (см.
 * startAdviceGate ниже), т.к. до его создания suppression не применяется.
 * Отключение типов (getDisabledEventIds) подключит проекция настроек из TASK-018.
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
      adviceScheduler?.enqueue(advice)
    }
  })
  timingScheduler.start()
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
      adviceScheduler?.enqueue(advice)
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
  dataService = new DataService(new MatchupCacheStore(database), stratzClient, openDotaClient)
  if (dataService) {
    console.log('[data] DataService ready (STRATZ→OpenDota→cache degradation ladder wired)')
  }
}

/**
 * Запускает фоновый прогрев кэша матчапов (CacheWarmer, TASK-025): греет
 * MatchupCacheStore по списку топ-мид-героев меты (content/meta-mid-heroes.json,
 * TASK-011 hot-reload) через уже собранный DataService (STRATZ→OpenDota→cache,
 * TASK-026), чтобы первый скрининг драфта не ждал сети. Требует configLoader и
 * dataService. Вызывается БЕЗ await — прогрев не блокирует запуск/показ окна;
 * ошибки отдельных героев не прерывают его (см. CacheWarmer.run()).
 */
function startCacheWarmer(): void {
  if (!configLoader || !dataService) {
    return
  }
  const meta = configLoader.register('meta-mid-heroes', MetaMidHeroesConfigSchema)
  const config = meta.get()
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
 */
function startSettings(): void {
  if (!userProfileRepository) {
    return
  }
  settingsController = createSettingsController(userProfileRepository, (settings) => {
    broadcast('settings:update', settings)
    hotkeyManager?.reconcile(settings)
  })
  registerSettingsHandlers(settingsController)
}

/**
 * Поднимает globalShortcut-регистрацию (TASK-018): F9 (расширенная панель —
 * окна ещё нет, TASK-014/037, handler пока просто логирует срабатывание как
 * шов для будущего подписчика) и тихий режим (реально флипает persisted
 * silentMode через settingsController.apply). Toggle click-through не входит
 * в этот менеджер — заведёт TASK-008 (нет персист-поля и окна-потребителя).
 */
function startHotkeys(): void {
  if (!settingsController) {
    return
  }
  hotkeyManager = new HotkeyManager({
    onToggleExpandedPanel: () => {
      console.log('[hotkeys] expanded panel toggle pressed — window not wired yet (TASK-014/037)')
    },
    onToggleSilentMode: () => {
      const current = settingsController?.get()
      if (!current) {
        return
      }
      const next = settingsController?.apply({ silentMode: !current.silentMode })
      console.log(`[hotkeys] silent mode toggled -> ${next?.silentMode}`)
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
 * Создаёт основное окно оверлея. Прозрачное безрамочное окно с React-рендерером;
 * preload поднят с contextIsolation/nodeIntegration/sandbox по CLAUDE.md §6
 * (TASK-007). Полноценный overlay-режим (always-on-top, click-through) —
 * TASK-008.
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
  startDatabase()
  startSettings()
  startHotkeys()
  startConfigLoader()
  void startGsiServer()
  startAdviceScheduler()
  startTimingScheduler()
  startRulesConfig()
  startHeroProfilesConfig()
  startMatchupKnowledgeConfig()
  startAdviceGate()
  startStratzClient()
  startDataService()
  startCacheWarmer()

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
