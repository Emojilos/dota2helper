/**
 * Тесты AdviceScheduler (main, F5, TASK-013).
 *
 * Покрывают test_step'ы:
 *  - Шаг 1: 4 уведомления подряд — на экране максимум 2, остальные в очереди.
 *  - Шаг 2: не трогать экран — каждое исчезает через 5–8 сек, освобождая слот
 *    следующему в очереди.
 *  - Шаг 3: высокоприоритетное уведомление опережает низкоприоритетные в очереди.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AdviceScheduler } from '@main/advice'
import type { Advice } from '@shared/schemas/advice'

function advice(id: string, priority: number, createdAtMs = 0): Advice {
  return {
    id,
    ruleId: `rule:${id}`,
    message: `message ${id}`,
    severity: 'timing',
    priority,
    estimated: false,
    createdAtMs
  }
}

describe('AdviceScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('не более maxVisible уведомлений «на экране» одновременно — остальные ждут в очереди (шаг 1)', () => {
    const pushed: Advice[] = []
    const scheduler = new AdviceScheduler({ push: (a) => pushed.push(a) })

    scheduler.enqueue(advice('a', 3))
    scheduler.enqueue(advice('b', 3))
    scheduler.enqueue(advice('c', 3))
    scheduler.enqueue(advice('d', 3))

    expect(pushed.map((a) => a.id)).toEqual(['a', 'b'])
    expect(scheduler.visibleCount).toBe(2)
    expect(scheduler.queueLength).toBe(2)
  })

  it('уведомление гаснет через 5-8 сек, освобождая слот следующему в очереди (шаг 2)', () => {
    const pushed: Advice[] = []
    const scheduler = new AdviceScheduler({
      push: (a) => pushed.push(a),
      dismissAfterMs: () => 6000
    })

    scheduler.enqueue(advice('a', 3))
    scheduler.enqueue(advice('b', 3))
    scheduler.enqueue(advice('c', 3))
    expect(pushed.map((a) => a.id)).toEqual(['a', 'b'])
    expect(scheduler.queueLength).toBe(1)

    vi.advanceTimersByTime(4999)
    expect(scheduler.visibleCount).toBe(2)
    expect(pushed.map((a) => a.id)).toEqual(['a', 'b'])

    vi.advanceTimersByTime(1001) // итого 6000мс — первые два гаснут одновременно
    expect(scheduler.visibleCount).toBe(1) // 'c' заняло освободившийся слот
    expect(pushed.map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(scheduler.queueLength).toBe(0)

    vi.advanceTimersByTime(6000)
    expect(scheduler.visibleCount).toBe(0)
  })

  it('более приоритетное уведомление опережает менее приоритетные в очереди (шаг 3)', () => {
    const pushed: Advice[] = []
    const scheduler = new AdviceScheduler({
      push: (a) => pushed.push(a),
      dismissAfterMs: () => 6000
    })

    // Заполняем оба слота, дальше всё идёт в очередь.
    scheduler.enqueue(advice('low1', 1))
    scheduler.enqueue(advice('low2', 1))
    scheduler.enqueue(advice('low3', 1))
    scheduler.enqueue(advice('urgent', 5))

    expect(scheduler.queueLength).toBe(2)
    expect(pushed.map((a) => a.id)).toEqual(['low1', 'low2'])

    vi.advanceTimersByTime(6000) // low1/low2 гаснут, освобождают оба слота
    // urgent (priority=5) должен был обогнать low3 (priority=1) в очереди.
    expect(pushed.map((a) => a.id)).toEqual(['low1', 'low2', 'urgent', 'low3'])
  })

  it('при равном приоритете порядок FIFO по времени создания', () => {
    const pushed: Advice[] = []
    const scheduler = new AdviceScheduler({ push: (a) => pushed.push(a), dismissAfterMs: () => 6000 })

    scheduler.enqueue(advice('a', 3, 100))
    scheduler.enqueue(advice('b', 3, 200))
    scheduler.enqueue(advice('c', 3, 300))
    scheduler.enqueue(advice('d', 3, 400))

    vi.advanceTimersByTime(6000)
    expect(pushed.map((a) => a.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('stop() очищает таймеры и очередь — новые слоты не заполняются сами по себе', () => {
    const pushed: Advice[] = []
    const scheduler = new AdviceScheduler({ push: (a) => pushed.push(a), dismissAfterMs: () => 6000 })

    scheduler.enqueue(advice('a', 3))
    scheduler.enqueue(advice('b', 3))
    scheduler.enqueue(advice('c', 3))
    scheduler.stop()

    expect(scheduler.visibleCount).toBe(0)
    expect(scheduler.queueLength).toBe(0)

    vi.advanceTimersByTime(10_000)
    expect(pushed.map((a) => a.id)).toEqual(['a', 'b'])
  })
})
