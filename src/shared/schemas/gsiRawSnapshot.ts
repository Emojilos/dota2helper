/**
 * WidgetGsiSnapshot — санитизированный срез сырого GSI-пакета для конструктора
 * виджетов F5 (TASK-016). Содержит ТОЛЬКО пять whitelisted верхних секций
 * (map/player/hero/abilities/items) в их исходной snake_case форме — как
 * записан fieldPath в content/gsi-field-catalog.json (TASK-009). Секции
 * 'auth'/'provider' и любые прочие сюда НИКОГДА не попадают (см.
 * pickWidgetSnapshot, src/shared/gsi/): они не нужны конструктору, а auth.token
 * — секрет, которому нет места в renderer.
 *
 * Срез whitelist'ом ВЕРХНЕГО уровня (а не по конкретным полям каталога) —
 * намеренно: новое поле внутри уже разрешённой секции (напр. hero.new_field)
 * становится доступным конструктору без единой правки кода, только добавлением
 * записи в gsi-field-catalog.json (INV4).
 *
 * Zod-схема не нужна: содержимое уже прошло GsiRawPacketSchema внутри
 * parseGameState на пути в GameStateStore — здесь только структурный срез
 * того же самого распарсенного JSON, без повторной валидации.
 *
 * INV2: модуль чист (только типы, без electron/react/fs/сети).
 */

export const WIDGET_SNAPSHOT_SECTIONS = ['map', 'player', 'hero', 'abilities', 'items'] as const
export type WidgetSnapshotSection = (typeof WIDGET_SNAPSHOT_SECTIONS)[number]

/** Срез сырого пакета — по одной записи на whitelisted секцию, если она была в пакете. */
export type WidgetGsiSnapshot = Partial<Record<WidgetSnapshotSection, unknown>>
