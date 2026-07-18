/**
 * STRATZ GraphQL-клиент (TASK-021): основной источник внешних данных (INV5),
 * возвращает внутренние DTO (TASK-020) через мапперы src/shared/stratz. Токен
 * ТОЛЬКО из переменной окружения STRATZ_API_TOKEN (никогда не в репозиторий, см.
 * .env.example) — createStratzClient() отдаёт null и логирует причину, если токен
 * не задан, приложение при этом продолжает работать без STRATZ-фич.
 *
 * Транспорт — нативный fetch (Node 22+, доступен в Electron main), без сторонних
 * GraphQL-библиотек: избавляет от лишней зависимости, при этом легко подменяется в
 * тестах через options.fetchFn. Троттлинг — RateLimiter (суточный резервуар +
 * посекундный интервал), запросы сериализуются.
 */
import {
  mapCurrentPatchToDto,
  mapHeroBuildsToDto,
  mapHeroMatchupsToDto,
  mapHeroPoolToDto,
  mapRecentMatchesToDto
} from '@shared/stratz/mapStratzToDto'
import type { BuildData, HeroPoolEntry, MatchSummary, MatchupData } from '@shared/schemas/stratzDto'
import type {
  StratzGameVersionResponse,
  StratzHeroBuildsResponse,
  StratzHeroMatchupsResponse,
  StratzHeroPoolResponse,
  StratzQueryScope,
  StratzRecentMatchesResponse
} from '@shared/types/stratz'
import { RateLimiter } from './RateLimiter'
import {
  GAME_VERSION_QUERY,
  HERO_BUILDS_QUERY,
  HERO_MATCHUPS_QUERY,
  HERO_POOL_QUERY,
  RECENT_MATCHES_QUERY
} from './stratzQueries'

export const STRATZ_ENDPOINT = 'https://api.stratz.com/graphql'
/** Атрибуция, обязательная в UI (условие использования STRATZ API) — DataService/UI пробрасывают эту строку. */
export const STRATZ_ATTRIBUTION = 'Powered by STRATZ'

/** Консервативная оценка публичных лимитов STRATZ: ~10k запросов/день, не чаще 10/сек. */
const DAILY_REQUEST_LIMIT = 10_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MIN_INTERVAL_MS = 100

interface GraphQLResponseBody<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export interface StratzClientOptions {
  apiToken: string
  logger?: (message: string) => void
  fetchFn?: typeof fetch
  rateLimiter?: RateLimiter
}

export class StratzClient {
  readonly attribution = STRATZ_ATTRIBUTION
  private readonly apiToken: string
  private readonly logger: (message: string) => void
  private readonly fetchFn: typeof fetch
  private readonly limiter: RateLimiter

  constructor(options: StratzClientOptions) {
    if (!options.apiToken) {
      throw new Error('StratzClient requires a non-empty apiToken')
    }
    this.apiToken = options.apiToken
    this.logger = options.logger ?? ((): void => {})
    this.fetchFn = options.fetchFn ?? fetch
    this.limiter =
      options.rateLimiter ??
      new RateLimiter({
        maxPerWindow: DAILY_REQUEST_LIMIT,
        windowMs: ONE_DAY_MS,
        minIntervalMs: MIN_INTERVAL_MS
      })
  }

  async getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<MatchupData[]> {
    const response = await this.request<StratzHeroMatchupsResponse>(HERO_MATCHUPS_QUERY, {
      heroId,
      ...scope
    })
    return mapHeroMatchupsToDto(response, scope)
  }

  async getHeroPool(steamAccountId: number): Promise<HeroPoolEntry[]> {
    const response = await this.request<StratzHeroPoolResponse>(HERO_POOL_QUERY, { steamAccountId })
    return mapHeroPoolToDto(response)
  }

  async getHeroBuilds(heroId: number, scope: StratzQueryScope, vsHeroId?: number): Promise<BuildData[]> {
    const response = await this.request<StratzHeroBuildsResponse>(HERO_BUILDS_QUERY, {
      heroId,
      vsHeroId,
      ...scope
    })
    return mapHeroBuildsToDto(response, scope.patch)
  }

  async getRecentMatches(steamAccountId: number, take: number): Promise<MatchSummary[]> {
    const response = await this.request<StratzRecentMatchesResponse>(RECENT_MATCHES_QUERY, {
      steamAccountId,
      take
    })
    return mapRecentMatchesToDto(response)
  }

  /** Текущий патч (TASK-047, PatchWatcher) — null, если STRATZ не отдал ни одной версии. */
  async getCurrentPatch(): Promise<string | null> {
    const response = await this.request<StratzGameVersionResponse>(GAME_VERSION_QUERY, {})
    return mapCurrentPatchToDto(response)
  }

  private request<TResponse>(query: string, variables: Record<string, unknown>): Promise<TResponse> {
    return this.limiter.schedule(() => this.executeRequest<TResponse>(query, variables))
  }

  private async executeRequest<TResponse>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<TResponse> {
    const response = await this.fetchFn(STRATZ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
        'User-Agent': 'MidMind (Dota 2 mid lane assistant)'
      },
      body: JSON.stringify({ query, variables })
    })

    if (!response.ok) {
      this.logger(`[stratz] request failed: HTTP ${response.status}`)
      throw new Error(`STRATZ request failed: HTTP ${response.status}`)
    }

    const payload = (await response.json()) as GraphQLResponseBody<TResponse>
    if (payload.errors && payload.errors.length > 0) {
      const message = payload.errors.map((error) => error.message).join('; ')
      this.logger(`[stratz] GraphQL error: ${message}`)
      throw new Error(`STRATZ GraphQL error: ${message}`)
    }
    if (!payload.data) {
      throw new Error('STRATZ response missing data')
    }
    return payload.data
  }
}

/**
 * Читает STRATZ_API_TOKEN из окружения и создаёт клиент. Если токен не задан —
 * возвращает null и логирует понятную причину; вызывающий код (DataService,
 * TASK-026) должен деградировать на OpenDota/кэш, а не падать.
 */
export function createStratzClient(logger: (message: string) => void = (): void => {}): StratzClient | null {
  const apiToken = process.env['STRATZ_API_TOKEN']
  if (!apiToken) {
    logger('[stratz] STRATZ_API_TOKEN not set — STRATZ features disabled, falling back to other sources')
    return null
  }
  return new StratzClient({ apiToken, logger })
}
