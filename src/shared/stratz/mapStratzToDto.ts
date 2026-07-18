/**
 * Чистые мапперы: сырые ответы STRATZ GraphQL (../types/stratz) → внутренние DTO
 * (../schemas/stratzDto), к которым же приводит и OpenDota-адаптер (TASK-024).
 * Каждый маппер валидирует результат Zod-схемой DTO — битая форма ответа STRATZ
 * бросает понятный ZodError, а не тихо протекает дальше по DataService (INV5).
 *
 * INV2: модуль чист — только zod и типы, без electron / react / fs / сети /
 * Date.now() (время берётся из полей самого ответа, не из "сейчас").
 */
import {
  BuildDataSchema,
  HeroPoolEntrySchema,
  MatchSummarySchema,
  MatchupDataSchema,
  type BuildData,
  type HeroPoolEntry,
  type MatchSummary,
  type MatchupData
} from '../schemas/stratzDto'
import type {
  StratzGameVersionResponse,
  StratzHeroBuildsResponse,
  StratzHeroMatchupsResponse,
  StratzHeroPoolResponse,
  StratzQueryScope,
  StratzRecentMatchesResponse
} from '../types/stratz'

/** matchCount=0 → винрейт неопределён; трактуем как 0, а не NaN/Infinity. */
function safeWinrate(winCount: number, matchCount: number): number {
  return matchCount > 0 ? winCount / matchCount : 0
}

/** Приводит ответ heroVsHeroMatchup к плоскому списку MatchupData (обе relation: vs и with). */
export function mapHeroMatchupsToDto(
  response: StratzHeroMatchupsResponse,
  scope: StratzQueryScope
): MatchupData[] {
  const result: MatchupData[] = []
  for (const node of response.heroStats.heroVsHeroMatchup) {
    for (const vs of node.vs) {
      result.push(
        MatchupDataSchema.parse({
          heroId: node.heroId1,
          otherHeroId: vs.heroId2,
          relation: 'vs',
          winrate: safeWinrate(vs.winCount, vs.matchCount),
          sampleSize: vs.matchCount,
          patch: scope.patch,
          rankBracket: scope.rankBracket
        })
      )
    }
    for (const withHero of node.with) {
      result.push(
        MatchupDataSchema.parse({
          heroId: node.heroId1,
          otherHeroId: withHero.heroId2,
          relation: 'with',
          winrate: safeWinrate(withHero.winCount, withHero.matchCount),
          sampleSize: withHero.matchCount,
          patch: scope.patch,
          rankBracket: scope.rankBracket
        })
      )
    }
  }
  return result
}

/** Приводит ответ player.heroesPerformance к HeroPoolStats-совместимому списку (без steamId — тот в контексте запроса). */
export function mapHeroPoolToDto(response: StratzHeroPoolResponse): HeroPoolEntry[] {
  return response.player.heroesPerformance.map((entry) =>
    HeroPoolEntrySchema.parse({
      heroId: entry.heroId,
      matchesCount: entry.matchCount,
      winrate: safeWinrate(entry.winCount, entry.matchCount),
      lastSyncedAtMs: Date.parse(entry.updatedDateTime)
    })
  )
}

/** Приводит ответ heroStats.heroBuild к списку BuildData (стартовая закупка + скиллбилд). */
export function mapHeroBuildsToDto(response: StratzHeroBuildsResponse, patch: string): BuildData[] {
  return response.heroStats.heroBuild.map((build) =>
    BuildDataSchema.parse({
      heroId: build.heroId,
      vsHeroId: build.vsHeroId,
      skillBuild: build.abilityIds,
      startingItems: build.startingItemIds,
      winrate: safeWinrate(build.winCount, build.matchCount),
      sampleSize: build.matchCount,
      patch
    })
  )
}

/**
 * Определяет "текущий" патч из списка gameVersions (TASK-047): элемент с
 * максимальным asOfDateTime, а не последний/первый по порядку ответа (STRATZ
 * не гарантирует сортировку — см. заголовок GAME_VERSION_QUERY). Пустой
 * список → null (PatchWatcher трактует это как "проверить не удалось").
 */
export function mapCurrentPatchToDto(response: StratzGameVersionResponse): string | null {
  const versions = response.constants.gameVersions
  if (versions.length === 0) {
    return null
  }
  return versions.reduce((latest, current) =>
    Date.parse(current.asOfDateTime) > Date.parse(latest.asOfDateTime) ? current : latest
  ).name
}

/** Приводит ответ player.matches к MatchHistory-совместимому списку MatchSummary. */
export function mapRecentMatchesToDto(response: StratzRecentMatchesResponse): MatchSummary[] {
  return response.player.matches.map((match) =>
    MatchSummarySchema.parse({
      matchId: String(match.matchId),
      heroId: match.heroId,
      enemyMidHeroId: match.enemyMidHeroId,
      result: match.isVictory ? 'win' : 'loss',
      kda: { kills: match.kills, deaths: match.deaths, assists: match.assists },
      /** STRATZ отдаёт endDateTime в unix-секундах */
      playedAtMs: match.endDateTime * 1000
    })
  )
}
