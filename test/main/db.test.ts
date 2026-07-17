/**
 * Тесты БД (TASK-010): миграции идемпотентны, UserProfileRepository
 * читает/пишет профиль, при отсутствии создаёт дефолтный.
 */
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations, UserProfileRepository } from '@main/db'

function createDb() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}

describe('migrations', () => {
  it('creates the user_profile table', () => {
    const db = createDb()
    const row = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profile'")
      .get()
    expect(row?.name).toBe('user_profile')
    db.close()
  })

  it('is idempotent — running twice does not throw or duplicate schema', () => {
    const db = createDb()
    expect(() => runMigrations(db)).not.toThrow()
    const applied = db.prepare<[], { id: string }>('SELECT id FROM schema_migrations').all()
    expect(applied).toHaveLength(1)
    db.close()
  })
})

describe('UserProfileRepository', () => {
  it('creates a default profile on first access', () => {
    const db = createDb()
    const repo = new UserProfileRepository(db)
    const profile = repo.getOrCreate()

    expect(profile.verbosity).toBe('experienced')
    expect(profile.hotkeyExpandedPanel).toBe('F9')
    expect(profile.draftRankingMode).toBe('meta')
    expect(profile.steamId).toBeNull()
    expect(profile.createdAt).toBe(profile.updatedAt)
    db.close()
  })

  it('persists the profile across repository instances (same db)', () => {
    const db = createDb()
    new UserProfileRepository(db).getOrCreate()

    const reopened = new UserProfileRepository(db).getOrCreate()
    expect(reopened.verbosity).toBe('experienced')
    db.close()
  })

  it('update() merges patch fields and bumps updatedAt', async () => {
    const db = createDb()
    const repo = new UserProfileRepository(db)
    const initial = repo.getOrCreate()

    await new Promise((resolve) => setTimeout(resolve, 5))
    const updated = repo.update({ steamId: '76561198000000000', silentMode: true })

    expect(updated.steamId).toBe('76561198000000000')
    expect(updated.silentMode).toBe(true)
    expect(updated.verbosity).toBe('experienced')
    expect(updated.updatedAt).not.toBe(initial.updatedAt)
    expect(updated.createdAt).toBe(initial.createdAt)

    const reread = repo.getOrCreate()
    expect(reread.steamId).toBe('76561198000000000')
    db.close()
  })

  it('update() round-trips JSON config fields', () => {
    const db = createDb()
    const repo = new UserProfileRepository(db)
    repo.getOrCreate()

    const updated = repo.update({ overlayPositions: { compactPanel: { x: 10, y: 20 } } })
    expect(updated.overlayPositions).toEqual({ compactPanel: { x: 10, y: 20 } })

    const reread = repo.getOrCreate()
    expect(reread.overlayPositions).toEqual({ compactPanel: { x: 10, y: 20 } })
    db.close()
  })
})
