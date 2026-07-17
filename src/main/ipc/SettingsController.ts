/**
 * Единая точка мутации настроек (TASK-018). AppSettings — проекция
 * персистентного UserProfile (см. shared/schemas/userProfile.ts); здесь
 * отбираем только её поля, остальные (overlayPositions/notificationsConfig/
 * widgetsConfig/timestamps) — забота будущих задач (TASK-014/016).
 *
 * Любая мутация настроек — из renderer (settings:set) или из main (напр.
 * хоткей тихого режима из HotkeyManager) — идёт через apply(), чтобы
 * персист (UserProfileRepository) и рассылка (settings:update во все окна +
 * реконсиляция HotkeyManager при смене акселераторов) не расходились по
 * двум точкам.
 *
 * INV1: живёт в main.
 */
import { AppSettingsSchema, type AppSettings } from '@shared/schemas/settings'
import type { UserProfile } from '@shared/schemas/userProfile'
import type { UserProfileRepository } from '../db/UserProfileRepository'

function toAppSettings(profile: UserProfile): AppSettings {
  return AppSettingsSchema.parse({
    steamId: profile.steamId,
    verbosity: profile.verbosity,
    hotkeyExpandedPanel: profile.hotkeyExpandedPanel,
    hotkeySilentMode: profile.hotkeySilentMode,
    draftRankingMode: profile.draftRankingMode,
    silentMode: profile.silentMode
  })
}

export interface SettingsController {
  get(): AppSettings
  apply(patch: Partial<AppSettings>): AppSettings
}

/** onApplied зовётся после каждого успешного apply() — с уже спроецированным AppSettings. */
export function createSettingsController(
  userProfileRepository: UserProfileRepository,
  onApplied: (settings: AppSettings) => void
): SettingsController {
  return {
    get(): AppSettings {
      return toAppSettings(userProfileRepository.getOrCreate())
    },
    apply(patch: Partial<AppSettings>): AppSettings {
      const settings = toAppSettings(userProfileRepository.update(patch))
      onApplied(settings)
      return settings
    }
  }
}
