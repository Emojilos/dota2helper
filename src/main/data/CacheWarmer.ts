/**
 * CacheWarmer (TASK-025): фоновый прогрев кэша матчапов (MatchupCacheStore,
 * TASK-022/023) при старте приложения — чтобы первый скрининг драфта
 * (TASK-028/029) не ждал сети на топовых мид-героях меты.
 *
 * run() вызывается из main/index.ts БЕЗ await ("void warmer.run()") — прогрев
 * не должен блокировать запуск/показ окна. Лимиты STRATZ уже соблюдены на
 * уровне StratzClient (RateLimiter внутри, TASK-021): CacheWarmer лишь
 * последовательно дёргает DataService.getHeroMatchups() по списку героев, и
 * эти вызовы естественно сериализуются тем же лимитером. Ошибка одного героя
 * (сеть/таймаут) не прерывает прогрев остальных — DataService уже не бросает
 * исключение наружу (INV5, возвращает {status:'no-data'}), а try/catch здесь
 * — просто защита фоновой задачи от неожиданного unhandled rejection.
 *
 * INV1: живёт в main, зависит только от узкого среза DataService (легко
 * подменяется фейком в тестах, тот же приём, что StratzDataSource/
 * OpenDotaDataSource в DataService.ts).
 */
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DataResult } from '@shared/types/dataResult'
import type { MatchupData } from '@shared/schemas/stratzDto'

export interface CacheWarmerDataSource {
  getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<DataResult<MatchupData[]>>
}

export interface CacheWarmerProgress {
  completed: number
  total: number
  heroId: number
  status: 'ok' | 'no-data' | 'error'
}

export interface CacheWarmerOptions {
  onProgress?: (progress: CacheWarmerProgress) => void
  logger?: (message: string) => void
}

export class CacheWarmer {
  private readonly onProgress: (progress: CacheWarmerProgress) => void
  private readonly logger: (message: string) => void

  constructor(
    private readonly dataService: CacheWarmerDataSource,
    private readonly heroIds: readonly number[],
    private readonly scope: StratzQueryScope,
    options: CacheWarmerOptions = {}
  ) {
    this.onProgress = options.onProgress ?? ((): void => {})
    this.logger = options.logger ?? ((): void => {})
  }

  /**
   * Прогревает кэш последовательно по списку героев. Никогда не бросает
   * исключение — это фоновая задача, её отказ не должен ронять вызывающего.
   */
  async run(): Promise<void> {
    const total = this.heroIds.length
    let completed = 0
    for (const heroId of this.heroIds) {
      let status: CacheWarmerProgress['status']
      try {
        const result = await this.dataService.getHeroMatchups(heroId, this.scope)
        status = result.status === 'ok' ? 'ok' : 'no-data'
      } catch (error) {
        status = 'error'
        this.logger(`[cache-warmer] hero ${heroId} failed: ${String(error)}`)
      }
      completed += 1
      this.onProgress({ completed, total, heroId, status })
    }
    this.logger(`[cache-warmer] done: ${completed}/${total} heroes processed`)
  }
}
