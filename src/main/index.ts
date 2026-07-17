import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/index'
import { GsiServer } from './gsi'
import { ConfigLoader, mirrorContentDir } from './config'
import { TimingScheduler } from './timings'
import { TimingsConfigSchema } from '@shared/schemas/timings'
import { broadcast, registerSettingsHandlers, createSettingsController, type SettingsController } from './ipc'
import { AdviceScheduler } from './advice'
import { HotkeyManager } from './hotkeys'
import {
  createStratzClient,
  createOpenDotaClient,
  DataService,
  MatchupCacheStore,
  type StratzClient
} from './data'
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
let stratzClient: StratzClient | null = null
let database: DatabaseInstance | null = null
let userProfileRepository: UserProfileRepository | null = null
let dataService: DataService | null = null
let settingsController: SettingsController | null = null
let hotkeyManager: HotkeyManager | null = null

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
 * которая сама решает, когда именно оно уйдёт в renderer. Отключение типов
 * (getDisabledEventIds) подключит проекция настроек из TASK-018.
 */
function startTimingScheduler(): void {
  if (!configLoader || !gsiServer || !adviceScheduler) {
    return
  }
  const timings = configLoader.register('timings', TimingsConfigSchema)
  timingScheduler = new TimingScheduler({
    store: gsiServer.store,
    getEvents: () => timings.get(),
    onAlert: (advice) => {
      console.log(`[timings] ${advice.ruleId}: ${advice.message}`)
      adviceScheduler?.enqueue(advice)
    }
  })
  timingScheduler.start()
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
  startStratzClient()
  startDataService()

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
  adviceScheduler?.stop()
  hotkeyManager?.stop()
  void gsiServer?.stop()
  configLoader?.stop()
  database?.close()
})
