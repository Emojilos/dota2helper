/**
 * DraftService (F1, TASK-028): main-оркестратор скоринга кандидатов на пик.
 * Инкапсулирует данные, которые чистый скоринг (engine/draft.rankDraftCandidates,
 * TASK-028) сам не запрашивает (INV2):
 *  - пул кандидатов — content/meta-mid-heroes.json (тот же список топ-мид-
 *    героев меты, который CacheWarmer, TASK-025, греет в matchup_cache при
 *    старте — поэтому getHeroMatchups здесь почти всегда попадает в кэш, а не
 *    в сеть);
 *  - матчапы каждого кандидата — DataService.getHeroMatchups (лестница
 *    деградации STRATZ → OpenDota → SQLite stale-кэш → 'нет данных', INV5);
 *  - личная статистика — DataService.getHeroPool (TASK-031), только если
 *    передан steamAccountId (Steam ID привязан).
 *
 * computeRankings() считает ОБА ранжирования (Meta и Personal) за один вызов
 * над одним и тем же набором собранных данных — переключатель в будущей
 * панели (TASK-029) сможет показывать оба мгновенно, без повторного похода за
 * данными (acceptance criteria TASK-028).
 *
 * Кандидат, уже занятый в текущем драфте (свой герой/союзники/враги),
 * исключается из выдачи — рекомендовать взятого героя бессмысленно.
 *
 * Отказ отдельного getHeroMatchups не прерывает построение остальных
 * (Promise.allSettled) — такой кандидат просто участвует с matchups=[]
 * (нейтральные 0.5, см. engine/draft.scoreDraftCandidate).
 *
 * INV1: живёт в main. Узкий срез DataService (DraftServiceDataSource) — тот
 * же приём, что LanePlanDataSource/CacheWarmerDataSource.
 */
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DataResult, DataSource } from '@shared/types/dataResult'
import type { MatchupData, HeroPoolEntry } from '@shared/schemas/stratzDto'
import type { DraftCandidate } from '@shared/schemas/advice'
import type { DraftContext } from '@shared/schemas/draft'
import {
  rankDraftCandidates,
  metaScoringWeights,
  DEFAULT_DRAFT_SCORING_WEIGHTS,
  type DraftCandidateData
} from '@engine/draft'

/** Узкий срез DataService, нужный сервису — легко подменяется фейком в тестах. */
export interface DraftServiceDataSource {
  getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<DataResult<MatchupData[]>>
  getHeroPool(steamAccountId: number): Promise<DataResult<HeroPoolEntry[]>>
}

/** Пул кандидатов на пик — героев и scope (patch/rankBracket), под которые запрашиваются матчапы. */
export interface DraftCandidatePool {
  heroIds: number[]
  scope: StratzQueryScope
}

export interface DraftRankings {
  meta: DraftCandidate[]
  personal: DraftCandidate[]
  /**
   * Метка давности/источника матчап-данных, использованных для расчёта ЭТОГО
   * набора ранжирований (TASK-029 acceptance: "при недоступности STRATZ
   * показывается кэш с пометкой давности"). Агрегат по всем успешно
   * запрошенным кандидатам — 'mixed', если герои получили данные из разных
   * источников (напр. часть уже в кэше, часть только что из STRATZ), 'none',
   * если ни один кандидат не получил данных вовсе. `stale=true`, если ХОТЯ БЫ
   * один кандидат отдал протухший SQLite-кэш (DataService, INV5).
   */
  dataSource: DataSource | 'mixed' | 'none'
  dataStale: boolean
}

export interface DraftServiceOptions {
  logger?: (message: string) => void
}

export class DraftService {
  private readonly logger: (message: string) => void

  constructor(
    private readonly dataSource: DraftServiceDataSource,
    private readonly getCandidatePool: () => DraftCandidatePool | null,
    private readonly getHeroName: (heroId: number) => string,
    options: DraftServiceOptions = {}
  ) {
    this.logger = options.logger ?? ((): void => {})
  }

  /**
   * Собирает Meta- и Personal-ранжирования кандидатов для текущего
   * DraftContext. steamAccountId — 32-bit account id для DataService.getHeroPool
   * (null, если Steam ID не привязан — тогда personalWinrate будет null у всех
   * кандидатов, Personal-ранжирование совпадёт с Meta с точностью до нулевого
   * вклада w3).
   */
  async computeRankings(context: DraftContext, steamAccountId: number | null): Promise<DraftRankings> {
    const pool = this.getCandidatePool()
    if (!pool) {
      return { meta: [], personal: [], dataSource: 'none', dataStale: false }
    }

    const taken = new Set<number>([
      ...(context.ownHeroId !== null ? [context.ownHeroId] : []),
      ...context.allyHeroIds,
      ...context.enemyHeroIds
    ])
    const candidateHeroIds = pool.heroIds.filter((heroId) => !taken.has(heroId))

    const [{ matchupsByHero, dataSource, dataStale }, personalByHero] = await Promise.all([
      this.fetchMatchups(candidateHeroIds, pool.scope),
      this.fetchPersonalWinrates(steamAccountId)
    ])

    const candidates: DraftCandidateData[] = candidateHeroIds.map((heroId) => ({
      heroId,
      heroName: this.getHeroName(heroId),
      matchups: matchupsByHero.get(heroId) ?? [],
      personalWinrate: personalByHero.get(heroId) ?? null
    }))

    const picks = {
      enemyHeroIds: context.enemyHeroIds,
      enemyMidHeroId: context.enemyMidHeroId,
      allyHeroIds: context.allyHeroIds
    }

    return {
      meta: rankDraftCandidates(candidates, picks, metaScoringWeights()),
      personal: rankDraftCandidates(candidates, picks, DEFAULT_DRAFT_SCORING_WEIGHTS),
      dataSource,
      dataStale
    }
  }

  private async fetchMatchups(
    heroIds: number[],
    scope: StratzQueryScope
  ): Promise<{ matchupsByHero: Map<number, MatchupData[]>; dataSource: DataSource | 'mixed' | 'none'; dataStale: boolean }> {
    const settled = await Promise.allSettled(
      heroIds.map(async (heroId) => [heroId, await this.dataSource.getHeroMatchups(heroId, scope)] as const)
    )
    const map = new Map<number, MatchupData[]>()
    const sourcesSeen = new Set<DataSource>()
    let stale = false
    for (const result of settled) {
      if (result.status !== 'fulfilled') {
        this.logger(`[draft-service] getHeroMatchups rejected: ${String(result.reason)}`)
        continue
      }
      const [heroId, data] = result.value
      if (data.status === 'ok') {
        map.set(heroId, data.data)
        sourcesSeen.add(data.source)
        if (data.stale) {
          stale = true
        }
      }
    }
    const dataSource: DataSource | 'mixed' | 'none' =
      sourcesSeen.size === 0 ? 'none' : sourcesSeen.size === 1 ? [...sourcesSeen][0] : 'mixed'
    return { matchupsByHero: map, dataSource, dataStale: stale }
  }

  private async fetchPersonalWinrates(steamAccountId: number | null): Promise<Map<number, number>> {
    if (steamAccountId === null) {
      return new Map()
    }
    try {
      const result = await this.dataSource.getHeroPool(steamAccountId)
      if (result.status !== 'ok') {
        return new Map()
      }
      return new Map(result.data.map((entry) => [entry.heroId, entry.winrate]))
    } catch (error) {
      this.logger(`[draft-service] getHeroPool failed for account ${steamAccountId}: ${String(error)}`)
      return new Map()
    }
  }
}
