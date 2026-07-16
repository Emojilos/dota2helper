/**
 * Лимитер запросов для STRATZ-клиента (TASK-021): суточный резервуар (~10k/день)
 * + минимальный интервал между запросами (посекундный лимит), задачи выполняются
 * строго последовательно (одна за другой), сериализуя нагрузку на API.
 *
 * `now`/`sleep` инъецируются, чтобы тесты могли проверить throttling без реального
 * ожидания (см. test/main/rateLimiter.test.ts) — тот же приём, что и инъекция
 * `now`/`idFactory` в TimingScheduler (TASK-012).
 */

export class StratzRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StratzRateLimitError'
  }
}

export interface RateLimiterOptions {
  /** Максимум запросов за одно окно (напр. суточный лимит STRATZ). */
  maxPerWindow: number
  /** Длительность окна в мс (напр. 24 часа). */
  windowMs: number
  /** Минимальный интервал между стартами запросов в мс (посекундный лимит). */
  minIntervalMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Планирует задачи строго последовательно, соблюдая суточный резервуар и посекундный интервал. */
export class RateLimiter {
  private readonly maxPerWindow: number
  private readonly windowMs: number
  private readonly minIntervalMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  private windowStart: number
  private windowCount = 0
  private lastRunAt = -Infinity
  private queue: Promise<void> = Promise.resolve()

  constructor(options: RateLimiterOptions) {
    this.maxPerWindow = options.maxPerWindow
    this.windowMs = options.windowMs
    this.minIntervalMs = options.minIntervalMs
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? defaultSleep
    this.windowStart = this.now()
  }

  /** Ставит задачу в очередь; выполняется, когда до неё дойдёт ход и резервуар/интервал позволяют. */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.runOne(task))
    // Очередь продолжается независимо от исхода текущей задачи (ошибка не блокирует следующие).
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async runOne<T>(task: () => Promise<T>): Promise<T> {
    const currentTime = this.now()
    if (currentTime - this.windowStart >= this.windowMs) {
      this.windowStart = currentTime
      this.windowCount = 0
    }
    if (this.windowCount >= this.maxPerWindow) {
      throw new StratzRateLimitError(
        `STRATZ rate limit exceeded: max ${this.maxPerWindow} requests per ${this.windowMs}ms window`
      )
    }

    const waitMs = this.lastRunAt + this.minIntervalMs - currentTime
    if (waitMs > 0) {
      await this.sleep(waitMs)
    }

    this.windowCount += 1
    this.lastRunAt = this.now()
    return task()
  }
}
