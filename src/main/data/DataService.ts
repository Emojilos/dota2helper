/**
 * DataService-фасад (TASK-026): ЕДИНСТВЕННАЯ точка входа для будущих
 * потребителей (DraftService/TASK-028, LanePlanBuilder/TASK-036, бенчмарк-
 * виджеты/TASK-039) для матчапов/пула героев/билдов/истории матчей. Реализует
 * лестницу деградации INV5:
 *
 *   STRATZ → OpenDota → SQLite stale-кэш → явное "нет данных"
 *
 * Каждый метод возвращает DataResult<T> (../../shared/types/dataResult) и
 * НИКОГДА не бросает исключение потребителю — ошибки источников логируются и
 * обрабатываются переходом к следующей ступени лестницы.
 *
 * Кэш есть под матчапы (MatchupCacheStore) И под пул героев (HeroPoolCacheStore,
 * TASK-031, опционален — если не передан в options, getHeroPool ведёт себя как
 * раньше: STRATZ → OpenDota → "нет данных" без stale-кэша). Билды/история матчей
 * по-прежнему без выделенного кэша: STRATZ → "нет данных" (OpenDota их не отдаёт).
 *
 * ВАЖНО: результаты OpenDota НЕ пишутся в matchup_cache. OpenDota отдаёт только
 * relation='vs' (без синергии) — если бы мы кэшировали их в ту же группу
 * (heroId, patch, rankBracket), writeGroup стёр бы ранее закэшированные STRATZ
 * 'with'-строки (DELETE группы перед INSERT). Дешевле повторно дергать
 * OpenDota при следующем промахе, чем тихо терять синергию.
 */
import type {
  BuildData,
  HeroPoolEntry,
  MatchSummary,
  MatchupData
} from '@shared/schemas/stratzDto'
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DataResult } from '@shared/types/dataResult'
import type { MatchupCacheStore } from './MatchupCacheStore'
import type { HeroPoolCacheStore } from './HeroPoolCacheStore'

/** Узкий срез StratzClient, нужный фасаду — легко подменяется фейком в тестах. */
export interface StratzDataSource {
  getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<MatchupData[]>
  getHeroPool(steamAccountId: number): Promise<HeroPoolEntry[]>
  getHeroBuilds(heroId: number, scope: StratzQueryScope, vsHeroId?: number): Promise<BuildData[]>
  getRecentMatches(steamAccountId: number, take: number): Promise<MatchSummary[]>
}

/** Узкий срез OpenDotaClient — только методы, которые он реально поддерживает (нет builds/recent matches). */
export interface OpenDotaDataSource {
  getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<MatchupData[]>
  getHeroPool(steamAccountId: number): Promise<HeroPoolEntry[]>
}

