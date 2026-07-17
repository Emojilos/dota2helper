/**
 * Чистые мапперы: сырые ответы OpenDota REST (../types/opendota) → внутренние
 * DTO (../schemas/stratzDto) — те же DTO, к которым приводит STRATZ (TASK-020),
 * потребители (кэш/фасад/скоринг) не знают источника (INV5).
 *
 * ВАЖНО: OpenDota /heroes/{id}/matchups отдаёт ТОЛЬКО контрпик-статистику (vs) —
 * synergy (with) там нет, в отличие от STRATZ heroVsHeroMatchup. Это известное
 * ограничение fallback-источника — неполный набор relation лучше отсутствия
 * данных вовсе. Эндпоинт также не фильтрует по patch/rankBracket — запрошенный
 * scope проставляется в DTO как метка контекста, а не как реальный фильтр
 * источника (в отличие от STRATZ, где scope — реальные переменные запроса).
 *
 * INV2: модуль чист — только zod (через реэкспортированные схемы) и типы, без
 * electron / react / fs / сети / Date.now().
 */
import { HeroPoolEntrySchema, MatchupDataSchema, type HeroPoolEntry, type MatchupData } from '../schemas/stratzDto'
import type { StratzQueryScope } from '../types/stratz'
import type { OpenDotaHeroMatchupsResponse, OpenDotaPlayerHeroesResponse } from '../types/opendota'

/** games=0 → винрейт неопределён; трактуем как 0, а не NaN/Infinity (тот же приём, что и в STRATZ-маппере). */
function safeWinrate(wins: number, games: number): number {
  return games > 0 ? wins / games : 0
}

/** Приводит ответ /heroes/{id}/matchups к списку MatchupData (только relation='vs'). */
export function mapOpenDotaHeroMatchupsToDto(
  heroId: number,
  response: OpenDotaHeroMatchupsResponse,
  scope: StratzQueryScope
): MatchupData[] {
  return response.map((entry) =>
    MatchupDataSchema.parse({
      heroId,
      otherHeroId: entry.hero_id,
      relation: 'vs',
      winrate: safeWinrate(entry.wins, entry.games_played),
      sampleSize: entry.games_played,
      patch: scope.patch,
      rankBracket: scope.rankBracket
    })
  )
}

/** Приводит ответ /players/{account_id}/heroes к HeroPoolStats-совместимому списку. */
export function mapOpenDotaHeroPoolToDto(response: OpenDotaPlayerHeroesResponse): HeroPoolEntry[] {
  return response.map((entry) =>
    HeroPoolEntrySchema.parse({
      heroId: entry.hero_id,
      matchesCount: entry.games,
      winrate: safeWinrate(entry.win, entry.games),
      /** OpenDota отдаёт last_played в unix-секундах. */
      lastSyncedAtMs: entry.last_played * 1000
    })
  )
}
