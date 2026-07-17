import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/index'
import { GsiServer } from './gsi'
import { ConfigLoader, mirrorContentDir } from './config'
import { TimingScheduler } from './timings'
import { TimingsConfigSchema } from '@shared/schemas/timings'
import { createStratzClient, type StratzClient } from './data'
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
let stratzClient: StratzClient | null = null
let database: DatabaseInstance | null = null
let userProfileRepository: UserProfileRepository | null = null

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
      // TASK-007 заменит это на push config:reloaded в renderer.
      console.log(`[config] reloaded '${payload.name}': ${payload.status}`)
    }
  })
}

/**
 * Поднимает планировщик тайминговых напоминалок F3 (TASK-012): регистрирует
 * timings.json через ConfigLoader (hot-reload) и подписывает чистый движок
 * engine/timings на поток GSI из GameStateStore. Требует уже поднятых
 * configLoader (startConfigLoader) и gsiServer (startGsiServer).
 *
 * Пока onAlert только логирует — TASK-013 подключит очередь AdviceScheduler, а
 * TASK-007 — push advice:push в renderer. Отключение типов (getDisabledEventIds)
 * подключит проекция настроек из TASK-018.
 */
function startTimingScheduler(): void {
  if (!configLoader || !gsiServer) {
    return
  }
  const timings = configLoader.register('timings', TimingsConfigSchema)
  timingScheduler = new TimingScheduler({
    store: gsiServer.store,
    getEvents: () => timings.get(),
    onAlert: (advice) => {
      console.log(`[timings] ${advice.ruleId}: ${advice.message}`)
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
 * Поднимает локальный GSI-сервер приёма пакетов Dota (TASK-005). Ошибку биндинга
 * логируем, но приложение не роняем — оверлей должен работать и без потока GSI.
 */
async function startGsiServer(): Promise<void> {
  gsiServer = new GsiServer({
    authToken: GSI_AUTH_TOKEN,
    logger: (message) => console.log(`[gsi] ${message}`)
  })
  gsiServer.store.subscribe((state) => {
    // TASK-007 заменит это на push gameState:update в renderer.
    console.log(
      `[gsi] update: state=${state.map?.gameState ?? 'unknown'} clock=${state.map?.clockTime ?? 0} hero=${state.hero?.name ?? 'none'}`
    )
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
 * Создаёт основное окно оверлея. На этом этапе (TASK-001) — просто прозрачное
 * безрамочное окно с React-рендерером. Полноценный overlay-режим (click-through,
 * always-on-top, sandbox) настраивается в TASK-007/TASK-008.
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
      nodeIntegration: false
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
  startConfigLoader()
  void startGsiServer()
  startTimingScheduler()
  startStratzClient()

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
  void gsiServer?.stop()
  configLoader?.stop()
  database?.close()
})
