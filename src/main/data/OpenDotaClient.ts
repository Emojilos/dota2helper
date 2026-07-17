/**
 * OpenDota REST-клиент (TASK-024): fallback-источник, используется, когда
 * STRATZ недоступен/лимитирован (DataService-фасад TASK-026, деградация
 * STRATZ → OpenDota → SQLite stale → «нет данных», INV5). Возвращает те же
 * внутренние DTO (TASK-020), что и StratzClient — потребители не знают,
 * откуда данные пришли.
 *
 * Публичный API, без обязательной авторизации (в отличие от STRATZ); опциональный
 * OPENDOTA_API_KEY поднимает лимиты платного тира, но createOpenDotaClient()
 * работает и без него. Транспорт — нативный fetch, троттлинг — тот же RateLimiter,
 * что и у StratzClient (консервативная оценка публичного лимита без ключа:
 * ~60 запросов/мин).
 */
import { mapOpenDotaHeroMatchupsToDto, mapOpenDotaHeroPoolToDto } from '@shared/opendota/mapOpenDotaToDto'
import type { HeroPoolEntry, MatchupData } from '@shared/schemas/stratzDto'
import type { StratzQueryScope } from '@shared/types/stratz'
import type { OpenDotaHeroMatchupsResponse, OpenDotaPlayerHeroesResponse } from '@shared/types/opendota'
import { RateLimiter } from './RateLimiter'

export const OPENDOTA_ENDPOINT = 'https://api.opendota.com/api'
/** Атрибуция для UI, когда данные пришли из fallback-источника (аналог STRATZ_ATTRIBUTION). */
export const OPENDOTA_ATTRIBUTION = 'Powered by OpenDota'

const REQUESTS_PER_MINUTE = 60
const ONE_MINUTE_MS = 60 * 1000
const MIN_INTERVAL_MS = 1000

export interface OpenDotaClientOptions {
  apiKey?: string
  logger?: (message: string) => void
  fetchFn?: typeof fetch
  rateLimiter?: RateLimiter
}

export class OpenDotaClient {
  readonly attribution = OPENDOTA_ATTRIBUTION
  private readonly apiKey: string | undefined
  private readonly logger: (message: string) => void
  private readonly fetchFn: typeof fetch
  private readonly limiter: RateLimiter

  constructor(options: OpenDotaClientOptions = {}) {
    this.apiKey = options.apiKey
    this.logger = options.logger ?? ((): void => {})
    this.fetchFn = options.fetchFn ?? fetch
    this.limiter =
      options.rateLimiter ??
      new RateLimiter({
        maxPerWindow: REQUESTS_PER_MINUTE,
        windowMs: ONE_MINUTE_MS,
        minIntervalMs: MIN_INTERVAL_MS
      })
  }

  async getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<MatchupData[]> {
    const response = await this.request<OpenDotaHeroMatchupsResponse>(`/heroes/${heroId}/matchups`)
    return mapOpenDotaHeroMatchupsToDto(heroId, response, scope)
  }

  async getHeroPool(steamAccountId: number): Promise<HeroPoolEntry[]> {
    const response = await this.request<OpenDotaPlayerHeroesResponse>(`/players/${steamAccountId}/heroes`)
    return mapOpenDotaHeroPoolToDto(response)
  }

  private request<TResponse>(path: string): Promise<TResponse> {
    return this.limiter.schedule(() => this.executeRequest<TResponse>(path))
  }

  private async executeRequest<TResponse>(path: string): Promise<TResponse> {
    const query = this.apiKey ? `?api_key=${encodeURIComponent(this.apiKey)}` : ''
    const response = await this.fetchFn(`${OPENDOTA_ENDPOINT}${path}${query}`, {
      headers: { 'User-Agent': 'MidMind (Dota 2 mid lane assistant)' }
    })

    if (!response.ok) {
      this.logger(`[opendota] request failed: HTTP ${response.status}`)
      throw new Error(`OpenDota request failed: HTTP ${response.status}`)
    }

    return (await response.json()) as TResponse
  }
}

/** Читает опциональный OPENDOTA_API_KEY из окружения; в отличие от STRATZ, клиент работает и без ключа. */
export function createOpenDotaClient(logger: (message: string) => void = (): void => {}): OpenDotaClient {
  const apiKey = process.env['OPENDOTA_API_KEY']
  return new OpenDotaClient({ apiKey, logger })
}
