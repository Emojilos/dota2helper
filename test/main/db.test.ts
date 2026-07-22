/**
 * Тесты БД (TASK-010, TASK-022): миграции идемпотентны, UserProfileRepository
 * читает/пишет профиль, при отсутствии создаёт дефолтный; кэш-таблицы
 * (MatchupCache/HeroPoolStats/MatchHistory) созданы с ожидаемыми индексами.
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
    expect(applied).toHaveLength(7)
    db.close()
  })

  it('creates matchup_cache, hero_pool_stats and match_history tables', () => {
    const db = createDb()
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('matchup_cache', 'hero_pool_stats', 'match_history')"
      )
      .all()
      .map((row) => row.name)
      .sort()
    expect(tables).toEqual(['hero_pool_stats', 'match_history', 'matchup_cache'])
    db.close()
  })
})

describe('data cache schema (TASK-022)', () => {
  it('supports composite-key lookup on matchup_cache (hero_id, other_hero_id, relation, patch, rank_bracket)', () => {
    const db = createDb()
    db.prepare(
      `INSERT INTO matchup_cache (hero_id, other_hero_id, relation, winrate, sample_size, patch, rank_bracket, builds, fetched_at)
       VALUES (@heroId, @otherHeroId, @relation, @winrate, @sampleSize, @patch, @rankBracket, @builds, @fetchedAt)`
    ).run({
      heroId: 1,
      otherHeroId: 2,
      relation: 'vs',
      winrate: 0.55,
      sampleSize: 1200,
      patch: '7.39',
      rankBracket: 'archon_ancient',
      builds: JSON.stringify({ skillBuild: [1, 2, 3] }),
      fetchedAt: new Date().toISOString()
    })

    const row = db
      .prepare<
        [number, number, string, string, string],
        { winrate: number; sample_size: number }
      >(
        `SELECT winrate, sample_size FROM matchup_cache
         WHERE hero_id = ? AND other_hero_id = ? AND relation = ? AND patch = ? AND rank_bracket = ?`
      )
      .get(1, 2, 'vs', '7.39', 'archon_ancient')

    expect(row?.winrate).toBe(0.55)
    expect(row?.sample_size).toBe(1200)

    const explain = db
      .prepare<[], { detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT * FROM matchup_cache
         WHERE hero_id = 1 AND other_hero_id = 2 AND relation = 'vs' AND patch = '7.39' AND rank_bracket = 'archon_ancient'`
      )
      .all()
      .map((r) => r.detail)
      .join(' ')
    expect(explain.toUpperCase()).toContain('USING INDEX')
    db.close()
  })

  it('allows inserting hero_pool_stats keyed by (steam_id, hero_id)', () => {
    const db = createDb()
    db.prepare(
      'INSERT INTO hero_pool_stats (steam_id, hero_id, matches_count, winrate, last_synced) VALUES (?, ?, ?, ?, ?)'
    ).run('76561198000000000', 1, 42, 0.6, new Date().toISOString())

    const row = db
      .prepare<[string, number], { matches_count: number }>(
        'SELECT matches_count FROM hero_pool_stats WHERE steam_id = ? AND hero_id = ?'
      )
      .get('76561198000000000', 1)
    expect(row?.matches_count).toBe(42)
    db.close()
  })

  it('allows inserting match_history with a nullable enemy_mid_hero_id', () => {
    const db = createDb()
    db.prepare(
      'INSERT INTO match_history (match_id, hero_id, enemy_mid_hero_id, result, kda, played_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('7000000001', 1, null, 'win', JSON.stringify({ kills: 10, deaths: 2, assists: 8 }), new Date().toISOString())

    const row = db
      .prepare<[string], { enemy_mid_hero_id: number | null; result: string }>(
        'SELECT enemy_mid_hero_id, result FROM match_history WHERE match_id = ?'
      )
      .get('7000000001')
    expect(row?.enemy_mid_hero_id).toBeNull()
    expect(row?.result).toBe('win')
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
    expect(profile.hotkeySilentMode).toBe('F10')
    expect(profile.hotkeyClickThroughToggle).toBe('F8')
    expect(profile.draftRankingMode).toBe('meta')
    expect(profile.steamId).toBeNull()
    expect(profile.autoLaunch).toBe(false)
    expect(profile.createdAt).toBe(profile.updatedAt)
    db.close()
  })

  it('update() round-trips autoLaunch (TASK-046)', () => {
    const db = createDb()
    const repo = new UserProfileRepository(db)
    repo.getOrCreate()

    const updated = repo.update({ autoLaunch: true })
    expect(updated.autoLaunch).toBe(true)

    const reread = repo.getOrCreate()
    expect(reread.autoLaunch).toBe(true)
    db.close()
  })

  it('update() round-trips hotkeyClickThroughToggle (TASK-008)', () => {
    const db = createDb()
    const repo = new UserProfileRepository(db)
    repo.getOrCreate()

    const updated = repo.update({ hotkeyClickThroughToggle: 'F7' })
    expect(updated.hotkeyClickThroughToggle).toBe('F7')

    const reread = repo.getOrCreate()
    expect(reread.hotkeyClickThroughToggle).toBe('F7')
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
