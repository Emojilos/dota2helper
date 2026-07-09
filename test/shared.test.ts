import { describe, it, expect } from 'vitest'
import { APP_NAME, formatClockTime } from '@shared/index'

describe('scaffold: shared module + path aliases', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('MidMind')
  })

  it('formats game clock as MM:SS', () => {
    expect(formatClockTime(0)).toBe('0:00')
    expect(formatClockTime(9)).toBe('0:09')
    expect(formatClockTime(125)).toBe('2:05')
    expect(formatClockTime(3600)).toBe('60:00')
  })

  it('keeps the sign for countdown (negative) time', () => {
    expect(formatClockTime(-30)).toBe('-0:30')
  })
})
