/**
 * invoke-каналы settings:get/settings:set (TASK-007, расширено TASK-018)
 * поверх SettingsController. settings:set — тонкий wrapper над
 * controller.apply(); авторитетную проекцию (включая рассылку settings:update
 * во все окна) делает сам controller — см. SettingsController.ts.
 *
 * INV1: живёт в main.
 */
import { ipcMain } from 'electron'
import type { AppSettings } from '@shared/schemas/settings'
import type { SettingsController } from './SettingsController'

/** Регистрирует ipcMain.handle для settings:get/settings:set. Идемпотентно. */
export function registerSettingsHandlers(controller: SettingsController): void {
  ipcMain.handle('settings:get', (): AppSettings => {
    return controller.get()
  })

  ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>): AppSettings => {
    return controller.apply(patch)
  })
}
