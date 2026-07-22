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
import { WidgetsConfigSchema, DEFAULT_WIDGETS_CONFIG } from './widgetsConfig'

/** Уровень многословности подсказок (раздел 6 PRD). */
export const VerbositySchema = z.enum(['minimal', 'experienced', 'verbose'])
export type Verbosity = z.infer<typeof VerbositySchema>

/** Режим ранжирования драфта (F1): по мете или с учётом личной статистики. */
export const DraftRankingModeSchema = z.enum(['meta', 'personal'])
export type DraftRankingMode = z.infer<typeof DraftRankingModeSchema>

/**
 * Пресет позиции/набора виджетов компактной панели (F5, TASK-040):
 * 'default' — верхний левый угол ниже топ-бара (раздел F5 PRD, режим 1);
 * 'standardPanel' — панель накрывает родную панель статистики Dota
 * (KDA/LH-DN/GPM-XPM в углу экрана, координаты калиброваны в
 * content/overlay-anchors.json).
 */
export const CompactPanelPresetSchema = z.enum(['default', 'standardPanel'])
export type CompactPanelPreset = z.infer<typeof CompactPanelPresetSchema>

/** Позиция окна оверлея на экране (TASK-014), в пикселях экранных координат. */
export const OverlayPositionSchema = z.object({
  x: z.number(),
  y: z.number()
})
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>

/** Запомненные позиции оверлей-окон, ключ — id окна (напр. 'compactPanel', TASK-014). */
export const OverlayPositionsSchema = z.record(z.string(), OverlayPositionSchema)
export type OverlayPositions = z.infer<typeof OverlayPositionsSchema>

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
  autoLaunch: z.boolean(),
  /** запомненные позиции оверлей-окон (TASK-014), пусто пока ни одно не перетаскивали */
  overlayPositions: OverlayPositionsSchema,
  /** набор/порядок виджетов конструктора F5 (TASK-017), пусто пока не настроен */
  widgetsConfig: WidgetsConfigSchema,
  /** пресет позиции/дефолтных виджетов компактной панели (TASK-040), по умолчанию 'default' */
  compactPanelPreset: CompactPanelPresetSchema
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
  autoLaunch: false,
  overlayPositions: {},
  widgetsConfig: DEFAULT_WIDGETS_CONFIG,
  compactPanelPreset: 'default'
}
