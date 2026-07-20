/**
 * widgetId (F5, TASK-016): кодирование/декодирование id виджета сырого поля и
 * распознавание id именованных пресетов.
 */
import { describe, expect, it } from 'vitest'
import { rawFieldWidgetId, parseRawFieldWidgetId, isWidgetPresetId, WIDGET_PRESET_IDS } from '@shared/widgets/widgetId'

describe('rawFieldWidgetId / parseRawFieldWidgetId', () => {
  it('roundtrip кодирует и декодирует fieldPath', () => {
    const id = rawFieldWidgetId('hero.health_percent')
    expect(id).toBe('field:hero.health_percent')
    expect(parseRawFieldWidgetId(id)).toBe('hero.health_percent')
  })

  it('возвращает null для id, не являющегося виджетом сырого поля', () => {
    expect(parseRawFieldWidgetId('rune-timer')).toBeNull()
  })
})

describe('isWidgetPresetId', () => {
  it('распознаёт все объявленные пресеты', () => {
    for (const id of WIDGET_PRESET_IDS) {
      expect(isWidgetPresetId(id)).toBe(true)
    }
  })

  it('не путает id сырого поля с пресетом', () => {
    expect(isWidgetPresetId(rawFieldWidgetId('hero.level'))).toBe(false)
    expect(isWidgetPresetId('unknown-preset')).toBe(false)
  })
})
