import { describe, expect, it } from 'vitest'
import { parseAccelerator } from '@shared/hotkeys/parseAccelerator'

describe('parseAccelerator', () => {
  it.each(['F1', 'F8', 'F19', 'F24'])('parses bare function key %s', (key) => {
    expect(parseAccelerator(key, 'win32')).toEqual({
      ok: true,
      chord: { key, ctrl: false, alt: false, shift: false, meta: false }
    })
  })

  it('parses a bare letter case-insensitively and normalizes to upper case', () => {
    expect(parseAccelerator('a', 'win32')).toEqual({
      ok: true,
      chord: { key: 'A', ctrl: false, alt: false, shift: false, meta: false }
    })
  })

  it('parses a bare digit', () => {
    expect(parseAccelerator('7', 'win32')).toEqual({
      ok: true,
      chord: { key: '7', ctrl: false, alt: false, shift: false, meta: false }
    })
  })

  it('parses modifier combinations', () => {
    expect(parseAccelerator('Ctrl+Shift+A', 'win32')).toEqual({
      ok: true,
      chord: { key: 'A', ctrl: true, alt: false, shift: true, meta: false }
    })
    expect(parseAccelerator('Alt+F4', 'win32')).toEqual({
      ok: true,
      chord: { key: 'F4', ctrl: false, alt: true, shift: false, meta: false }
    })
  })

  it('resolves CommandOrControl per platform', () => {
    expect(parseAccelerator('CommandOrControl+X', 'win32')).toMatchObject({
      ok: true,
      chord: { key: 'X', ctrl: true, meta: false }
    })
    expect(parseAccelerator('CmdOrCtrl+X', 'darwin')).toMatchObject({
      ok: true,
      chord: { key: 'X', ctrl: false, meta: true }
    })
  })

  it('tolerates whitespace around tokens and mixed case', () => {
    expect(parseAccelerator('  ctrl +  f8 ', 'win32')).toEqual({
      ok: true,
      chord: { key: 'F8', ctrl: true, alt: false, shift: false, meta: false }
    })
  })

  it('tolerates duplicated modifiers', () => {
    expect(parseAccelerator('Ctrl+Control+F8', 'win32')).toMatchObject({
      ok: true,
      chord: { key: 'F8', ctrl: true }
    })
  })

  it('rejects an empty accelerator', () => {
    expect(parseAccelerator('', 'win32')).toMatchObject({ ok: false })
    expect(parseAccelerator(' + ', 'win32')).toMatchObject({ ok: false })
  })

  it('rejects modifiers without a main key', () => {
    expect(parseAccelerator('Ctrl+Shift', 'win32')).toMatchObject({ ok: false, error: expect.stringContaining('no main key') })
  })

  it('rejects multiple main keys', () => {
    expect(parseAccelerator('F8+F9', 'win32')).toMatchObject({ ok: false, error: expect.stringContaining('multiple') })
  })

  it.each(['F25', 'Space', 'Escape', 'AB', 'ф'])('rejects unsupported key token %s', (token) => {
    expect(parseAccelerator(token, 'win32')).toMatchObject({ ok: false, error: expect.stringContaining('unsupported') })
  })
})
