/**
 * Zod-схема пользовательских настроек (проекция UserProfile для IPC-контракта).
 * Здесь — минимальный контракт для settings:get/settings:set (TASK-004);
 * полное хранилище профиля и репозиторий появятся в TASK-010/TASK-018.
 *
 * hotkeyExpandedPanel, hotkeySilentMode и hotkeyClickThroughToggle (TASK-008)
 * — конфигурируемые globalShortcut-акселераторы. Сама интерактивность окна
 * (click-through вкл/выкл) — эфемерное состояние OverlayWindow, не
 * персистится: дефолт всегда click-through, персистить нечего.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

/** Уровень многословности подсказок (раздел 6 PRD). */
export const VerbositySchema = z.enum(['minimal', 'experienced', 'verbose'])
export type Verbosity = z.infer<typeof VerbositySchema>

/** Режим ранжирования драфта (F1): по мете или с учётом личной статистики. */
export const DraftRankingModeSchema = z.enum(['meta', 'personal'])
export type DraftRankingMode = z.infer<typeof DraftRankingModeSchema>

export const AppSettingsSchema = z.object({
  /** привязанный Steam ID (64-bit) либо null */
  steamId: z.string().nullable(),
  verbosity: VerbositySchema,
  /** глобальный хоткей расширенной панели, напр. "F9" */
  hotkeyExpandedPanel: z.string(),
  /** глобальный хоткей тихого режима (скрыть весь оверлей), напр. "F10" */
  hotkeySilentMode: z.string(),
  /** глобальный хоткей переключения click-through базового overlay-окна (TASK-008), напр. "F8" */
  hotkeyClickThroughToggle: z.string(),
  draftRankingMode: DraftRankingModeSchema,
  silentMode: z.boolean(),
  /** автозапуск приложения вместе с системой (TASK-046), выкл по умолчанию */
  autoLaunch: z.boolean()
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

/** Дефолтный профиль (verbosity=experienced, hotkey=F9, draft_mode=meta). */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  steamId: null,
  verbosity: 'experienced',
  hotkeyExpandedPanel: 'F9',
  hotkeySilentMode: 'F10',
  hotkeyClickThroughToggle: 'F8',
  draftRankingMode: 'meta',
  silentMode: false,
  autoLaunch: false
}
