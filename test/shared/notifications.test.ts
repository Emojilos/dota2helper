/**
 * Окно всплывающих уведомлений F5 режим 2 (TASK-015): проверяет, что
 * дефолтная зона не пересекает миникарту/HUD/панель героя (раздел 6 PRD) в
 * референсном разрешении, и что константы видимости/лимита совпадают с
 * контрактом AdviceScheduler (TASK-013: ≤2 на экране, 5-8с показа).
 */
import { describe, expect, it } from 'vitest'
import {
  NOTIFICATIONS_WINDOW_ID,
  NOTIFICATIONS_REFERENCE_RESOLUTION,
  NOTIFICATIONS_WIDTH,
  NOTIFICATIONS_HEIGHT,
  NOTIFICATIONS_POSITION,
  ADVICE_VISIBLE_MS,
  NOTIFICATIONS_MAX_VISIBLE
} from '@shared/overlay/notifications'

describe('notifications window zone', () => {
  it('id окна определён', () => {
    expect(NOTIFICATIONS_WINDOW_ID).toBe('notifications')
  })

  it('зона целиком помещается в референсное разрешение', () => {
    expect(NOTIFICATIONS_POSITION.x).toBeGreaterThanOrEqual(0)
    expect(NOTIFICATIONS_POSITION.y).toBeGreaterThanOrEqual(0)
    expect(NOTIFICATIONS_POSITION.x + NOTIFICATIONS_WIDTH).toBeLessThanOrEqual(
      NOTIFICATIONS_REFERENCE_RESOLUTION.width
    )
    expect(NOTIFICATIONS_POSITION.y + NOTIFICATIONS_HEIGHT).toBeLessThanOrEqual(
      NOTIFICATIONS_REFERENCE_RESOLUTION.height
    )
  })

  it('центрирована по горизонтали (панель героя — низ по центру, раздел 6 PRD)', () => {
    const center = NOTIFICATIONS_REFERENCE_RESOLUTION.width / 2
    const zoneCenter = NOTIFICATIONS_POSITION.x + NOTIFICATIONS_WIDTH / 2
    expect(zoneCenter).toBe(center)
  })

  it('заканчивается заметно выше низа экрана — не заезжает на панель героя/миникарту', () => {
    const zoneBottom = NOTIFICATIONS_POSITION.y + NOTIFICATIONS_HEIGHT
    // панель героя + миникарта занимают нижние ~150px в 1080p — оставляем зазор
    expect(NOTIFICATIONS_REFERENCE_RESOLUTION.height - zoneBottom).toBeGreaterThan(150)
  })
})

describe('notifications visibility contract', () => {
  it('визуальная длительность в пределах 5-8с диапазона AdviceScheduler', () => {
    expect(ADVICE_VISIBLE_MS).toBeGreaterThanOrEqual(5000)
    expect(ADVICE_VISIBLE_MS).toBeLessThanOrEqual(8000)
  })

  it('максимум карточек на экране равен лимиту AdviceScheduler (TASK-013)', () => {
    expect(NOTIFICATIONS_MAX_VISIBLE).toBe(2)
  })
})
