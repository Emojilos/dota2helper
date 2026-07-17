/**
 * Рассылка push-каналов IpcContract (TASK-007) во все окна renderer'а.
 *
 * INV1: живёт в main. Единственное место, знающее про webContents.send —
 * потребители (GsiServer.store, ConfigLoader, TimingScheduler) вызывают
 * broadcast(channel, payload) и не трогают BrowserWindow напрямую.
 */
import { BrowserWindow } from 'electron'
import type { IpcPushChannel, IpcPushPayload } from '@shared/types/ipc'

/** Отправляет payload конкретного push-канала во все открытые окна. */
export function broadcast<C extends IpcPushChannel>(channel: C, payload: IpcPushPayload<C>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}
