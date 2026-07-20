/**
 * formatFieldValue — форматирует значение сырого GSI-поля (из WidgetGsiSnapshot,
 * см. resolveFieldPath) под display-строку по format каталога (F5, TASK-016,
 * content/gsi-field-catalog.json). Единственное место, знающее, как выглядит
 * каждый format — дженерик-рендерер конструктора виджетов (renderer) вызывает
 * только эту функцию, не завязываясь на конкретные поля (INV4).
 *
 * INV2: модуль чист (без electron/react/fs/сети).
 */
import type { GsiFieldFormat } from '../schemas/gsiFieldCatalog'
import { formatClockTime } from '../index'

/** Значение отсутствует в текущем срезе (поле ещё не пришло с GSI). */
const NO_VALUE = '—'

export function formatFieldValue(value: unknown, format: GsiFieldFormat): string {
  if (value === undefined || value === null) {
    return NO_VALUE
  }
  switch (format) {
    case 'bool':
      return formatBool(value)
    case 'int':
      return formatInt(value)
    case 'percent':
      return formatPercent(value)
    case 'gold':
      return formatInt(value)
    case 'time':
      return formatTime(value)
    case 'text':
      return typeof value === 'string' ? value : String(value)
  }
}

function toNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function formatBool(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'да' : 'нет'
  }
  if (typeof value === 'number') {
    return value !== 0 ? 'да' : 'нет'
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1' ? 'да' : 'нет'
  }
  return NO_VALUE
}

function formatInt(value: unknown): string {
  const num = toNumber(value)
  return num === null ? NO_VALUE : String(Math.round(num))
}

function formatPercent(value: unknown): string {
  const num = toNumber(value)
  return num === null ? NO_VALUE : `${Math.round(num)}%`
}

function formatTime(value: unknown): string {
  const num = toNumber(value)
  return num === null ? NO_VALUE : formatClockTime(num)
}
