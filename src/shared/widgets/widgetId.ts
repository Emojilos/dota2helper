/**
 * widgetId — идентификаторы виджетов конструктора F5 (TASK-016). Один плоский
 * набор строк для ДВУХ разных вещей — сырых полей каталога и именованных
 * пресетов — чтобы будущий widgets_config (TASK-017, персист набора/порядка)
 * мог хранить их в одном списке `string[]`, не различая типы на уровне схемы.
 *
 * Сырое поле кодируется префиксом (RAW_FIELD_WIDGET_PREFIX + fieldPath, напр.
 * 'field:hero.health_percent') — сам fieldPath уже уникален внутри каталога
 * (GsiFieldCatalogConfigSchema это гарантирует), дублировать не нужно.
 * Пресеты — фиксированный список WIDGET_PRESET_IDS вне каталога (TASK-016
 * реализует ровно rune-timer/stack-counter; расширение списка — правка кода,
 * т.к. у пресета есть собственная логика вычисления, а не просто format, INV4
 * тут не применим).
 *
 * INV2: модуль чист (без electron/react/fs/сети).
 */

const RAW_FIELD_WIDGET_PREFIX = 'field:'

/** Строит id виджета сырого поля каталога по его fieldPath. */
export function rawFieldWidgetId(fieldPath: string): string {
  return `${RAW_FIELD_WIDGET_PREFIX}${fieldPath}`
}

/** Возвращает fieldPath, если widgetId — виджет сырого поля; иначе null. */
export function parseRawFieldWidgetId(widgetId: string): string | null {
  return widgetId.startsWith(RAW_FIELD_WIDGET_PREFIX) ? widgetId.slice(RAW_FIELD_WIDGET_PREFIX.length) : null
}

export const WIDGET_PRESET_IDS = ['rune-timer', 'stack-counter'] as const
export type WidgetPresetId = (typeof WIDGET_PRESET_IDS)[number]

export function isWidgetPresetId(widgetId: string): widgetId is WidgetPresetId {
  return (WIDGET_PRESET_IDS as readonly string[]).includes(widgetId)
}
