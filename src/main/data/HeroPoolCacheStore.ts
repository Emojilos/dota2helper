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
import { HeroPoolEntrySchema, type HeroPoolEntry, type MatchResult } from '@shared/schemas/stratzDto'
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

  /**
   * Точечно освежает ОДНУ строку пула по итогам локально сыгранного матча
   * (TASK-033, MatchCompletionDetector) — в отличие от write(), не трогает
   * остальные строки группы steamId: следующий полный STRATZ/OpenDota-синк
   * (write()) по-прежнему стирает и переписывает весь снимок целиком.
   */
  applyMatchResult(steamId: string, heroId: number, result: MatchResult, syncedAt: string): void {
    const existing = this.db
      .prepare<[string, number], HeroPoolCacheRow>(
        `SELECT hero_id, matches_count, winrate, last_synced
         FROM hero_pool_stats
         WHERE steam_id = ? AND hero_id = ?`
      )
      .get(steamId, heroId)

    const won = result === 'win' ? 1 : 0
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO hero_pool_stats (steam_id, hero_id, matches_count, winrate, last_synced)
           VALUES (?, ?, 1, ?, ?)`
        )
        .run(steamId, heroId, won, syncedAt)
      return
    }

    const matchesCount = existing.matches_count + 1
    const winrate = (existing.winrate * existing.matches_count + won) / matchesCount
    this.db
      .prepare(
        `UPDATE hero_pool_stats SET matches_count = ?, winrate = ?, last_synced = ?
         WHERE steam_id = ? AND hero_id = ?`
      )
      .run(matchesCount, winrate, syncedAt, steamId, heroId)
  }
}
