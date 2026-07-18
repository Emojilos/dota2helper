import { describe, expect, it } from 'vitest'
import { parseSteamId64Input, steamId64ToAccountId } from '@shared/steam/parseSteamId64'

describe('parseSteamId64Input', () => {
  it('accepts a raw valid Steam64 ID', () => {
    expect(parseSteamId64Input('76561198012345678')).toEqual({
      ok: true,
      steamId: '76561198012345678'
    })
  })

  it('extracts the ID from a steamcommunity.com profile URL', () => {
    expect(parseSteamId64Input('https://steamcommunity.com/profiles/76561198012345678/')).toEqual({
      ok: true,
      steamId: '76561198012345678'
    })
  })

  it('trims surrounding whitespace', () => {
    expect(parseSteamId64Input('  76561198012345678  ')).toEqual({
      ok: true,
      steamId: '76561198012345678'
    })
  })

  it('rejects an empty input', () => {
    expect(parseSteamId64Input('   ')).toEqual({ ok: false, error: 'empty' })
  })

  it('rejects non-numeric input (e.g. a vanity URL)', () => {
    expect(parseSteamId64Input('https://steamcommunity.com/id/someVanityName')).toEqual({
      ok: false,
      error: 'not-a-number'
    })
  })

  it('rejects an ID below the individual-account range', () => {
    expect(parseSteamId64Input('123')).toEqual({ ok: false, error: 'out-of-range' })
  })

  it('rejects an ID above the individual-account range', () => {
    expect(parseSteamId64Input('99999999999999999')).toEqual({ ok: false, error: 'out-of-range' })
  })
})

describe('steamId64ToAccountId', () => {
  it('subtracts the individual-account base to recover the 32-bit account id', () => {
    expect(steamId64ToAccountId('76561198012345678')).toBe(52079950)
  })

  it('returns 0 for the base ID itself', () => {
    expect(steamId64ToAccountId('76561197960265728')).toBe(0)
  })
})
