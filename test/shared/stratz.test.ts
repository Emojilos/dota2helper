import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  mapHeroBuildsToDto,
  mapHeroPoolToDto,
  mapHeroMatchupsToDto,
  mapRecentMatchesToDto
} from '@shared/stratz/mapStratzToDto'
import {
  MatchupDataSchema,
  HeroPoolEntrySchema,
  BuildDataSchema,
  MatchSummarySchema
} from '@shared/schemas/stratzDto'
import type {
  StratzHeroMatchupsResponse,
  StratzHeroPoolResponse,
  StratzHeroBuildsResponse,
  StratzRecentMatchesResponse
} from '@shared/types/stratz'

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, `../fixtures/stratz/${name}`), 'utf-8')) as T
}

describe('TASK-020: STRATZ response → internal DTO mappers', () => {
  it('maps heroVsHeroMatchup fixture to MatchupData[] (both vs and with)', () => {
    const fixture = loadFixture<StratzHeroMatchupsResponse>('heroMatchups.json')
    const dtos = mapHeroMatchupsToDto(fixture, { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' })

    expect(dtos).toHaveLength(3)
    dtos.forEach((dto) => expect(() => MatchupDataSchema.parse(dto)).not.toThrow())

    const vsAgainst11 = dtos.find((d) => d.relation === 'vs' && d.otherHeroId === 11)
    expect(vsAgainst11).toMatchObject({
      heroId: 1,
      otherHeroId: 11,
      relation: 'vs',
      winrate: 120 / 250,
      sampleSize: 250,
      patch: '7.39',
      rankBracket: 'ARCHON_TO_ANCIENT'
    })

    const withHero5 = dtos.find((d) => d.relation === 'with' && d.otherHeroId === 5)
    expect(withHero5).toMatchObject({ winrate: 60 / 100, sampleSize: 100 })

    // matchCount=0 → winrate=0, не NaN
    const zeroSample = dtos.find((d) => d.otherHeroId === 8)
    expect(zeroSample?.winrate).toBe(0)
  })

  it('maps heroesPerformance fixture to HeroPoolEntry[]', () => {
    const fixture = loadFixture<StratzHeroPoolResponse>('heroPool.json')
    const dtos = mapHeroPoolToDto(fixture)

    expect(dtos).toHaveLength(2)
    dtos.forEach((dto) => expect(() => HeroPoolEntrySchema.parse(dto)).not.toThrow())
    expect(dtos[0]).toMatchObject({ heroId: 1, matchesCount: 42, winrate: 25 / 42 })
    expect(dtos[0].lastSyncedAtMs).toBe(Date.parse('2026-07-01T12:00:00Z'))
  })

  it('maps heroBuild fixture to BuildData[]', () => {
    const fixture = loadFixture<StratzHeroBuildsResponse>('heroBuilds.json')
    const dtos = mapHeroBuildsToDto(fixture, '7.39')

    expect(dtos).toHaveLength(2)
    dtos.forEach((dto) => expect(() => BuildDataSchema.parse(dto)).not.toThrow())
    expect(dtos[0]).toMatchObject({
      heroId: 1,
      vsHeroId: 11,
      skillBuild: [5059, 5059, 5058, 5058, 5059, 5060, 5059, 5058, 5058],
      startingItems: [44, 44, 34, 42],
      winrate: 55 / 100,
      sampleSize: 100,
      patch: '7.39'
    })
    // matchCount=0 → winrate=0, не NaN; vsHeroId=null (билд вне матчапа)
    expect(dtos[1]).toMatchObject({ vsHeroId: null, winrate: 0, sampleSize: 0 })
  })

  it('maps player.matches fixture to MatchSummary[]', () => {
    const fixture = loadFixture<StratzRecentMatchesResponse>('recentMatches.json')
    const dtos = mapRecentMatchesToDto(fixture)

    expect(dtos).toHaveLength(2)
    dtos.forEach((dto) => expect(() => MatchSummarySchema.parse(dto)).not.toThrow())
    expect(dtos[0]).toMatchObject({
      matchId: '7412345678',
      heroId: 1,
      enemyMidHeroId: 11,
      result: 'win',
      kda: { kills: 8, deaths: 3, assists: 12 },
      playedAtMs: 1751500800 * 1000
    })
    // неизвестный вражеский мидер → null, результат loss
    expect(dtos[1]).toMatchObject({ enemyMidHeroId: null, result: 'loss' })
  })
})
