/**
 * Тесты DataService-фасада (TASK-026): полная лестница деградации INV5
 * (STRATZ → OpenDota → SQLite stale-кэш → явное "нет данных") для матчапов,
 * и укороченные лестницы (без выделенного кэша) для пула героев/билдов/истории
 * матчей. Фейковые источники вместо реальных Stratz/OpenDota-клиентов — считают
 * вызовы и позволяют детерминированно смоделировать отказ/таймаут (тот же приём,
 * что в бывшем matchupRepository.test.ts, TASK-023).
 */
import { describe, expect, it, vi } from 'vitest'
import { openDatabase, runMigrations } from '@main/db'
import { MatchupCacheStore } from '@main/data/MatchupCacheStore'
import { DataService, type OpenDotaDataSource, type StratzDataSource } from '@main/data/DataService'
import type { HeroPoolEntry, MatchupData } from '@shared/schemas/stratzDto'

const SCOPE = { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

function stratzMatchups(heroId: number): MatchupData[] {
  return [
    { heroId, otherHeroId: 11, relation: 'vs', winrate: 0.52, sampleSize: 300, ...SCOPE },
    { heroId, otherHeroId: 22, relation: 'with', winrate: 0.58, sampleSize: 150, ...SCOPE }
  ]
}

function openDotaMatchups(heroId: number): MatchupData[] {
  // OpenDota отдаёт только 'vs' — ограничение задокументировано в OpenDotaClient/mapOpenDotaToDto (TASK-024).
  return [{ heroId, otherHeroId: 11, relation: 'vs', winrate: 0.49, sampleSize: 900, ...SCOPE }]
}

function failingStratz(): StratzDataSource {
  return {
    getHeroMatchups: async () => {
      throw new Error('STRATZ down')
    },
    getHeroPool: async () => {
      throw new Error('STRATZ down')
    },
    getHeroBuilds: async () => {
      throw new Error('STRATZ down')
    },
    getRecentMatches: async () => {
      throw new Error('STRATZ down')
    }
  }
}

function fakeStratz(heroId: number): { source: StratzDataSource; calls: { count: number } } {
  const calls = { count: 0 }
  const source: StratzDataSource = {
    getHeroMatchups: async () => {
      calls.count++
      return stratzMatchups(heroId)
    },
    getHeroPool: async () => [],
    getHeroBuilds: async () => [],
    getRecentMatches: async () => []
  }
  return { source, calls }
}

function fakeOpenDota(heroId: number): { source: OpenDotaDataSource; calls: number[] } {
  const calls: number[] = []
  const source: OpenDotaDataSource = {
    getHeroMatchups: vi.fn(async (id: number) => {
      calls.push(id)
      return openDotaMatchups(heroId)
    }),
    getHeroPool: async () => []
  }
  return { source, calls }
}

describe('TASK-026: DataService — getHeroMatchups degradation ladder', () => {
  it('returns fresh STRATZ data and caches it (source=stratz)', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const { source } = fakeStratz(1)
    const service = new DataService(cache, source, null)

    const result = await service.getHeroMatchups(1, SCOPE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.source).toBe('stratz')
    expect(result.stale).toBe(false)
    expect(result.data).toHaveLength(2)

    const row = db
      .prepare<[number], { hero_id: number }>('SELECT hero_id FROM matchup_cache WHERE hero_id = ?')
      .get(1)
    expect(row?.hero_id).toBe(1)
    db.close()
  })

  it('returns the cached result without hitting STRATZ on an immediate repeat request', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const stratzSource = fakeStratz(1)
    const service = new DataService(cache, stratzSource.source, null)

    await service.getHeroMatchups(1, SCOPE)
    const second = await service.getHeroMatchups(1, SCOPE)

    expect(second.status).toBe('ok')
    if (second.status !== 'ok') throw new Error('unreachable')
    expect(second.source).toBe('cache')
    expect(second.stale).toBe(false)
    expect(stratzSource.calls.count).toBe(1)
    db.close()
  })

  it('falls back to OpenDota (source=opendota) when STRATZ is unavailable, without caching the vs-only result', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const { source: openDotaSource, calls } = fakeOpenDota(1)
    const service = new DataService(cache, null, openDotaSource)

    const result = await service.getHeroMatchups(1, SCOPE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.source).toBe('opendota')
    expect(result.stale).toBe(false)
    expect(result.coverage).toEqual({ relations: ['vs'] })
    expect(calls).toEqual([1])

    // OpenDota-результат НЕ должен попасть в matchup_cache (см. заголовок DataService.ts).
    const row = db
      .prepare<[number], { hero_id: number }>('SELECT hero_id FROM matchup_cache WHERE hero_id = ?')
      .get(1)
    expect(row).toBeUndefined()
    db.close()
  })

  it('falls back to OpenDota when the STRATZ request throws', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const { source: openDotaSource } = fakeOpenDota(1)
    const service = new DataService(cache, failingStratz(), openDotaSource)

    const result = await service.getHeroMatchups(1, SCOPE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.source).toBe('opendota')
    db.close()
  })

  it('serves stale cache (stale=true) when both STRATZ and OpenDota are unavailable', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const stratzSource = fakeStratz(1)
    let currentTime = 0
    const seedService = new DataService(cache, stratzSource.source, null, { now: () => currentTime })
    await seedService.getHeroMatchups(1, SCOPE)

    currentTime = 24 * 60 * 60 * 1000 + 1
    const offlineService = new DataService(cache, failingStratz(), null, { now: () => currentTime })
    const result = await offlineService.getHeroMatchups(1, SCOPE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.source).toBe('cache')
    expect(result.stale).toBe(true)
    expect(result.data).toHaveLength(2)
    db.close()
  })

  it('refetches from STRATZ once the cached entry is older than the TTL', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const stratzSource = fakeStratz(1)
    let currentTime = 0
    const service = new DataService(cache, stratzSource.source, null, { now: () => currentTime })

    await service.getHeroMatchups(1, SCOPE)
    currentTime = 24 * 60 * 60 * 1000 + 1
    const result = await service.getHeroMatchups(1, SCOPE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.source).toBe('stratz')
    expect(stratzSource.calls.count).toBe(2)
    db.close()
  })

  it('returns an explicit "no-data" result (never throws) when STRATZ/OpenDota are unavailable and cache is empty', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const service = new DataService(cache, null, null)

    const result = await service.getHeroMatchups(1, SCOPE)

    expect(result.status).toBe('no-data')
    expect(result.source).toBe('none')
    expect(result.fetchedAt).toBeNull()
    expect(result.stale).toBe(true)
    if (result.status === 'no-data') {
      expect(result.reason).toContain('No matchup data available')
    }
    db.close()
  })
})

