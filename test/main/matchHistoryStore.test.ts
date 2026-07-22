/**
 * Тесты MatchHistoryStore (TASK-033): чтение/запись match_history, тот же
 * приём, что heroPoolCacheStore.test.ts — реальная in-memory better-sqlite3
 * БД с прогнанными миграциями.
 */
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '@main/db'
import { MatchHistoryStore } from '@main/matchHistory/MatchHistoryStore'
import type { MatchSummary } from '@shared/schemas/stratzDto'

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

function summary(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: '7412345678',
    heroId: 74,
    enemyMidHeroId: 26,
    result: 'win',
    kda: { kills: 12, deaths: 3, assists: 9 },
    playedAtMs: Date.parse('2026-07-18T00:00:00.000Z'),
    ...overrides
  }
}

describe('MatchHistoryStore', () => {
  it('returns null for an unknown match', () => {
    const db = createDb()
    const store = new MatchHistoryStore(db)

    expect(store.read('does-not-exist')).toBeNull()
    db.close()
  })

  it('writes and reads back a match summary', () => {
    const db = createDb()
    const store = new MatchHistoryStore(db)

    store.write(summary())
    const result = store.read('7412345678')

    expect(result).toEqual(summary())
    db.close()
  })

  it('records enemyMidHeroId = null when the enemy mid is unknown, without erroring', () => {
    const db = createDb()
    const store = new MatchHistoryStore(db)

    store.write(summary({ enemyMidHeroId: null }))
    const result = store.read('7412345678')

    expect(result?.enemyMidHeroId).toBeNull()
    db.close()
  })

  it('updates the existing row instead of duplicating on repeated writes for the same match', () => {
    const db = createDb()
    const store = new MatchHistoryStore(db)

    store.write(summary({ result: 'win' }))
    store.write(summary({ result: 'loss', kda: { kills: 1, deaths: 10, assists: 0 } }))

    expect(store.listRecent(10)).toHaveLength(1)
    expect(store.read('7412345678')?.result).toBe('loss')
    db.close()
  })

  it('lists recent matches ordered by played_at descending', () => {
    const db = createDb()
    const store = new MatchHistoryStore(db)

    store.write(summary({ matchId: 'a', playedAtMs: Date.parse('2026-07-16T00:00:00.000Z') }))
    store.write(summary({ matchId: 'b', playedAtMs: Date.parse('2026-07-18T00:00:00.000Z') }))
    store.write(summary({ matchId: 'c', playedAtMs: Date.parse('2026-07-17T00:00:00.000Z') }))

    expect(store.listRecent(10).map((row) => row.matchId)).toEqual(['b', 'c', 'a'])
    db.close()
  })

  describe('personalMatchupRecord (TASK-037)', () => {
    it('returns sampleSize=0 for a pair never played', () => {
      const db = createDb()
      const store = new MatchHistoryStore(db)

      expect(store.personalMatchupRecord(74, 26)).toEqual({ wins: 0, losses: 0, sampleSize: 0 })
      db.close()
    })

    it('counts wins/losses only for the exact (heroId, enemyMidHeroId) pair', () => {
      const db = createDb()
      const store = new MatchHistoryStore(db)

      store.write(summary({ matchId: 'a', heroId: 74, enemyMidHeroId: 26, result: 'win' }))
      store.write(summary({ matchId: 'b', heroId: 74, enemyMidHeroId: 26, result: 'loss' }))
      store.write(summary({ matchId: 'c', heroId: 74, enemyMidHeroId: 26, result: 'win' }))
      // Другой герой — не должен попасть в счёт.
      store.write(summary({ matchId: 'd', heroId: 1, enemyMidHeroId: 26, result: 'win' }))
      // Тот же герой, другой вражеский мидер — тоже не должен попасть.
      store.write(summary({ matchId: 'e', heroId: 74, enemyMidHeroId: 99, result: 'win' }))

      expect(store.personalMatchupRecord(74, 26)).toEqual({ wins: 2, losses: 1, sampleSize: 3 })
      db.close()
    })
  })
})
