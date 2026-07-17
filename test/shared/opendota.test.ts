import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mapOpenDotaHeroMatchupsToDto, mapOpenDotaHeroPoolToDto } from '@shared/opendota/mapOpenDotaToDto'
import type { OpenDotaHeroMatchupsResponse, OpenDotaPlayerHeroesResponse } from '@shared/types/opendota'

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, `../fixtures/opendota/${name}`), 'utf-8')) as T
}

describe('TASK-024: OpenDota → internal DTO mappers', () => {
  it('maps /heroes/{id}/matchups fixture to vs-only MatchupData[]', () => {
    const fixture = loadFixture<OpenDotaHeroMatchupsResponse>('heroMatchups.json')

    const dtos = mapOpenDotaHeroMatchupsToDto(1, fixture, { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' })

    expect(dtos).toHaveLength(2)
    expect(dtos.every((d) => d.relation === 'vs')).toBe(true)
    expect(dtos.find((d) => d.otherHeroId === 11)).toEqual({
      heroId: 1,
      otherHeroId: 11,
      relation: 'vs',
      winrate: 120 / 250,
      sampleSize: 250,
      patch: '7.39',
      rankBracket: 'ARCHON_TO_ANCIENT'
    })
  })

  it('treats zero games_played as winrate 0, not NaN/Infinity', () => {
    const dtos = mapOpenDotaHeroMatchupsToDto(1, [{ hero_id: 2, games_played: 0, wins: 0 }], {
      patch: '7.39',
      rankBracket: 'ANCIENT'
    })

    expect(dtos[0]?.winrate).toBe(0)
  })

  it('maps /players/{account_id}/heroes fixture to HeroPoolEntry[]', () => {
    const fixture = loadFixture<OpenDotaPlayerHeroesResponse>('playerHeroes.json')

    const dtos = mapOpenDotaHeroPoolToDto(fixture)

    expect(dtos).toHaveLength(2)
    expect(dtos[0]).toEqual({
      heroId: 1,
      matchesCount: 42,
      winrate: 21 / 42,
      lastSyncedAtMs: 1_700_000_000_000
    })
  })

  it('treats zero games as winrate 0 for hero pool entries too', () => {
    const dtos = mapOpenDotaHeroPoolToDto([{ hero_id: 3, last_played: 1700000000, games: 0, win: 0 }])

    expect(dtos[0]?.winrate).toBe(0)
  })
})
