/**
 * Хранилище match_history (TASK-022/033), тот же приём, что HeroPoolCacheStore/
 * MatchupCacheStore: только чтение/запись SQLite, без сетевой логики. Ключ —
 * match_id (PRIMARY KEY в схеме, миграция 0002_data_cache), поэтому write()
 * идемпотентен: повторная запись того же матча обновляет строку, а не
 * дублирует её.
 */
import type { MatchSummary } from '@shared/schemas/stratzDto'
import type { PersonalMatchupRecord } from '@shared/schemas/lanePlan'
import type { DatabaseInstance } from '../db/openDatabase'

interface MatchHistoryRow {
  match_id: string
  hero_id: number
  enemy_mid_hero_id: number | null
  result: string
  kda: string
  played_at: string
}

function rowToMatchSummary(row: MatchHistoryRow): MatchSummary {
  return {
    matchId: row.match_id,
    heroId: row.hero_id,
    enemyMidHeroId: row.enemy_mid_hero_id,
    result: row.result as MatchSummary['result'],
    kda: JSON.parse(row.kda),
    playedAtMs: Date.parse(row.played_at)
  }
}

export class MatchHistoryStore {
  constructor(private readonly db: DatabaseInstance) {}

  /** Идемпотентная запись — ON CONFLICT(match_id) обновляет существующую строку вместо дубликата. */
  write(summary: MatchSummary): void {
    this.db
      .prepare(
        `INSERT INTO match_history (match_id, hero_id, enemy_mid_hero_id, result, kda, played_at)
         VALUES (@matchId, @heroId, @enemyMidHeroId, @result, @kda, @playedAt)
         ON CONFLICT(match_id) DO UPDATE SET
           hero_id = excluded.hero_id,
           enemy_mid_hero_id = excluded.enemy_mid_hero_id,
           result = excluded.result,
           kda = excluded.kda,
           played_at = excluded.played_at`
      )
      .run({
        matchId: summary.matchId,
        heroId: summary.heroId,
        enemyMidHeroId: summary.enemyMidHeroId,
        result: summary.result,
        kda: JSON.stringify(summary.kda),
        playedAt: new Date(summary.playedAtMs).toISOString()
      })
  }

  read(matchId: string): MatchSummary | null {
    const row = this.db
      .prepare<[string], MatchHistoryRow>('SELECT * FROM match_history WHERE match_id = ?')
      .get(matchId)
    return row ? rowToMatchSummary(row) : null
  }

  /** Последние N матчей по времени игры, самые свежие первыми. */
  listRecent(limit: number): MatchSummary[] {
    const rows = this.db
      .prepare<[number], MatchHistoryRow>('SELECT * FROM match_history ORDER BY played_at DESC LIMIT ?')
      .all(limit)
    return rows.map(rowToMatchSummary)
  }

  /**
   * Личная статистика конкретного матчапа (F2/F5, TASK-037): count побед/
   * поражений на герое heroId против вражеского мидера enemyHeroId — тот же
   * ключ (hero_id, enemy_mid_hero_id), что пишет TASK-033 при завершении
   * матча. sampleSize=0, если совпадений нет (нет привязанного Steam ID,
   * либо игрок никогда не играл этот матчап) — вызывающий (LanePlanBuilder)
   * решает, как это показать, не эта функция.
   */
  personalMatchupRecord(heroId: number, enemyHeroId: number): PersonalMatchupRecord {
    const rows = this.db
      .prepare<[number, number], { result: string }>(
        'SELECT result FROM match_history WHERE hero_id = ? AND enemy_mid_hero_id = ?'
      )
      .all(heroId, enemyHeroId)
    const wins = rows.filter((row) => row.result === 'win').length
    const losses = rows.filter((row) => row.result === 'loss').length
    return { wins, losses, sampleSize: rows.length }
  }
}
