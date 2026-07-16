import { describe, it, expect, vi } from 'vitest'
import { RateLimiter, StratzRateLimitError } from '@main/data/RateLimiter'

/** Часы и сон управляются вручную — тесты детерминированы, без реального ожидания. */
function createClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  let current = startMs
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    }
  }
}

describe('TASK-021: RateLimiter (STRATZ throttling)', () => {
  it('runs tasks sequentially and returns their results in order', async () => {
    const clock = createClock()
    const limiter = new RateLimiter({
      maxPerWindow: 100,
      windowMs: 1000,
      minIntervalMs: 0,
      now: clock.now,
      sleep: async () => undefined
    })

    const results = await Promise.all([
      limiter.schedule(async () => 1),
      limiter.schedule(async () => 2),
      limiter.schedule(async () => 3)
    ])

    expect(results).toEqual([1, 2, 3])
  })

  it('enforces minIntervalMs by sleeping the gap between back-to-back requests', async () => {
    const clock = createClock()
    const sleep = vi.fn(async (ms: number) => {
      clock.advance(ms)
    })
    const limiter = new RateLimiter({
      maxPerWindow: 100,
      windowMs: 1000,
      minIntervalMs: 100,
      now: clock.now,
      sleep
    })

    await limiter.schedule(async () => 'a')
    await limiter.schedule(async () => 'b')
    await limiter.schedule(async () => 'c')

    // Первый запуск не ждёт (lastRunAt=-Infinity); второй и третий — по 100мс.
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 100)
    expect(sleep).toHaveBeenNthCalledWith(2, 100)
  })

  it('does not sleep when enough time already elapsed between calls', async () => {
    const clock = createClock()
    const sleep = vi.fn(async () => undefined)
    const limiter = new RateLimiter({
      maxPerWindow: 100,
      windowMs: 1000,
      minIntervalMs: 100,
      now: clock.now,
      sleep
    })

    await limiter.schedule(async () => 'a')
    clock.advance(200)
    await limiter.schedule(async () => 'b')

    expect(sleep).not.toHaveBeenCalled()
  })

  it('throws StratzRateLimitError once the per-window reservoir is exhausted', async () => {
    const clock = createClock()
    const limiter = new RateLimiter({
      maxPerWindow: 2,
      windowMs: 1000,
      minIntervalMs: 0,
      now: clock.now,
      sleep: async () => undefined
    })

    await limiter.schedule(async () => 1)
    await limiter.schedule(async () => 2)
    await expect(limiter.schedule(async () => 3)).rejects.toThrow(StratzRateLimitError)
  })

  it('refills the reservoir once the window elapses', async () => {
    const clock = createClock()
    const limiter = new RateLimiter({
      maxPerWindow: 1,
      windowMs: 1000,
      minIntervalMs: 0,
      now: clock.now,
      sleep: async () => undefined
    })

    await limiter.schedule(async () => 1)
    await expect(limiter.schedule(async () => 2)).rejects.toThrow(StratzRateLimitError)

    clock.advance(1000)
    await expect(limiter.schedule(async () => 3)).resolves.toBe(3)
  })

  it('keeps processing the queue after a task rejects', async () => {
    const clock = createClock()
    const limiter = new RateLimiter({
      maxPerWindow: 100,
      windowMs: 1000,
      minIntervalMs: 0,
      now: clock.now,
      sleep: async () => undefined
    })

    const failing = limiter.schedule(async () => {
      throw new Error('boom')
    })
    const succeeding = limiter.schedule(async () => 'ok')

    await expect(failing).rejects.toThrow('boom')
    await expect(succeeding).resolves.toBe('ok')
  })
})