describe('TASK-026: DataService — hero pool / builds / recent matches (no dedicated cache)', () => {
  function heroPoolFixture(): HeroPoolEntry[] {
    return [{ heroId: 1, matchesCount: 42, winrate: 0.55, lastSyncedAtMs: 0 }]
  }

  it('getHeroPool prefers STRATZ, falls back to OpenDota, then no-data', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)

    const stratzOk: StratzDataSource = {
      ...failingStratz(),
      getHeroPool: async () => heroPoolFixture()
    }
    const stratzResult = await new DataService(cache, stratzOk, null).getHeroPool(123)
    expect(stratzResult.status).toBe('ok')
    if (stratzResult.status === 'ok') expect(stratzResult.source).toBe('stratz')

    const openDotaOk: OpenDotaDataSource = { getHeroMatchups: async () => [], getHeroPool: async () => heroPoolFixture() }
    const fallbackResult = await new DataService(cache, failingStratz(), openDotaOk).getHeroPool(123)
    expect(fallbackResult.status).toBe('ok')
    if (fallbackResult.status === 'ok') expect(fallbackResult.source).toBe('opendota')

    const noneResult = await new DataService(cache, null, null).getHeroPool(123)
    expect(noneResult.status).toBe('no-data')
    db.close()
  })

  it('getHeroBuilds and getRecentMatches use STRATZ only and degrade straight to no-data', async () => {
    const db = createDb()
    const cache = new MatchupCacheStore(db)
    const service = new DataService(cache, null, null)

    const builds = await service.getHeroBuilds(1, SCOPE)
    expect(builds.status).toBe('no-data')

    const matches = await service.getRecentMatches(123, 5)
    expect(matches.status).toBe('no-data')
    db.close()
  })
})
