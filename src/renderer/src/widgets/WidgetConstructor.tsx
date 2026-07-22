import { useEffect, useMemo, useState, type DragEvent, type JSX } from 'react'
import type { GsiFieldCatalogEntry, GsiFieldCategory } from '@shared/schemas/gsiFieldCatalog'
import type { WidgetsConfig } from '@shared/schemas/widgetsConfig'
import { rawFieldWidgetId, parseRawFieldWidgetId, isWidgetPresetId, WIDGET_PRESET_IDS } from '@shared/widgets/widgetId'
import {
  mergeWidgetsConfig,
  toggleWidgetEnabled,
  reorderEnabledWidgets,
  knownWidgetIds,
  WIDGET_PRESET_LABELS_RU
} from '@shared/widgets/widgetsConfigOps'
import { useSettingsStore } from '../store/settingsStore'
import { useGsiFieldCatalog } from './useGsiFieldCatalog'

/** Порядок и русские подписи секций каталога (раздел F5 PRD). Только для этого меню — сам каталог хранит category в английском enum. */
const CATEGORY_ORDER: readonly GsiFieldCategory[] = ['hero', 'player', 'match', 'abilities', 'items']
const CATEGORY_LABELS_RU: Record<GsiFieldCategory, string> = {
  hero: 'Герой',
  player: 'Игрок',
  match: 'Матч',
  abilities: 'Способности',
  items: 'Предметы'
}

function widgetLabel(id: string, fields: readonly GsiFieldCatalogEntry[]): string {
  if (isWidgetPresetId(id)) {
    return WIDGET_PRESET_LABELS_RU[id]
  }
  const fieldPath = parseRawFieldWidgetId(id)
  const entry = fieldPath ? fields.find((field) => field.fieldPath === fieldPath) : undefined
  return entry?.labelRu ?? id
}

function isEnabled(config: WidgetsConfig, id: string): boolean {
  return config.find((entry) => entry.id === id)?.enabled ?? false
}

/**
 * Полноценное меню конструктора виджетов F5 (TASK-017): весь каталог
 * gsi-field-catalog.json, сгруппированный по категориям, + чекбоксы включения
 * (раздел "Каталог") и отдельный список включённых виджетов с drag-and-drop
 * порядком (раздел "Порядок на панели") — порядок в котором они реально
 * рендерятся компактной панелью (см. CompactPanel.tsx). Оба раздела читают и
 * пишут ОДИН и тот же AppSettings.widgetsConfig через settings:set (TASK-018)
 * — единственный источник правды, без промежуточного локального состояния
 * (тот же приём, что переключатель Meta/Personal в DraftPanel.tsx).
 *
 * mergeWidgetsConfig (@shared/widgets/widgetsConfigOps) достраивает
 * персистентный список новыми полями каталога (enabled=false) и отбрасывает
 * устаревшие id — конструктор всегда видит актуальный каталог, даже если
 * пользователь никогда не открывал это меню (widgetsConfig=[]) или каталог
 * пополнился после hot-reload (INV4).
 */
export function WidgetConstructor(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const catalog = useGsiFieldCatalog()
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const init = useSettingsStore((state) => state.init)

  useEffect(() => {
    init()
  }, [init])

  const knownIds = useMemo(
    () => knownWidgetIds(catalog.fields.map((field) => rawFieldWidgetId(field.fieldPath))),
    [catalog.fields]
  )
  const merged = useMemo(() => mergeWidgetsConfig(settings?.widgetsConfig ?? [], knownIds), [settings, knownIds])

  const persist = (next: WidgetsConfig): void => {
    void setSettings({ widgetsConfig: next })
  }
  const toggle = (id: string): void => persist(toggleWidgetEnabled(merged, id))
  const reorder = (draggedId: string, targetId: string): void => persist(reorderEnabledWidgets(merged, draggedId, targetId))

  const enabledIds = merged.filter((entry) => entry.enabled).map((entry) => entry.id)

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string): void => {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData('text/plain')
    if (draggedId) {
      reorder(draggedId, targetId)
    }
  }

  return (
    <div className="mt-2 border-t border-white/10 pt-2 text-xs">
      <button
        type="button"
        className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Скрыть' : 'Показать'} конструктор виджетов ({enabledIds.length} вкл.)
      </button>
      {expanded && (
        <div className="mt-1 space-y-2">
          <div>
            <p className="text-slate-400">Порядок на панели</p>
            {enabledIds.length === 0 && <p className="text-slate-500">Ничего не включено</p>}
            <div className="divide-y divide-white/5 rounded border border-white/10">
              {enabledIds.map((id) => (
                <div
                  key={id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, id)}
                  className="cursor-move px-2 py-1 hover:bg-white/5"
                >
                  ⠿ {widgetLabel(id, catalog.fields)}
                </div>
              ))}
            </div>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-white/10 p-1">
            <div>
              <p className="text-slate-400">Пресеты</p>
              {WIDGET_PRESET_IDS.map((id) => (
                <label key={id} className="flex items-center gap-1 px-1 py-0.5">
                  <input type="checkbox" checked={isEnabled(merged, id)} onChange={() => toggle(id)} />
                  {WIDGET_PRESET_LABELS_RU[id]}
                </label>
              ))}
            </div>
            {CATEGORY_ORDER.map((category) => {
              const fields = catalog.fields.filter((field) => field.category === category)
              if (fields.length === 0) {
                return null
              }
              return (
                <div key={category}>
                  <p className="text-slate-400">{CATEGORY_LABELS_RU[category]}</p>
                  {fields.map((field) => {
                    const id = rawFieldWidgetId(field.fieldPath)
                    return (
                      <label key={id} className="flex items-center gap-1 px-1 py-0.5">
                        <input type="checkbox" checked={isEnabled(merged, id)} onChange={() => toggle(id)} />
                        {field.labelRu}
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
