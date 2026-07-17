/**
 * Хранилище matchup_cache (TASK-022), выделенное из MatchupRepository (TASK-023)
 * при сборке DataService-фасада (TASK-026): только чтение/запись SQLite, без
 * сетевой логики и выбора источника — этим владеет DataService. Группа =
 * все vs/with-строки героя для данного (patch, rankBracket), пишутся и читаются
 * атомарно как один снимок (так их и возвращает STRATZ-запрос).
 */
import { MatchupDataSchema, type MatchupData } from '@shared/schemas/stratzDto'
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DatabaseInstance } from '../db/openDatabase'

export interface MatchupCacheGroup {
  rows: MatchupData[]
  fetchedAt: string
}

interface MatchupCacheRow {
  hero_id: number
  other_hero_id: number
  relation: string
  winrate: number
  sample_size: number
  patch: string
  rank_bracket: string
  fetched_at: string
}

function rowToMatchupData(row: MatchupCacheRow): MatchupData {
  return MatchupDataSchema.parse({
    heroId: row.hero_id,
    otherHeroId: row.other_hero_id,
    relation: row.relation,
    winrate: row.winrate,
    sampleSize: row.sample_size,
    patch: row.patch,
    rankBracket: row.rank_bracket
  })
}

export class MatchupCacheStore {
  constructor(private readonly db: DatabaseInstance) {}

  read(heroId: number, scope: StratzQueryScope): MatchupCacheGroup | null {
    const rows = this.db
      .prepare<[number, string, string], MatchupCacheRow>(
        `SELECT hero_id, other_hero_id, relation, winrate, sample_size, patch, rank_bracket, fetched_at
         FROM matchup_cache
         WHERE hero_id = ? AND patch = ? AND rank_bracket = ?`
      )
      .all(heroId, scope.patch, scope.rankBracket)

    const [first] = rows
    if (!first) {
      return null
    }
    return { rows: rows.map(rowToMatchupData), fetchedAt: first.fetched_at }
  }

  /** Атомарно заменяет всю группу (heroId, patch, rankBracket) новым снимком. */
  write(heroId: number, scope: StratzQueryScope, matchups: MatchupData[], fetchedAt: string): void {
    const deleteStmt = this.db.prepare(
      'DELETE FROM matchup_cache WHERE hero_id = ? AND patch = ? AND rank_bracket = ?'
    )
    const insertStmt = this.db.prepare(
      `INSERT INTO matchup_cache
        (hero_id, other_hero_id, relation, winrate, sample_size, patch, rank_bracket, builds, fetched_at)
       VALUES (@heroId, @otherHeroId, @relation, @winrate, @sampleSize, @patch, @rankBracket, @builds, @fetchedAt)`
    )

    this.db.transaction(() => {
      deleteStmt.run(heroId, scope.patch, scope.rankBracket)
      for (const matchup of matchups) {
        insertStmt.run({
          heroId: matchup.heroId,
          otherHeroId: matchup.otherHeroId,
          relation: matchup.relation,
          winrate: matchup.winrate,
          sampleSize: matchup.sampleSize,
          patch: matchup.patch,
          rankBracket: matchup.rankBracket,
          builds: '[]',
          fetchedAt
        })
      }
    })()
  }
}
