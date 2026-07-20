/**
 * IpcContract — типизированный контракт границы main <-> renderer (INV1).
 * Renderer видит только window.midmind по этому контракту и никогда не
 * импортирует main/engine напрямую.
 *
 * Разделяем два вида каналов:
 *  - push (main -> renderer) через webContents.send / ipcRenderer.on
 *  - invoke (renderer -> main) через ipcRenderer.invoke (request/response)
 *
 * INV2: модуль чист (только type-only импорты схем).
 */
import type { GameState } from '../schemas/gameState'
import type { Advice, DraftCandidate } from '../schemas/advice'
import type { AppSettings } from '../schemas/settings'
import type { DraftContext, DraftManualAction } from '../schemas/draft'

/** Статус горячей перезагрузки конфига (TASK-011). */
export interface ConfigReloadedPayload {
  name: string
  status: 'ok' | 'invalid'
  /**
   * Понятная причина невалидности (JSON.parse line/column или Zod field: message,
   * см. ConfigLoader.describeJsonError/describeZodError, TASK-048). Присутствует
   * ТОЛЬКО при status='invalid'; renderer показывает её в баннере "используется
   * last-good".
   */
  reason?: string
}

/** Прогресс фонового прогрева кэша матчапов (CacheWarmer, TASK-025). */
export interface CacheWarmerProgressPayload {
  completed: number
  total: number
  heroId: number
  status: 'ok' | 'no-data' | 'error'
}

/** Один таймер для компактной панели F5 (TASK-014): подпись + секунды до наступления. */
export interface CompactPanelTimerPayload {
  labelRu: string
  secondsUntil: number
}

/**
 * Таймеры дефолтных виджетов компактной панели (TASK-014): ближайшее
 * событие вообще и отдельно ближайшая руна. Считается в main из
 * timings.json чистой функцией engine/timings.selectCompactPanelTimers —
 * renderer её не импортирует (INV1), только рисует готовые числа.
 */
export interface CompactPanelTimersPayload {
  nextEvent: CompactPanelTimerPayload | null
  nextRune: CompactPanelTimerPayload | null
}

/** main -> renderer: имя канала -> тип payload. */
export interface IpcPushChannels {
  'gameState:update': GameState
  'advice:push': Advice
  'config:reloaded': ConfigReloadedPayload
  'draft:update': DraftCandidate[]
  /**
   * Авторитетная проекция настроек (TASK-018). main — единственный источник
   * правды: рассылается во все окна после любой мутации (invoke settings:set
   * ИЛИ хоткей в main, напр. тихий режим), включая инициатора. Renderer-стор
   * не различает источник изменения, просто принимает актуальный AppSettings.
   */
  'settings:update': AppSettings
  /** Прогресс CacheWarmer (TASK-025): один пуш на каждого обработанного героя. */
  'cacheWarmer:progress': CacheWarmerProgressPayload
  /**
   * F6 автоопределение Steam ID (TASK-030): main пушит один раз за сессию,
   * когда в GSI приходит player.steamid, а профиль ещё не привязан
   * (AppSettings.steamId === null). Ничего не персистится автоматически —
   * renderer должен показать явное подтверждение и вызвать settings:set
   * самостоятельно, если пользователь согласится.
   */
  'steamId:detected': { steamId: string }
  /**
   * F6/M6 смена патча (TASK-047): main пушит один раз за сессию, когда
   * PatchWatcher при старте обнаруживает, что текущий патч STRATZ отличается
   * от последнего сохранённого (app_state.lastSeenPatch) — НЕ на каждом
   * запуске, только на реальной смене. Renderer должен показать баннер
   * "данные обновляются" (кэш матчапов/билдов может ещё содержать
   * прошлопатчевые числа, пока CacheWarmer/DataService не перегреют его).
   */
  'patch:changed': { patch: string }
  /** Таймеры компактной панели (TASK-014) — пушится на каждый тик GSI (≤2 Гц, как gameState:update). */
  'compactPanel:timers': CompactPanelTimersPayload
  /**
   * F1 детект драфта (TASK-027): актуальный DraftContext — рассылается ТОЛЬКО
   * при реальном изменении (стадия/собственный герой из GSI ИЛИ ручной ввод
   * пиков через draftContext:applyManualAction), не на каждый GSI-тик, см.
   * DraftContextManager (src/main/draft). Панель драфта должна появиться
   * ≤2 сек после входа в HERO_SELECTION (раздел F1 PRD) — это push, а не
   * poll, задержка целиком определяется частотой GSI (~2 Гц).
   */
  'draftContext:update': DraftContext
}

/** renderer -> main: имя канала -> { request, response }. */
export interface IpcInvokeChannels {
  'settings:get': { request: void; response: AppSettings }
  'settings:set': { request: Partial<AppSettings>; response: AppSettings }
  /** F1 (TASK-027): текущий DraftContext — тот же приём, что settings:get, для окна, открытого/перезагруженного уже после начала драфта. */
  'draftContext:get': { request: void; response: DraftContext }
  /**
   * F1 ручной ввод пиков (TASK-027): GSI не отдаёт пики команд игроку
   * (docs/gsi-fields.md, TASK-009) — единственный источник enemyHeroIds/
   * allyHeroIds/enemyMidHeroId. Отвечает актуальным DraftContext (тем же, что
   * придёт следующим draftContext:update — избавляет renderer от гонки
   * между ответом invoke и push).
   */
  'draftContext:applyManualAction': { request: DraftManualAction; response: DraftContext }
}

export type IpcPushChannel = keyof IpcPushChannels
export type IpcInvokeChannel = keyof IpcInvokeChannels

export type IpcPushPayload<C extends IpcPushChannel> = IpcPushChannels[C]
export type IpcInvokeRequest<C extends IpcInvokeChannel> = IpcInvokeChannels[C]['request']
export type IpcInvokeResponse<C extends IpcInvokeChannel> = IpcInvokeChannels[C]['response']

/** Единый список строковых имён каналов (без магических строк у потребителей). */
export const IPC_CHANNELS = {
  gameStateUpdate: 'gameState:update',
  advicePush: 'advice:push',
  configReloaded: 'config:reloaded',
  draftUpdate: 'draft:update',
  settingsUpdate: 'settings:update',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  cacheWarmerProgress: 'cacheWarmer:progress',
  steamIdDetected: 'steamId:detected',
  patchChanged: 'patch:changed',
  compactPanelTimers: 'compactPanel:timers',
  draftContextUpdate: 'draftContext:update',
  draftContextGet: 'draftContext:get',
  draftContextApplyManualAction: 'draftContext:applyManualAction'
} as const

/**
 * Форма типизированного моста window.midmind, публикуемого preload (TASK-007).
 * Здесь — только тип; реализация появится в preload.
 */
export interface MidMindBridge {
  on<C extends IpcPushChannel>(
    channel: C,
    listener: (payload: IpcPushPayload<C>) => void
  ): () => void
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    request: IpcInvokeRequest<C>
  ): Promise<IpcInvokeResponse<C>>
}
