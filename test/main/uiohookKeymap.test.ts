import { describe, expect, it } from 'vitest'
import { buildUiohookKeymap, mainKeyTokens } from '@main/hotkeys/uiohookKeymap'
import { parseAccelerator } from '@shared/hotkeys/parseAccelerator'

/** Синтетический полный набор констант — реальный UiohookKey в тестах не грузим (native). */
function fullConstants(): Record<string, number> {
  const constants: Record<string, number> = {}
  mainKeyTokens().forEach((token, index) => {
    constants[token] = 1000 + index
  })
  return constants
}

describe('uiohookKeymap', () => {
  it('maps every token the parser can produce when constants provide it (drift guard)', () => {
    const keymap = buildUiohookKeymap(fullConstants())
    for (const token of mainKeyTokens()) {
      // каждый токен keymap'а действительно парсится как основная клавиша
      expect(parseAccelerator(token, 'win32')).toMatchObject({ ok: true, chord: { key: token } })
      expect(keymap.get(token)).toBeDefined()
    }
  })

  it('covers F1–F24, A–Z and 0–9 (60 tokens)', () => {
    expect(mainKeyTokens()).toHaveLength(24 + 26 + 10)
    expect(buildUiohookKeymap(fullConstants()).size).toBe(60)
  })

  it('silently skips tokens missing from the provided constants', () => {
    const keymap = buildUiohookKeymap({ F8: 66, A: 30 })
    expect(keymap.get('F8')).toBe(66)
    expect(keymap.get('A')).toBe(30)
    expect(keymap.get('F13')).toBeUndefined()
    expect(keymap.size).toBe(2)
  })
})
