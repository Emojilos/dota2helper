/**
 * Хранилище build_cache (TASK-047, миграция 0004_build_cache_and_app_state) —
 * закрывает задокументированный в LanePlanBuilder/DataService пробел
 * ("ИЗВЕСТНЫЙ РИСК ДАННЫХ"): раньше getHeroBuilds не имел кэш-фолбэка, при
 * недоступном STRATZ билд-часть плана на лайн сразу становилась 'no-data' без
 * stale-деградации. Тот же приём, что MatchupCacheStore/HeroPoolCacheStore:
 * только чтение/запись SQLite, без сетевой логики — этим владеет DataService.
 *
 * Группа = все build-строки, которые STRATZ вернул на один запрос
 * (heroId, vsHeroId?, patch, rankBracket) — пишутся/читаются атомарно, как
 * снимок (DELETE группы + INSERT, как у остальных кэшей). vsHeroId
 * опционален на уровне вызова (getHeroBuilds(heroId, scope, vsHeroId?)) —
 * SQLite не может нести NULL в составном ключе группировки предсказуемо
 * (несколько NULL считаются различными в UNIQUE/поиске), поэтому "нет
 * конкретного противника" хранится как сентинел NO_VS_HERO вместо NULL.
 */
import { BuildDataSchema, type BuildData } from '@shared/schemas/stratzDto'
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DatabaseInstance } from '../db/openDatabase'

export interface BuildCacheGroup {
  rows: BuildData[]
  fetchedAt: string
}

/** Сентинел для vsHeroId=undefined — реальные heroId всегда положительны. */
const NO_VS_HERO = -1

interface BuildCacheRow {
  hero_id: number
  vs_hero_id: number
  patch: string
  ability_ids: string
  starting_item_ids: string
  winrate: number
  sample_size: number
  fetched_at: string
}

function toVsHeroKey(vsHeroId: number | undefined): number {
  return vsHeroId ?? NO_VS_HERO
}

function rowToBuildData(row: BuildCacheRow): BuildData {
  return BuildDataSchema.parse({
    heroId: row.hero_id,
    vsHeroId: row.vs_hero_id === NO_VS_HERO ? null : row.vs_hero_id,
    skillBuild: JSON.parse(row.ability_ids),
    startingItems: JSON.parse(row.starting_item_ids),
    winrate: row.winrate,
    sampleSize: row.sample_size,
    patch: row.patch
  })
}

export class BuildCacheStore {
  constructor(private readonly db: DatabaseInstance) {}

  read(heroId: number, scope: StratzQueryScope, vsHeroId?: number): BuildCacheGroup | null {
    const rows = this.db
      .prepare<[number, number, string, string], BuildCacheRow>(
        `SELECT hero_id, vs_hero_id, patch, ability_ids, starting_item_ids, winrate, sample_size, fetched_at
         FROM build_cache
         WHERE hero_id = ? AND vs_hero_id = ? AND patch = ? AND rank_bracket = ?`
      )
      .all(heroId, toVsHeroKey(vsHeroId), scope.patch, scope.rankBracket)

    const [first] = rows
    if (!first) {
      return null
    }
    return { rows: rows.map(rowToBuildData), fetchedAt: first.fetched_at }
  }

  /** Атомарно заменяет группу (heroId, vsHeroId, patch, rankBracket) новым снимком. */
  write(
    heroId: number,
    scope: StratzQueryScope,
    vsHeroId: number | undefined,
    builds: BuildData[],
    fetchedAt: string
  ): void {
    const vsHeroKey = toVsHeroKey(vsHeroId)
    const deleteStmt = this.db.prepare(
      'DELETE FROM build_cache WHERE hero_id = ? AND vs_hero_id = ? AND patch = ? AND rank_bracket = ?'
    )
    const insertStmt = this.db.prepare(
      `INSERT INTO build_cache
        (hero_id, vs_hero_id, patch, rank_bracket, ability_ids, starting_item_ids, winrate, sample_size, fetched_at)
       VALUES (@heroId, @vsHeroId, @patch, @rankBracket, @abilityIds, @startingItemIds, @winrate, @sampleSize, @fetchedAt)`
    )

    this.db.transaction(() => {
      deleteStmt.run(heroId, vsHeroKey, scope.patch, scope.rankBracket)
      for (const build of builds) {
        insertStmt.run({
          heroId: build.heroId,
          vsHeroId: toVsHeroKey(build.vsHeroId ?? undefined),
          patch: build.patch,
          rankBracket: scope.rankBracket,
          abilityIds: JSON.stringify(build.skillBuild),
          startingItemIds: JSON.stringify(build.startingItems),
          winrate: build.winrate,
          sampleSize: build.sampleSize,
          fetchedAt
        })
      }
    })()
  }
}
