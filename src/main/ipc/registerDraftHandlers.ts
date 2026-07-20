/**
 * invoke-канал draftContext:applyManualAction (F1, TASK-027) поверх
 * DraftContextManager: тонкий wrapper, вся логика/валидация action уже в
 * applyManualAction (engine/draft, Zod-схема DraftManualActionSchema
 * гарантирует форму запроса на уровне типов IpcContract).
 *
 * INV1: живёт в main.
 */
import { ipcMain } from 'electron'
import type { DraftContext, DraftManualAction } from '@shared/schemas/draft'
import type { DraftContextManager } from '../draft'

/** Регистрирует ipcMain.handle для draftContext:get/draftContext:applyManualAction. Идемпотентно. */
export function registerDraftHandlers(manager: DraftContextManager): void {
  ipcMain.handle('draftContext:get', (): DraftContext => {
    return manager.get()
  })

  ipcMain.handle(
    'draftContext:applyManualAction',
    (_event, action: DraftManualAction): DraftContext => {
      return manager.applyManualAction(action)
    }
  )
}
