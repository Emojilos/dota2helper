/**
 * Компактная панель F5 режим 1 (TASK-014): проверяет, что высота окна растёт
 * линейно с числом виджетов (акцептанс-критерий «размер адаптируется к набору
 * виджетов») и что дефолтный набор виджетов не пуст.
 */
import { describe, expect, it } from 'vitest'
import {
  compactPanelHeight,
  DEFAULT_COMPACT_PANEL_WIDGET_IDS,
  COMPACT_PANEL_WINDOW_ID,
  COMPACT_PANEL_DEFAULT_POSITION
} from '@shared/overlay/compactPanel'

describe('compactPanelHeight', () => {
  it('растёт с числом виджетов', () => {
    const zero = compactPanelHeight(0)
    const one = compactPanelHeight(1)
    const three = compactPanelHeight(3)
    expect(one).toBeGreaterThan(zero)
    expect(three).toBeGreaterThan(one)
    expect(three - one).toBe(2 * (one - zero))
  })
})

describe('compact panel defaults', () => {
  it('дефолтный набор виджетов соответствует разделу F5 PRD (событие/фаза/руна)', () => {
    expect(DEFAULT_COMPACT_PANEL_WIDGET_IDS).toContain('nextEvent')
    expect(DEFAULT_COMPACT_PANEL_WIDGET_IDS).toContain('phase')
    expect(DEFAULT_COMPACT_PANEL_WIDGET_IDS).toContain('nextRune')
  })

  it('id окна и дефолтная позиция определены', () => {
    expect(COMPACT_PANEL_WINDOW_ID).toBe('compactPanel')
    expect(COMPACT_PANEL_DEFAULT_POSITION).toEqual({ x: 24, y: 160 })
  })
})
