/**
 * Чистые операции над WidgetsConfig (F5, TASK-017) — используются меню
 * конструктора в renderer, вынесены сюда (не в компонент), чтобы быть
 * тестируемыми без React (по образцу mergeWidgetsConfig/reorderEnabledWidgets
 * как чистых функций над данными, INV2).
 */
import type { WidgetConfigEntry, WidgetsConfig } from '../schemas/widgetsConfig'
import { WIDGET_PRESET_IDS, type WidgetPresetId } from './widgetId'

/** Русские подписи именованных пресетов — только для меню конструктора (сами виджеты берут фолбэк-лейбл из своих данных). */
export const WIDGET_PRESET_LABELS_RU: Record<WidgetPresetId, string> = {
  'rune-timer': 'Ближайшая руна',
  'stack-counter': 'Стак кемпа',
  'benchmark-lh': 'Бенчмарк: добито',
  'benchmark-networth': 'Бенчмарк: net worth',
  'benchmark-xp': 'Бенчмарк: опыт',
  kda: 'KDA',
  'lh-dn': 'Ластхиты/Денаи',
  'gpm-xpm': 'GPM/XPM'
}

/**
 * Строит полный упорядоченный список конструктора: сохраняет порядок и
 * enabled уже сохранённых записей, отбрасывает те, чьих id больше нет среди
 * knownIds (поле убрано из каталога — редкий, но возможный случай), и
 * дописывает в конец новые известные id с enabled=false (только что
 * появившиеся в каталоге, напр. после hot-reload gsi-field-catalog.json, INV4).
 */
export function mergeWidgetsConfig(existing: WidgetsConfig, knownIds: readonly string[]): WidgetsConfig {
  const knownSet = new Set(knownIds)
  const kept = existing.filter((entry) => knownSet.has(entry.id))
  const keptIds = new Set(kept.map((entry) => entry.id))
  const added: WidgetConfigEntry[] = knownIds
    .filter((id) => !keptIds.has(id))
    .map((id) => ({ id, enabled: false }))
  return [...kept, ...added]
}

/** Переключает enabled одной записи по id, не трогая порядок остальных. */
export function toggleWidgetEnabled(config: WidgetsConfig, id: string): WidgetsConfig {
  return config.map((entry) => (entry.id === id ? { ...entry, enabled: !entry.enabled } : entry))
}

/**
 * Переносит draggedId на место targetId СРЕДИ ВКЛЮЧЁННЫХ виджетов (порядок,
 * в котором они реально рендерятся на панели) — отключённые записи остаются
 * на своих местах в хвосте списка, их взаимный порядок не имеет значения
 * (они нигде не рендерятся, пока не включены).
 */
export function reorderEnabledWidgets(config: WidgetsConfig, draggedId: string, targetId: string): WidgetsConfig {
  const enabledIds = config.filter((entry) => entry.enabled).map((entry) => entry.id)
  const from = enabledIds.indexOf(draggedId)
  const to = enabledIds.indexOf(targetId)
  if (from === -1 || to === -1 || from === to) {
    return config
  }
  const reordered = [...enabledIds]
  reordered.splice(from, 1)
  reordered.splice(to, 0, draggedId)
  const disabled = config.filter((entry) => !entry.enabled)
  return [...reordered.map((id) => ({ id, enabled: true })), ...disabled]
}

/** Известные id для конструктора: сырые поля каталога + фиксированные пресеты. */
export function knownWidgetIds(catalogFieldIds: readonly string[]): string[] {
  return [...WIDGET_PRESET_IDS, ...catalogFieldIds]
}
