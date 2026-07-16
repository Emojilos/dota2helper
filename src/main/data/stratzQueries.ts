/**
 * GraphQL-строки запросов к STRATZ (https://api.stratz.com/graphql), соответствующие
 * типам ответов в src/shared/types/stratz.ts. Как и там — раскладка полей является
 * лучшим известным приближением к реальной схеме (без живого токена/интроспекции на
 * момент написания); сверить и поправить при первом реальном обращении (см. progress.txt).
 */

export const HERO_MATCHUPS_QUERY = /* GraphQL */ `
  query HeroMatchups($heroId: Short!, $patch: String, $rankBracket: RankBracketEnum) {
    heroStats {
      heroVsHeroMatchup(heroId: $heroId, patch: $patch, rankBracket: $rankBracket) {
        heroId1
        vs {
          heroId2
          winCount
          matchCount
        }
        with {
          heroId2
          winCount
          matchCount
        }
      }
    }
  }
`

export const HERO_POOL_QUERY = /* GraphQL */ `
  query HeroPool($steamAccountId: Long!) {
    player(steamAccountId: $steamAccountId) {
      steamAccountId
      heroesPerformance {
        heroId
        matchCount
        winCount
        updatedDateTime
      }
    }
  }
`

export const HERO_BUILDS_QUERY = /* GraphQL */ `
  query HeroBuilds($heroId: Short!, $vsHeroId: Short, $patch: String, $rankBracket: RankBracketEnum) {
    heroStats {
      heroBuild(heroId: $heroId, vsHeroId: $vsHeroId, patch: $patch, rankBracket: $rankBracket) {
        heroId
        vsHeroId
        abilityIds
        startingItemIds
        winCount
        matchCount
      }
    }
  }
`

export const RECENT_MATCHES_QUERY = /* GraphQL */ `
  query RecentMatches($steamAccountId: Long!, $take: Int!) {
    player(steamAccountId: $steamAccountId) {
      steamAccountId
      matches(request: { take: $take }) {
        matchId
        heroId
        enemyMidHeroId
        isVictory
        kills
        deaths
        assists
        endDateTime
      }
    }
  }
`
