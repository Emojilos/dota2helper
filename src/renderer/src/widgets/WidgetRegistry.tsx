import type { JSX } from 'react'
import type { GsiFieldCatalogEntry } from '@shared/schemas/gsiFieldCatalog'
import { parseRawFieldWidgetId, isWidgetPresetId, type WidgetPresetId } from '@shared/widgets/widgetId'
import { RawFieldWidget } from './RawFieldWidget'
import { RuneTimerWidget } from './RuneTimerWidget'
import { StackCounterWidget } from './StackCounterWidget'
import { BenchmarkWidget } from './BenchmarkWidget'

/**
 * WidgetRegistry (F5, TASK-016): маппит widgetId (см. @shared/widgets/widgetId)
 * на React-компонент — единственная точка, которой конструктор виджетов
 * (будущий widgets_config, TASK-017) должен знать, чтобы отрендерить набор
 * виджетов пользователя. Именованные пресеты (rune-timer/stack-counter,
 * benchmark-lh/benchmark-networth/benchmark-xp, TASK-039) — фиксированные
 * компоненты; сырые поля каталога рендерятся дженерик-
 * RawFieldWidget по найденной в fields записи (INV4: новое поле каталога
 * доступно без правки этой функции, пока widgetId для него не задан явно —
 * список доступных widgetId для UI строит сам каталог, см. TASK-017).
 *
 * Возвращает null для неизвестного widgetId (напр. поле было удалено из
 * каталога, а widgets_config пользователя ещё хранит его id) — конструктор
 * (TASK-017) сам решает, показывать ли плейсхолдер или тихо пропустить.
 */
function renderPreset(presetId: WidgetPresetId): JSX.Element {
  switch (presetId) {
    case 'rune-timer':
      return <RuneTimerWidget key={presetId} />
    case 'stack-counter':
      return <StackCounterWidget key={presetId} />
    case 'benchmark-lh':
      return <BenchmarkWidget key={presetId} metric="lh" />
    case 'benchmark-networth':
      return <BenchmarkWidget key={presetId} metric="networth" />
    case 'benchmark-xp':
      return <BenchmarkWidget key={presetId} metric="xp" />
  }
}

export function renderWidget(widgetId: string, fields: readonly GsiFieldCatalogEntry[]): JSX.Element | null {
  if (isWidgetPresetId(widgetId)) {
    return renderPreset(widgetId)
  }
  const fieldPath = parseRawFieldWidgetId(widgetId)
  if (fieldPath === null) {
    return null
  }
  const entry = fields.find((field) => field.fieldPath === fieldPath)
  return entry ? <RawFieldWidget key={widgetId} entry={entry} /> : null
}
