/**
 * Тесты BuildCacheStore (TASK-047, миграция 0004_build_cache_and_app_state) —
 * тот же приём, что matchupCacheStore/heroPoolCacheStore: реальная in-memory
 * better-sqlite3 БД с прогнанными миграциями. Отдельно проверяет сентинел
 * NO_VS_HERO (vsHeroId=undefined хранится отдельно от любого конкретного
 * vsHeroId, а не как NULL).
 */
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '@main/db'
import { BuildCacheStore } from '@main/data/BuildCacheStore'
import type { BuildData } from '@shared/schemas/stratzDto'

const SCOPE = { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

function builds(heroId: number, vsHeroId: number | null): BuildData[] {
  return [
    {
      heroId,
      vsHeroId,
      skillBuild: [5059, 5059, 5058],
      startingItems: [44, 44, 34],
      winrate: 0.55,
      sampleSize: 100,
      patch: SCOPE.patch
    }
  ]
}

describe('BuildCacheStore', () => {
  it('returns null for a group that was never cached', () => {
    const db = createDb()
    const store = new BuildCacheStore(db)

    expect(store.read(1, SCOPE)).toBeNull()
    db.close()
  })

  it('writes and reads back a build group with a specific vsHeroId', () => {
    const db = createDb()
    const store = new BuildCacheStore(db)
    const fetchedAt = '2026-07-18T00:00:00.000Z'

    store.write(1, SCOPE, 11, builds(1, 11), fetchedAt)
    const result = store.read(1, SCOPE, 11)

    expect(result?.fetchedAt).toBe(fetchedAt)
    expect(result?.rows).toEqual(builds(1, 11))
    db.close()
  })

  it('writes and reads back a build group with vsHeroId=undefined (NO_VS_HERO sentinel), isolated from a specific vsHeroId', () => {
    const db = createDb()
    const store = new BuildCacheStore(db)
    const fetchedAt = '2026-07-18T00:00:00.000Z'

    store.write(1, SCOPE, undefined, builds(1, null), fetchedAt)
    store.write(1, SCOPE, 11, builds(1, 11), fetchedAt)

    expect(store.read(1, SCOPE)?.rows).toEqual(builds(1, null))
    expect(store.read(1, SCOPE, 11)?.rows).toEqual(builds(1, 11))
    db.close()
  })

  it('write() atomically replaces the group rather than appending to it', () => {
    const db = createDb()
    const store = new BuildCacheStore(db)

    store.write(1, SCOPE, 11, builds(1, 11), '2026-07-18T00:00:00.000Z')
    store.write(1, SCOPE, 11, builds(1, 11), '2026-07-19T00:00:00.000Z')

    const result = store.read(1, SCOPE, 11)
    expect(result?.rows).toHaveLength(1)
    expect(result?.fetchedAt).toBe('2026-07-19T00:00:00.000Z')
    db.close()
  })
})
