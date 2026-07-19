import { describe, expect, it } from 'vitest'
import { matchChord } from '@shared/hotkeys/matchChord'

const F8 = 66

function makeEvent(overrides: Partial<{ keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) {
  return { keycode: F8, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...overrides }
}

describe('matchChord', () => {
  it('matches a bare key with no modifiers held', () => {
    expect(matchChord(makeEvent(), { keycode: F8, ctrl: false, alt: false, shift: false, meta: false })).toBe(true)
  })

  it('does not match when a modifier is held but the chord expects none (bare F8 vs Ctrl+F8 pressed)', () => {
    expect(matchChord(makeEvent({ ctrlKey: true }), { keycode: F8, ctrl: false, alt: false, shift: false, meta: false })).toBe(false)
  })

  it('does not match when the chord expects a modifier that is not held (Ctrl+F8 vs bare F8 pressed)', () => {
    expect(matchChord(makeEvent(), { keycode: F8, ctrl: true, alt: false, shift: false, meta: false })).toBe(false)
  })

  it('does not match a different keycode', () => {
    expect(matchChord(makeEvent({ keycode: 67 }), { keycode: F8, ctrl: false, alt: false, shift: false, meta: false })).toBe(false)
  })

  it('matches a full modifier chord exactly', () => {
    expect(
      matchChord(makeEvent({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }), {
        keycode: F8,
        ctrl: true,
        alt: true,
        shift: true,
        meta: true
      })
    ).toBe(true)
  })
})
