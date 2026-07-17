/**
 * invoke-каналы settings:get/settings:set (TASK-007) поверх UserProfileRepository
 * (TASK-010). AppSettings — проекция персистентного UserProfile (см.
 * shared/schemas/userProfile.ts): здесь отбираем только её поля, остальные
 * (overlayPositions/notificationsConfig/widgetsConfig/timestamps) — забота
 * будущих задач (TASK-014/016/018).
 *
 * INV1: живёт в main.
 */
import { ipcMain } from 'electron'
import { AppSettingsSchema, type AppSettings } from '@shared/schemas/settings'
import type { UserProfile } from '@shared/schemas/userProfile'
import type { UserProfileRepository } from '../db/UserProfileRepository'

function toAppSettings(profile: UserProfile): AppSettings {
  return AppSettingsSchema.parse({
    steamId: profile.steamId,
    verbosity: profile.verbosity,
    hotkeyExpandedPanel: profile.hotkeyExpandedPanel,
    draftRankingMode: profile.draftRankingMode,
    silentMode: profile.silentMode
  })
}

/** Регистрирует ipcMain.handle для settings:get/settings:set. Идемпотентно. */
export function registerSettingsHandlers(userProfileRepository: UserProfileRepository): void {
  ipcMain.handle('settings:get', (): AppSettings => {
    return toAppSettings(userProfileRepository.getOrCreate())
  })

  ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>): AppSettings => {
    const updated = userProfileRepository.update(patch)
    return toAppSettings(updated)
  })
}
