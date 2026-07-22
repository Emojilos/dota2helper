/**
 * widgetsConfigOps (F5, TASK-017): слияние конструктора с каталогом,
 * переключение enabled и переупорядочивание включённых виджетов.
 */
import { describe, expect, it } from 'vitest'
import {
  mergeWidgetsConfig,
  toggleWidgetEnabled,
  reorderEnabledWidgets,
  knownWidgetIds,
  WIDGET_PRESET_LABELS_RU
} from '@shared/widgets/widgetsConfigOps'
import { WIDGET_PRESET_IDS } from '@shared/widgets/widgetId'
import type { WidgetsConfig } from '@shared/schemas/widgetsConfig'

describe('mergeWidgetsConfig', () => {
  it('сохраняет порядок и enabled уже существующих записей', () => {
    const existing: WidgetsConfig = [
      { id: 'field:b', enabled: true },
      { id: 'field:a', enabled: false }
    ]
    const merged = mergeWidgetsConfig(existing, ['field:a', 'field:b'])
    expect(merged).toEqual(existing)
  })

  it('дописывает новые известные id в конец с enabled=false', () => {
    const existing: WidgetsConfig = [{ id: 'field:a', enabled: true }]
    const merged = mergeWidgetsConfig(existing, ['field:a', 'field:b', 'field:c'])
    expect(merged).toEqual([
      { id: 'field:a', enabled: true },
      { id: 'field:b', enabled: false },
      { id: 'field:c', enabled: false }
    ])
  })

  it('отбрасывает записи, чьих id больше нет среди known (поле удалено из каталога)', () => {
    const existing: WidgetsConfig = [
      { id: 'field:a', enabled: true },
      { id: 'field:removed', enabled: true }
    ]
    const merged = mergeWidgetsConfig(existing, ['field:a'])
    expect(merged).toEqual([{ id: 'field:a', enabled: true }])
  })

  it('пустой existing даёт полный список выключенных известных id', () => {
    const merged = mergeWidgetsConfig([], ['field:a', 'field:b'])
    expect(merged).toEqual([
      { id: 'field:a', enabled: false },
      { id: 'field:b', enabled: false }
    ])
  })
})

describe('toggleWidgetEnabled', () => {
  it('переключает enabled только у записи с указанным id, не меняя порядок', () => {
    const config: WidgetsConfig = [
      { id: 'field:a', enabled: false },
      { id: 'field:b', enabled: true }
    ]
    expect(toggleWidgetEnabled(config, 'field:a')).toEqual([
      { id: 'field:a', enabled: true },
      { id: 'field:b', enabled: true }
    ])
    expect(toggleWidgetEnabled(config, 'field:b')).toEqual([
      { id: 'field:a', enabled: false },
      { id: 'field:b', enabled: false }
    ])
  })
})

describe('reorderEnabledWidgets', () => {
  it('переносит включённый виджет на место другого включённого, не трогая отключённые', () => {
    const config: WidgetsConfig = [
      { id: 'field:a', enabled: true },
      { id: 'field:b', enabled: true },
      { id: 'field:c', enabled: false },
      { id: 'field:d', enabled: true }
    ]
    const next = reorderEnabledWidgets(config, 'field:d', 'field:a')
    expect(next).toEqual([
      { id: 'field:d', enabled: true },
      { id: 'field:a', enabled: true },
      { id: 'field:b', enabled: true },
      { id: 'field:c', enabled: false }
    ])
  })

  it('возвращает исходный конфиг без изменений, если dragged или target не включены', () => {
    const config: WidgetsConfig = [
      { id: 'field:a', enabled: true },
      { id: 'field:b', enabled: false }
    ]
    expect(reorderEnabledWidgets(config, 'field:b', 'field:a')).toBe(config)
    expect(reorderEnabledWidgets(config, 'field:a', 'field:unknown')).toBe(config)
  })

  it('не меняет ничего, если dragged и target совпадают', () => {
    const config: WidgetsConfig = [
      { id: 'field:a', enabled: true },
      { id: 'field:b', enabled: true }
    ]
    expect(reorderEnabledWidgets(config, 'field:a', 'field:a')).toBe(config)
  })
})

describe('knownWidgetIds', () => {
  it('ставит пресеты перед сырыми полями каталога', () => {
    expect(knownWidgetIds(['field:a', 'field:b'])).toEqual([...WIDGET_PRESET_IDS, 'field:a', 'field:b'])
  })
})

describe('WIDGET_PRESET_LABELS_RU', () => {
  it('содержит подпись для каждого объявленного пресета', () => {
    for (const id of WIDGET_PRESET_IDS) {
      expect(WIDGET_PRESET_LABELS_RU[id]).toBeTruthy()
    }
  })
})
