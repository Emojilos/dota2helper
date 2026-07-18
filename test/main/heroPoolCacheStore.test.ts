/**
 * Тесты HeroPoolCacheStore (TASK-031): чтение/запись hero_pool_stats,
 * тот же приём, что matchupCacheStore.test.ts (TASK-026) — реальная
 * in-memory better-sqlite3 БД с прогнанными миграциями.
 */
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '@main/db'
import { HeroPoolCacheStore } from '@main/data/HeroPoolCacheStore'
import type { HeroPoolEntry } from '@shared/schemas/stratzDto'

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

function heroPool(): HeroPoolEntry[] {
  return [
    { heroId: 1, matchesCount: 42, winrate: 0.55, lastSyncedAtMs: 0 },
    { heroId: 2, matchesCount: 10, winrate: 0.4, lastSyncedAtMs: 0 }
  ]
}

describe('HeroPoolCacheStore', () => {
  it('returns null for a steamId with no cached rows', () => {
    const db = createDb()
    const store = new HeroPoolCacheStore(db)

    expect(store.read('123')).toBeNull()
    db.close()
  })

  it('writes and reads back the full hero pool for a steamId', () => {
    const db = createDb()
    const store = new HeroPoolCacheStore(db)
    const fetchedAt = '2026-07-18T00:00:00.000Z'

    store.write('123', heroPool(), fetchedAt)
    const result = store.read('123')

    expect(result?.fetchedAt).toBe(fetchedAt)
    expect(result?.rows).toHaveLength(2)
    expect(result?.rows.map((row) => row.heroId).sort()).toEqual([1, 2])
    db.close()
  })

  it('replaces the entire group on a second write — no duplicates, no leftovers', () => {
    const db = createDb()
    const store = new HeroPoolCacheStore(db)

    store.write('123', heroPool(), '2026-07-18T00:00:00.000Z')
    store.write('123', [{ heroId: 1, matchesCount: 99, winrate: 0.6, lastSyncedAtMs: 0 }], '2026-07-19T00:00:00.000Z')

    const result = store.read('123')
    expect(result?.rows).toHaveLength(1)
    expect(result?.rows[0]).toMatchObject({ heroId: 1, matchesCount: 99, winrate: 0.6 })
    expect(result?.fetchedAt).toBe('2026-07-19T00:00:00.000Z')
    db.close()
  })

  it('keeps hero pools for different steamIds isolated', () => {
    const db = createDb()
    const store = new HeroPoolCacheStore(db)

    store.write('111', heroPool(), '2026-07-18T00:00:00.000Z')
    store.write('222', [{ heroId: 3, matchesCount: 5, winrate: 0.5, lastSyncedAtMs: 0 }], '2026-07-18T00:00:00.000Z')

    expect(store.read('111')?.rows).toHaveLength(2)
    expect(store.read('222')?.rows).toHaveLength(1)
    db.close()
  })
})
