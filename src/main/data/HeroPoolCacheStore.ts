/**
 * Хранилище hero_pool_stats (TASK-022/031), тот же приём, что MatchupCacheStore
 * (TASK-026): только чтение/запись SQLite, без сетевой логики и выбора
 * источника — этим владеет DataService. В отличие от матчапов, пул героев не
 * группируется по (patch, rankBracket) — ключ ровно (steamId, heroId), где
 * steamId — это строковое представление того же steamAccountId, которым
 * DataService.getHeroPool зовёт STRATZ/OpenDota (32-bit account id, НЕ 64-bit
 * SteamID из UserProfile — конвертация 64→32 бит происходит на уровне вызова,
 * см. src/shared/steam/parseSteamId64.ts#steamId64ToAccountId).
 */
import { HeroPoolEntrySchema, type HeroPoolEntry } from '@shared/schemas/stratzDto'
import type { DatabaseInstance } from '../db/openDatabase'

export interface HeroPoolCacheGroup {
  rows: HeroPoolEntry[]
  fetchedAt: string
}

interface HeroPoolCacheRow {
  hero_id: number
  matches_count: number
  winrate: number
  last_synced: string
}

function rowToHeroPoolEntry(row: HeroPoolCacheRow): HeroPoolEntry {
  return HeroPoolEntrySchema.parse({
    heroId: row.hero_id,
    matchesCount: row.matches_count,
    winrate: row.winrate,
    lastSyncedAtMs: Date.parse(row.last_synced)
  })
}

export class HeroPoolCacheStore {
  constructor(private readonly db: DatabaseInstance) {}

  read(steamId: string): HeroPoolCacheGroup | null {
    const rows = this.db
      .prepare<[string], HeroPoolCacheRow>(
        `SELECT hero_id, matches_count, winrate, last_synced
         FROM hero_pool_stats
         WHERE steam_id = ?`
      )
      .all(steamId)

    const [first] = rows
    if (!first) {
      return null
    }
    return { rows: rows.map(rowToHeroPoolEntry), fetchedAt: first.last_synced }
  }

  /** Атомарно заменяет весь пул героев игрока новым снимком — повторный синк обновляет, а не дублирует. */
  write(steamId: string, entries: HeroPoolEntry[], fetchedAt: string): void {
    const deleteStmt = this.db.prepare('DELETE FROM hero_pool_stats WHERE steam_id = ?')
    const insertStmt = this.db.prepare(
      `INSERT INTO hero_pool_stats (steam_id, hero_id, matches_count, winrate, last_synced)
       VALUES (@steamId, @heroId, @matchesCount, @winrate, @lastSynced)`
    )

    this.db.transaction(() => {
      deleteStmt.run(steamId)
      for (const entry of entries) {
        insertStmt.run({
          steamId,
          heroId: entry.heroId,
          matchesCount: entry.matchesCount,
          winrate: entry.winrate,
          lastSynced: fetchedAt
        })
      }
    })()
  }
}
