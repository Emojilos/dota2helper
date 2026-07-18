/**
 * Типы GraphQL-запросов/ответов STRATZ (https://api.stratz.com/graphql), которые
 * клиент TASK-021 будет отправлять, а мапперы src/shared/stratz приводить к
 * внутренним DTO (../schemas/stratzDto). Поля названы по публичной GraphQL-схеме
 * STRATZ (camelCase, как отдаёт сам API — в отличие от raw GSI, который snake_case).
 *
 * ВАЖНО: раскладка полей ниже — лучшее известное приближение к реальной схеме
 * STRATZ на момент написания (без живого токена/интроспекции). Точные имена
 * полей нужно сверить с реальным ответом API при подключении клиента в TASK-021
 * и поправить здесь + в мапперах (см. progress.txt).
 *
 * INV2: модуль чист — только типы, без electron / react / fs / сети.
 */

/** Общие переменные запросов, ограничивающие выборку по патчу/рангу. */
export interface StratzQueryScope {
  patch: string
  /** напр. "ARCHON_TO_ANCIENT" */
  rankBracket: string
}

// ---------------------------------------------------------------------------
// Матчапы героя (vs — контрпик, with — синергия)
// ---------------------------------------------------------------------------

export interface StratzHeroVsHeroMatchup {
  heroId2: number
  winCount: number
  matchCount: number
}

export interface StratzHeroWithHeroMatchup {
  heroId2: number
  winCount: number
  matchCount: number
}

export interface StratzHeroMatchupNode {
  heroId1: number
  vs: StratzHeroVsHeroMatchup[]
  with: StratzHeroWithHeroMatchup[]
}

export interface StratzHeroMatchupsResponse {
  heroStats: {
    heroVsHeroMatchup: StratzHeroMatchupNode[]
  }
}

export interface StratzHeroMatchupsQueryVariables extends StratzQueryScope {
  heroId: number
}

// ---------------------------------------------------------------------------
// Пул героев игрока
// ---------------------------------------------------------------------------

export interface StratzPlayerHeroPerformance {
  heroId: number
  matchCount: number
  winCount: number
  updatedDateTime: string
}

export interface StratzHeroPoolResponse {
  player: {
    steamAccountId: number
    heroesPerformance: StratzPlayerHeroPerformance[]
  }
}

export interface StratzHeroPoolQueryVariables {
  steamAccountId: number
}

// ---------------------------------------------------------------------------
// Билды (стартовая закупка + скиллбилд)
// ---------------------------------------------------------------------------

export interface StratzHeroBuild {
  heroId: number
  vsHeroId: number | null
  abilityIds: number[]
  startingItemIds: number[]
  winCount: number
  matchCount: number
}

export interface StratzHeroBuildsResponse {
  heroStats: {
    heroBuild: StratzHeroBuild[]
  }
}

export interface StratzHeroBuildsQueryVariables extends StratzQueryScope {
  heroId: number
  vsHeroId?: number
}

// ---------------------------------------------------------------------------
// Последние матчи игрока
// ---------------------------------------------------------------------------

export interface StratzPlayerMatch {
  matchId: number
  heroId: number
  /** heroId вражеского мидера, если определён; иначе null */
  enemyMidHeroId: number | null
  isVictory: boolean
  kills: number
  deaths: number
  assists: number
  endDateTime: number
}

export interface StratzRecentMatchesResponse {
  player: {
    steamAccountId: number
    matches: StratzPlayerMatch[]
  }
}

export interface StratzRecentMatchesQueryVariables {
  steamAccountId: number
  take: number
}

// ---------------------------------------------------------------------------
// Текущий патч (TASK-047) — для PatchWatcher: сверяет с content/meta-mid-heroes.json
// ---------------------------------------------------------------------------

export interface StratzGameVersion {
  name: string
  asOfDateTime: string
}

export interface StratzGameVersionResponse {
  constants: {
    gameVersions: StratzGameVersion[]
  }
}
