/**
 * Тесты AppStateStore (TASK-047, миграция 0004_build_cache_and_app_state) —
 * маленький key-value стор app_state, тот же приём, что остальные *CacheStore
 * тесты: реальная in-memory better-sqlite3 БД с прогнанными миграциями.
 */
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations, AppStateStore } from '@main/db'

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

describe('AppStateStore', () => {
  it('returns null for a key that was never set', () => {
    const db = createDb()
    const store = new AppStateStore(db)

    expect(store.get('lastSeenPatch')).toBeNull()
    db.close()
  })

  it('writes and reads back a value', () => {
    const db = createDb()
    const store = new AppStateStore(db)

    store.set('lastSeenPatch', '7.39')

    expect(store.get('lastSeenPatch')).toBe('7.39')
    db.close()
  })

  it('overwrites the existing value on repeated set() rather than erroring on the duplicate key', () => {
    const db = createDb()
    const store = new AppStateStore(db)

    store.set('lastSeenPatch', '7.39')
    store.set('lastSeenPatch', '7.40')

    expect(store.get('lastSeenPatch')).toBe('7.40')
    db.close()
  })

  it('keeps different keys isolated', () => {
    const db = createDb()
    const store = new AppStateStore(db)

    store.set('lastSeenPatch', '7.39')
    store.set('someOtherKey', 'value')

    expect(store.get('lastSeenPatch')).toBe('7.39')
    expect(store.get('someOtherKey')).toBe('value')
    db.close()
  })
})
