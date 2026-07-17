/**
 * Тесты MatchupRepository (TASK-023): read-through кэш матчапов с TTL 24ч
 * поверх matchup_cache (TASK-022) и STRATZ-клиента (узкий MatchupDataSource,
 * TASK-021). Фейковый источник вместо реального StratzClient — считает вызовы
 * и подменяет время через опцию `now`.
 */
import { describe, expect, it, vi } from 'vitest'
import { openDatabase, runMigrations } from '@main/db'
import { MatchupRepository, type MatchupDataSource } from '@main/data/MatchupRepository'
import type { MatchupData } from '@shared/schemas/stratzDto'

const SCOPE = { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

function fakeMatchups(heroId: number): MatchupData[] {
  return [
    { heroId, otherHeroId: 11, relation: 'vs', winrate: 0.52, sampleSize: 300, ...SCOPE },
    { heroId, otherHeroId: 22, relation: 'with', winrate: 0.58, sampleSize: 150, ...SCOPE }
  ]
}

function fakeSource(heroId: number): { source: MatchupDataSource; calls: number[] } {
  const calls: number[] = []
  const source: MatchupDataSource = {
    getHeroMatchups: vi.fn(async (id: number) => {
      calls.push(id)
      return fakeMatchups(heroId)
    })
  }
  return { source, calls }
}

describe('TASK-023: MatchupRepository', () => {
  it('fetches from STRATZ on first request and caches the result (source=stratz)', async () => {
    const db = createDb()
    const { source } = fakeSource(1)
    const repo = new MatchupRepository(db, source)

    const result = await repo.getHeroMatchups(1, SCOPE)

    expect(result.source).toBe('stratz')
    expect(result.stale).toBe(false)
    expect(result.data).toHaveLength(2)
    expect(source.getHeroMatchups).toHaveBeenCalledTimes(1)

    const row = db
      .prepare<[number], { hero_id: number }>('SELECT hero_id FROM matchup_cache WHERE hero_id = ?')
      .get(1)
    expect(row?.hero_id).toBe(1)
    db.close()
  })

  it('returns the cached result without hitting STRATZ on an immediate repeat request', async () => {
    const db = createDb()
    const { source } = fakeSource(1)
    const repo = new MatchupRepository(db, source)

    await repo.getHeroMatchups(1, SCOPE)
    const second = await repo.getHeroMatchups(1, SCOPE)

    expect(second.source).toBe('cache')
    expect(second.stale).toBe(false)
    expect(second.data).toHaveLength(2)
    expect(source.getHeroMatchups).toHaveBeenCalledTimes(1)
    db.close()
  })

  it('refetches from STRATZ once the cached entry is older than the TTL', async () => {
    const db = createDb()
    const { source } = fakeSource(1)
    let currentTime = 0
    const repo = new MatchupRepository(db, source, { ttlMs: 24 * 60 * 60 * 1000, now: () => currentTime })

    await repo.getHeroMatchups(1, SCOPE)
    currentTime = 24 * 60 * 60 * 1000 + 1
    const result = await repo.getHeroMatchups(1, SCOPE)

    expect(result.source).toBe('stratz')
    expect(result.stale).toBe(false)
    expect(source.getHeroMatchups).toHaveBeenCalledTimes(2)
    db.close()
  })

  it('serves stale cache (stale=true) when STRATZ is unavailable (client=null) and cache exists', async () => {
    const db = createDb()
    const { source } = fakeSource(1)
    let currentTime = 0
    const seedRepo = new MatchupRepository(db, source, { now: () => currentTime })
    await seedRepo.getHeroMatchups(1, SCOPE)

    currentTime = 24 * 60 * 60 * 1000 + 1
    const offlineRepo = new MatchupRepository(db, null, { now: () => currentTime })
    const result = await offlineRepo.getHeroMatchups(1, SCOPE)

    expect(result.source).toBe('cache')
    expect(result.stale).toBe(true)
    expect(result.data).toHaveLength(2)
    db.close()
  })

  it('serves stale cache (stale=true) when the STRATZ request throws and a stale entry exists', async () => {
    const db = createDb()
    let currentTime = 0
    const seedSource: MatchupDataSource = { getHeroMatchups: async () => fakeMatchups(1) }
    const seedRepo = new MatchupRepository(db, seedSource, { now: () => currentTime })
    await seedRepo.getHeroMatchups(1, SCOPE)

    currentTime = 24 * 60 * 60 * 1000 + 1
    const failingSource: MatchupDataSource = {
      getHeroMatchups: async () => {
        throw new Error('STRATZ down')
      }
    }
    const repo = new MatchupRepository(db, failingSource, { now: () => currentTime })
    const result = await repo.getHeroMatchups(1, SCOPE)

    expect(result.source).toBe('cache')
    expect(result.stale).toBe(true)
    db.close()
  })

  it('throws a descriptive error when there is no cache and STRATZ is unavailable', async () => {
    const db = createDb()
    const repo = new MatchupRepository(db, null)

    await expect(repo.getHeroMatchups(1, SCOPE)).rejects.toThrow('No matchup data available')
    db.close()
  })
})
