/**
 * invoke-канал gsiFieldCatalog:get (F5, TASK-016): отдаёт актуальный
 * gsi-field-catalog.json (TASK-009) конструктору виджетов. Тонкий wrapper над
 * ConfigHandle — last-good значение уже поддерживает ConfigLoader (TASK-011),
 * здесь только прокидка в IPC. Если конфиг ещё ни разу не загрузился валидно
 * (не должно происходить в норме — content/gsi-field-catalog.json — часть
 * репозитория), отдаёт пустой список полей вместо падения invoke.
 *
 * INV1: живёт в main.
 */
import { ipcMain } from 'electron'
import type { GsiFieldCatalogConfig } from '@shared/schemas/gsiFieldCatalog'
import type { ConfigHandle } from '../config'

const EMPTY_CATALOG: GsiFieldCatalogConfig = { fields: [] }

/** Регистрирует ipcMain.handle для gsiFieldCatalog:get. Идемпотентно. */
export function registerGsiFieldCatalogHandlers(handle: ConfigHandle<GsiFieldCatalogConfig>): void {
  ipcMain.handle('gsiFieldCatalog:get', (): GsiFieldCatalogConfig => {
    return handle.get() ?? EMPTY_CATALOG
  })
}
