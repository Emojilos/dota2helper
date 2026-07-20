import { useState, type JSX } from 'react'
import { useGsiFieldCatalog } from './useGsiFieldCatalog'
import { rawFieldWidgetId, WIDGET_PRESET_IDS } from '@shared/widgets/widgetId'
import { renderWidget } from './WidgetRegistry'

/**
 * Превью конструктора виджетов F5 (TASK-016): раскрывающийся список ВСЕХ
 * полей текущего gsi-field-catalog.json + обоих именованных пресетов,
 * отрендеренных через WidgetRegistry. Полноценное меню с чекбоксами/drag-and-
 * drop и персистом набора — TASK-017; здесь только доказательство, что реестр
 * реально показывает живые значения любого поля каталога без правки кода
 * (акцептанс-критерии TASK-016) — свёрнуто по умолчанию, чтобы не загромождать
 * основное окно настроек 77+ строками.
 */
export function WidgetGallery(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const catalog = useGsiFieldCatalog()

  return (
    <div className="mt-2 border-t border-white/10 pt-2 text-xs">
      <button
        type="button"
        className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Скрыть' : 'Показать'} виджеты ({catalog.fields.length + WIDGET_PRESET_IDS.length})
      </button>
      {expanded && (
        <div className="mt-1 max-h-64 divide-y divide-white/5 overflow-y-auto rounded border border-white/10">
          {WIDGET_PRESET_IDS.map((id) => renderWidget(id, catalog.fields))}
          {catalog.fields.map((field) => renderWidget(rawFieldWidgetId(field.fieldPath), catalog.fields))}
        </div>
      )}
    </div>
  )
}
