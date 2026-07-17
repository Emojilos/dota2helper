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

/** Статус горячей перезагрузки конфига (TASK-011). */
export interface ConfigReloadedPayload {
  name: string
  status: 'ok' | 'invalid'
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
}

/** renderer -> main: имя канала -> { request, response }. */
export interface IpcInvokeChannels {
  'settings:get': { request: void; response: AppSettings }
  'settings:set': { request: Partial<AppSettings>; response: AppSettings }
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
  settingsSet: 'settings:set'
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