export interface DataServiceOptions {
  /** TTL кэша матчапов в мс (дефолт 24ч, раздел 5.1 PRD). */
  ttlMs?: number
  /** Источник текущего времени — подменяется в тестах для проверки протухания. */
  now?: () => number
  logger?: (message: string) => void
  /** Read-through кэш пула героев (TASK-031) — опционален, без него getHeroPool не кэширует. */
  heroPoolCacheStore?: HeroPoolCacheStore
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export class DataService {
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly logger: (message: string) => void
  private readonly heroPoolCacheStore: HeroPoolCacheStore | null

  constructor(
    private readonly cacheStore: MatchupCacheStore,
    private readonly stratzClient: StratzDataSource | null,
    private readonly openDotaClient: OpenDotaDataSource | null,
    options: DataServiceOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? Date.now
    this.logger = options.logger ?? ((): void => {})
    this.heroPoolCacheStore = options.heroPoolCacheStore ?? null
  }

  /** Матчапы героя (vs/with) для (patch, rankBracket) — полная лестница INV5. */
  async getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<DataResult<MatchupData[]>> {
    const cached = this.cacheStore.read(heroId, scope)
    if (cached && this.isFresh(cached.fetchedAt)) {
      return this.ok(cached.rows, 'cache', cached.fetchedAt, false)
    }

    if (this.stratzClient) {
      try {
        const fresh = await this.stratzClient.getHeroMatchups(heroId, scope)
        const fetchedAt = this.nowIso()
        this.cacheStore.write(heroId, scope, fresh, fetchedAt)
        return this.ok(fresh, 'stratz', fetchedAt, false)
      } catch (error) {
        this.logger(`[data] STRATZ matchups failed for hero ${heroId}: ${String(error)}`)
      }
    }

    if (this.openDotaClient) {
      try {
        const fromOpenDota = await this.openDotaClient.getHeroMatchups(heroId, scope)
        return this.ok(fromOpenDota, 'opendota', this.nowIso(), false, { relations: ['vs'] })
      } catch (error) {
        this.logger(`[data] OpenDota matchups failed for hero ${heroId}: ${String(error)}`)
      }
    }

    if (cached) {
      return this.ok(cached.rows, 'cache', cached.fetchedAt, true)
    }

    return this.noData(`No matchup data available for hero ${heroId} (STRATZ/OpenDota unavailable, no cache)`)
  }

  /**
   * Пул героев игрока (TASK-031): полная лестница деградации, как у матчапов,
   * если передан heroPoolCacheStore (иначе укороченная STRATZ → OpenDota →
   * "нет данных", как раньше). Кэш-ключ — steamAccountId (тот же 32-bit id,
   * которым зовём STRATZ/OpenDota), а не 64-bit SteamID из профиля.
   */
  async getHeroPool(steamAccountId: number): Promise<DataResult<HeroPoolEntry[]>> {
    const cacheKey = String(steamAccountId)
    const cached = this.heroPoolCacheStore?.read(cacheKey) ?? null
    if (cached && this.isFresh(cached.fetchedAt)) {
      return this.ok(cached.rows, 'cache', cached.fetchedAt, false)
    }

    if (this.stratzClient) {
      try {
        const data = await this.stratzClient.getHeroPool(steamAccountId)
        const fetchedAt = this.nowIso()
        this.heroPoolCacheStore?.write(cacheKey, data, fetchedAt)
        return this.ok(data, 'stratz', fetchedAt, false)
      } catch (error) {
        this.logger(`[data] STRATZ hero pool failed for ${steamAccountId}: ${String(error)}`)
      }
    }

    if (this.openDotaClient) {
      try {
        const data = await this.openDotaClient.getHeroPool(steamAccountId)
        const fetchedAt = this.nowIso()
        this.heroPoolCacheStore?.write(cacheKey, data, fetchedAt)
        return this.ok(data, 'opendota', fetchedAt, false)
      } catch (error) {
        this.logger(`[data] OpenDota hero pool failed for ${steamAccountId}: ${String(error)}`)
      }
    }

    if (cached) {
      return this.ok(cached.rows, 'cache', cached.fetchedAt, true)
    }

    return this.noData(`No hero pool data available for ${steamAccountId} (STRATZ/OpenDota unavailable, no cache)`)
  }

  /** Билды героя — только STRATZ (OpenDota не отдаёт скиллбилды/стартовые закупки в нашем контракте). */
  async getHeroBuilds(
    heroId: number,
    scope: StratzQueryScope,
    vsHeroId?: number
  ): Promise<DataResult<BuildData[]>> {
    if (this.stratzClient) {
      try {
        const data = await this.stratzClient.getHeroBuilds(heroId, scope, vsHeroId)
        return this.ok(data, 'stratz', this.nowIso(), false)
      } catch (error) {
        this.logger(`[data] STRATZ hero builds failed for hero ${heroId}: ${String(error)}`)
      }
    }

    return this.noData(`No build data available for hero ${heroId} (STRATZ unavailable)`)
  }

  /** История последних матчей игрока — только STRATZ. */
  async getRecentMatches(steamAccountId: number, take: number): Promise<DataResult<MatchSummary[]>> {
    if (this.stratzClient) {
      try {
        const data = await this.stratzClient.getRecentMatches(steamAccountId, take)
        return this.ok(data, 'stratz', this.nowIso(), false)
      } catch (error) {
        this.logger(`[data] STRATZ recent matches failed for ${steamAccountId}: ${String(error)}`)
      }
    }

    return this.noData(`No recent match data available for ${steamAccountId} (STRATZ unavailable)`)
  }

  private isFresh(fetchedAtIso: string): boolean {
    return this.now() - Date.parse(fetchedAtIso) < this.ttlMs
  }

  private nowIso(): string {
    return new Date(this.now()).toISOString()
  }

  private ok<T>(
    data: T,
    source: 'stratz' | 'opendota' | 'cache',
    fetchedAt: string,
    stale: boolean,
    coverage?: { relations: MatchupData['relation'][] }
  ): DataResult<T> {
    return coverage ? { status: 'ok', data, source, fetchedAt, stale, coverage } : { status: 'ok', data, source, fetchedAt, stale }
  }

  private noData<T>(reason: string): DataResult<T> {
    this.logger(`[data] ${reason}`)
    return { status: 'no-data', source: 'none', fetchedAt: null, stale: true, reason }
  }
}
