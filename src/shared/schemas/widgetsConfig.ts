/**
 * Zod-схема widgets_config (F5, TASK-017): персистентный набор/порядок
 * виджетов конструктора (см. @shared/widgets/widgetId — id сырого поля
 * `field:<fieldPath>` или id именованного пресета). Плоский упорядоченный
 * массив — порядок элемента в массиве определяет порядок его отображения на
 * панели среди ВКЛЮЧЁННЫХ (enabled=true) виджетов; отключённые остаются в
 * списке (чтобы конструктор помнил их прежнее место), но не рендерятся.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const WidgetConfigEntrySchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean()
})
export type WidgetConfigEntry = z.infer<typeof WidgetConfigEntrySchema>

export const WidgetsConfigSchema = z.array(WidgetConfigEntrySchema)
export type WidgetsConfig = z.infer<typeof WidgetsConfigSchema>

/** Пусто, пока пользователь ни разу не открывал конструктор (TASK-017). */
export const DEFAULT_WIDGETS_CONFIG: WidgetsConfig = []
