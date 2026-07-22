/**
 * Zod-схема контентного конфига overlay-anchors.json (F5, TASK-040, INV4).
 *
 * Экранные координаты, под которые калибруются оверлей-пресеты позиции
 * (сейчас — только `standardPanel`, TASK-040: компактная панель точно поверх
 * родной панели статистики Dota). Ключ разрешения — `${width}x${height}`
 * (см. resolveOverlayAnchor, @shared/overlay/overlayAnchors); `default` —
 * обязательный фолбэк для любого разрешения без явной записи.
 *
 * Правка/добавление разрешения подхватывается hot-reload'ом ConfigLoader
 * (TASK-011) без пересборки — владелец докалибрует координаты под свой экран
 * после живого прогона на Windows-машине (см. CLAUDE.md §1), не трогая код.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const OverlayAnchorPositionSchema = z.object({
  x: z.number(),
  y: z.number()
})
export type OverlayAnchorPosition = z.infer<typeof OverlayAnchorPositionSchema>

/** Карта разрешение→позиция; `default` обязателен как фолбэк для неоткалиброванных разрешений. */
export const OverlayAnchorResolutionMapSchema = z
  .object({ default: OverlayAnchorPositionSchema })
  .catchall(OverlayAnchorPositionSchema)
export type OverlayAnchorResolutionMap = z.infer<typeof OverlayAnchorResolutionMapSchema>

export const OverlayAnchorsConfigSchema = z.object({
  standardPanel: OverlayAnchorResolutionMapSchema
})
export type OverlayAnchorsConfig = z.infer<typeof OverlayAnchorsConfigSchema>
