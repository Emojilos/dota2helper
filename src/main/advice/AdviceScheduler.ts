/**
 * AdviceScheduler — пайплайн уведомлений в main (TASK-013).
 *
 * Стоит между источниками Advice (TimingScheduler/F3 уже, позже advice-gate
 * F4/TASK-044) и push-каналом advice:push: очередь с приоритетами, не более
 * maxVisible уведомлений «на экране» одновременно, каждое «показанное»
 * уведомление автоматически «гаснет» через dismissAfterMs (5–8 сек), освобождая
 * слот для следующего в очереди.
 *
 * «На экране» здесь — модель main-процесса: renderer не шлёт обратно сигнал
 * dismiss (IpcContract такого канала не определяет), поэтому источник правды о
 * видимости — таймер здесь. Renderer (TASK-015) лишь проецирует то, что реально
 * пришло по advice:push, и визуально анимирует исчезновение к тому же моменту.
 *
 * INV1: живёт в main, работает через переданный push-колбэк (обычно
 * broadcast('advice:push', ...)), не завязан на конкретный транспорт.
 */
import type { Advice } from '@shared/schemas/advice'

export interface AdviceSchedulerOptions {
  /** Доставка уведомления потребителю (обычно broadcast('advice:push', advice)). */
  push: (advice: Advice) => void
  /** Максимум уведомлений «на экране» одновременно (по умолчанию 2). */
  maxVisible?: number
  /** Длительность показа одного уведомления в мс (по умолчанию случайно 5000–8000). */
  dismissAfterMs?: () => number
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

const DEFAULT_MAX_VISIBLE = 2

function defaultDismissAfterMs(): number {
  return 5000 + Math.floor(Math.random() * 3000) // 5000..8000
}

export class AdviceScheduler {
  private readonly push: (advice: Advice) => void
  private readonly maxVisible: number
  private readonly dismissAfterMs: () => number
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  private readonly queue: Advice[] = []
  private readonly visibleTimers = new Map<string, unknown>()

  constructor(options: AdviceSchedulerOptions) {
    this.push = options.push
    this.maxVisible = options.maxVisible ?? DEFAULT_MAX_VISIBLE
    this.dismissAfterMs = options.dismissAfterMs ?? defaultDismissAfterMs
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  /** Ставит уведомление в очередь (или сразу показывает, если есть свободный слот). */
  enqueue(advice: Advice): void {
    this.queue.push(advice)
    this.sortQueue()
    this.fillVisibleSlots()
  }

  /** Сколько уведомлений сейчас «на экране». */
  get visibleCount(): number {
    return this.visibleTimers.size
  }

  /** Сколько уведомлений ожидает в очереди. */
  get queueLength(): number {
    return this.queue.length
  }

  /** Останавливает все таймеры показа и очищает очередь (например, при выключении приложения). */
  stop(): void {
    for (const handle of this.visibleTimers.values()) {
      this.clearTimer(handle)
    }
    this.visibleTimers.clear()
    this.queue.length = 0
  }

  private fillVisibleSlots(): void {
    while (this.visibleTimers.size < this.maxVisible && this.queue.length > 0) {
      const advice = this.queue.shift()
      if (!advice) {
        break
      }
      this.show(advice)
    }
  }

  private show(advice: Advice): void {
    this.push(advice)
    const timer = this.setTimer(() => this.dismiss(advice.id), this.dismissAfterMs())
    this.visibleTimers.set(advice.id, timer)
  }

  private dismiss(id: string): void {
    const timer = this.visibleTimers.get(id)
    if (timer !== undefined) {
      this.clearTimer(timer)
    }
    this.visibleTimers.delete(id)
    this.fillVisibleSlots()
  }

  /** Более приоритетные (больше priority) уведомления опережают менее приоритетные в очереди. */
  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAtMs - b.createdAtMs)
  }
}
