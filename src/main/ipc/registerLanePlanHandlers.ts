/**
 * invoke-канал lanePlan:get (F5, TASK-037): отдаёт последний собранный
 * LanePlan для окна, открытого (F9) уже ПОСЛЕ финализации пиков — тот же
 * приём, что draftContext:get рядом с draftContext:update (TASK-027):
 * push-канал покрывает "уже открытое окно", invoke — "открылось только что".
 *
 * INV1: живёт в main.
 */
import { ipcMain } from 'electron'
import type { LanePlan } from '@shared/schemas/lanePlan'

/** Регистрирует ipcMain.handle для lanePlan:get. Идемпотентно. */
export function registerLanePlanHandlers(getLanePlan: () => LanePlan | null): void {
  ipcMain.handle('lanePlan:get', (): LanePlan | null => {
    return getLanePlan()
  })
}
