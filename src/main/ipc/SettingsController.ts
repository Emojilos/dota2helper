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
 * F6 (TASK-030): steamId в патче — единственное поле, принимающее и «голый»
 * ID, и ссылку на профиль (parseSteamId64Input нормализует оба случая перед
 * персистом); невалидный ввод (не число / вне диапазона individual-аккаунта)
 * бросает Error, а не сохраняется молча — ipcRenderer.invoke прокидывает её
 * рендереру как отклонённый промис.
 *
 * INV1: живёт в main.
 */
import { AppSettingsSchema, type AppSettings } from '@shared/schemas/settings'
import type { UserProfile } from '@shared/schemas/userProfile'
import { parseSteamId64Input } from '@shared/steam/parseSteamId64'
import type { UserProfileRepository } from '../db/UserProfileRepository'

function toAppSettings(profile: UserProfile): AppSettings {
  return AppSettingsSchema.parse({
    steamId: profile.steamId,
    verbosity: profile.verbosity,
    hotkeyExpandedPanel: profile.hotkeyExpandedPanel,
    hotkeySilentMode: profile.hotkeySilentMode,
    hotkeyClickThroughToggle: profile.hotkeyClickThroughToggle,
    draftRankingMode: profile.draftRankingMode,
    silentMode: profile.silentMode,
    autoLaunch: profile.autoLaunch
  })
}

/** Пропускает steamId=null как есть (отвязка); непустую строку прогоняет через parseSteamId64Input. */
function normalizeSteamIdPatch(patch: Partial<AppSettings>): Partial<AppSettings> {
  if (patch.steamId === undefined || patch.steamId === null) {
    return patch
  }
  const parsed = parseSteamId64Input(patch.steamId)
  if (!parsed.ok) {
    throw new Error(`invalid steamId "${patch.steamId}": ${parsed.error}`)
  }
  return { ...patch, steamId: parsed.steamId }
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
      const normalizedPatch = normalizeSteamIdPatch(patch)
      const settings = toAppSettings(userProfileRepository.update(normalizedPatch))
      onApplied(settings)
      return settings
    }
  }
}
