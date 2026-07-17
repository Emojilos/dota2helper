/**
 * Read-through кэш матчапов поверх matchup_cache (TASK-022) и STRATZ-клиента
 * (TASK-021): TASK-023. Свежая (< TTL) запись отдаётся из SQLite без сети;
 * протухшая/отсутствующая — подтягивается из STRATZ, кэш перезаписывается
 * группой (все vs/with-записи героя для данного patch/rankBracket пишутся и
 * читаются как один снимок — так их и возвращает STRATZ-запрос). Результат
 * всегда помечен {source, fetchedAt, stale} (INV5); при недоступном STRATZ
 * отдаётся протухший кэш с stale=true, а не exception — деградация до
 * OpenDota/«нет данных» дальше по цепочке (TASK-024/026) решает вызывающая
 * сторона DataService-фасада.
 */
import { MatchupDataSchema, type MatchupData } from '@shared/schemas/stratzDto'
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DatabaseInstance } from '../db/openDatabase'

/** Узкий срез StratzClient, нужный этому репозиторию — не тянет весь класс, легко подменяется в тестах. */
export interface MatchupDataSource {
  getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<MatchupData[]>
}

export interface MatchupQueryResult {
  data: MatchupData[]
  source: 'cache' | 'stratz'
  fetchedAt: string
  stale: boolean
}

export interface MatchupRepositoryOptions {
  /** TTL кэша в мс (дефолт 24ч, раздел 5.1 PRD). */
  ttlMs?: number
  /** Источник текущего времени — подменяется в тестах для проверки протухания. */
  now?: () => number
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

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

export class MatchupRepository {
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(
    private readonly db: DatabaseInstance,
    private readonly stratzClient: MatchupDataSource | null,
    options: MatchupRepositoryOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? Date.now
  }

  /** Возвращает все vs/with-матчапы героя для данного patch/rankBracket, читая через кэш. */
  async getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<MatchupQueryResult> {
    const cached = this.readCachedGroup(heroId, scope)
    if (cached && this.isFresh(cached.fetchedAt)) {
      return { data: cached.rows, source: 'cache', fetchedAt: cached.fetchedAt, stale: false }
    }

    if (this.stratzClient) {
      try {
        const fresh = await this.stratzClient.getHeroMatchups(heroId, scope)
        const fetchedAt = new Date(this.now()).toISOString()
        this.writeCachedGroup(heroId, scope, fresh, fetchedAt)
        return { data: fresh, source: 'stratz', fetchedAt, stale: false }
      } catch (error) {
        if (cached) {
          return { data: cached.rows, source: 'cache', fetchedAt: cached.fetchedAt, stale: true }
        }
        throw error
      }
    }

    if (cached) {
      return { data: cached.rows, source: 'cache', fetchedAt: cached.fetchedAt, stale: true }
    }

    throw new Error(`No matchup data available for hero ${heroId} (STRATZ unavailable, no cache)`)
  }

  private isFresh(fetchedAtIso: string): boolean {
    return this.now() - Date.parse(fetchedAtIso) < this.ttlMs
  }

  private readCachedGroup(
    heroId: number,
    scope: StratzQueryScope
  ): { rows: MatchupData[]; fetchedAt: string } | null {
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

  private writeCachedGroup(
    heroId: number,
    scope: StratzQueryScope,
    matchups: MatchupData[],
    fetchedAt: string
  ): void {
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
