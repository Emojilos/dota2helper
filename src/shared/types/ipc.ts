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
import type { WidgetGsiSnapshot } from '../schemas/gsiRawSnapshot'
import type { GsiFieldCatalogConfig } from '../schemas/gsiFieldCatalog'
import type { DataSource } from './dataResult'

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

/**
 * Одно ближайшее наступление тайминг-события (F5 конструктор виджетов,
 * TASK-016): та же engine/timings.upcomingTimingEvents(), что уже считает
 * compactPanel:timers, но БЕЗ схлопывания в nextEvent/nextRune — полный список,
 * чтобы именованные пресеты реестра виджетов (rune-timer/stack-counter) могли
 * найти своё событие по eventId (напр. 'camp_stack'), не будучи жёстко
 * привязанными к двум полям компактной панели.
 */
export interface TimingUpcomingEventPayload {
  eventId: string
  labelRu: string
  secondsUntil: number
}

/**
 * F1 ранжирование кандидатов на пик (TASK-028): Meta и Personal считаются
 * ЗА ОДИН вызов DraftService.computeRankings над одним и тем же набором
 * матчап-данных — оба массива приходят вместе, чтобы будущий переключатель
 * Meta/Personal (TASK-029) работал мгновенно, без повторного запроса.
 *
 * dataSource/dataStale (TASK-029) — агрегированная метка давности/источника
 * матчап-данных, использованных для ЭТОГО набора ранжирований (INV5, лестница
 * деградации STRATZ → OpenDota → SQLite stale-кэш): 'mixed', если кандидаты
 * получили данные из разных источников, 'none' — если ни один не получил
 * данных вовсе. Панель драфта показывает её как единую пометку давности.
 */
export interface DraftRankingsPayload {
  meta: DraftCandidate[]
  personal: DraftCandidate[]
  dataSource: DataSource | 'mixed' | 'none'
  dataStale: boolean
}

/** main -> renderer: имя канала -> тип payload. */
export interface IpcPushChannels {
  'gameState:update': GameState
  'advice:push': Advice
  'config:reloaded': ConfigReloadedPayload
  /** Рассылается на каждое изменение DraftContext, пока stage='picking' (TASK-028) — не чаще ручных действий пользователя. */
  'draft:update': DraftRankingsPayload
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
  /**
   * F5 конструктор виджетов (TASK-016): санитизированный срез сырого GSI-пакета
   * (map/player/hero/abilities/items, БЕЗ auth/provider — см. pickWidgetSnapshot,
   * src/shared/gsi/) для WidgetRegistry. Нужен в дополнение к gameState:update,
   * потому что каталог (gsi-field-catalog.json) шире типизированного GameState
   * (aghanims_scepter, talent_N, debuff-флаги и т.п.) — расширение каталога НЕ
   * должно требовать правки GameState/parseGameState (INV4). Пушится в lockstep
   * с gameState:update (тот же flush в GsiServer, TASK-005), с той же частотой ≤2 Гц.
   */
  'gsiRaw:update': WidgetGsiSnapshot
  /**
   * F5 конструктор виджетов (TASK-016): полный отсортированный список ближайших
   * наступлений ВСЕХ тайминг-событий (см. TimingUpcomingEventPayload) — та же
   * engine/timings.upcomingTimingEvents(), что уже питает compactPanel:timers,
   * без схлопывания в 2 поля. Используется именованными пресетами реестра
   * виджетов (rune-timer/stack-counter), которым нужен произвольный eventId, а
   * не только 'ближайшее' и 'ближайшая руна'.
   */
  'timings:upcoming': TimingUpcomingEventPayload[]
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
  /**
   * F5 конструктор виджетов (TASK-016): полный каталог gsi-field-catalog.json
   * (fieldPath/labelRu/category/format/preset, TASK-009) — WidgetRegistry строит
   * по нему список доступных сырых полей. Invoke, а не push: каталог меняется
   * редко (правка контента, не поток GSI); при hot-reload (TASK-011) renderer
   * узнаёт об этом из УЖЕ существующего 'config:reloaded' (name='gsi-field-catalog')
   * и перезапрашивает актуальную версию этим же каналом — отдельного push-канала
   * специально под каталог не заводим, чтобы не дублировать confirm-механику TASK-048.
   */
  'gsiFieldCatalog:get': { request: void; response: GsiFieldCatalogConfig }
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
  draftContextApplyManualAction: 'draftContext:applyManualAction',
  gsiRawUpdate: 'gsiRaw:update',
  timingsUpcoming: 'timings:upcoming',
  gsiFieldCatalogGet: 'gsiFieldCatalog:get'
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
