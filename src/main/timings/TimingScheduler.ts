/**
 * TimingScheduler — планировщик тайминговых напоминалок в main (F3, TASK-012).
 *
 * Сторона эффектов вокруг чистого движка src/engine/timings: подписывается на
 * GameStateStore, хранит предыдущий тик (игровое время + кулдаун байбека),
 * прогоняет dueTimingAlerts() и превращает сработавшие события в Advice, отдавая
 * их через onAlert. Позже onAlert подключит очередь AdviceScheduler (TASK-013) и
 * push advice:push в renderer (TASK-007).
 *
 * Тайминги и их тумблеры — данные: события берутся из timings.json через
 * ConfigLoader (getEvents), отключённые типы — через getDisabledEventIds
 * (проекция настроек, TASK-018). Смена конфига применяется на следующем тике без
 * перезапуска (hot-reload TASK-011).
 *
 * INV1: живёт в main. INV2 к нему не относится (движок, который он вызывает, чист).
 */
import type { GameState } from '@shared/schemas/gameState'
import type { Advice } from '@shared/schemas/advice'
import type { TimingsConfig } from '@shared/schemas/timings'
import { dueTimingAlerts, type TimingAlert, type TimingContext } from '@engine/timings'
import type { GameStateStore } from '../gsi/GameStateStore'

const EMPTY_DISABLED: ReadonlySet<string> = new Set<string>()

export interface TimingSchedulerOptions {
  store: GameStateStore
  /** Актуальная конфигурация таймингов (ConfigHandle.get()); null — ещё не загружена. */
  getEvents: () => TimingsConfig | null
  /** Приёмник готового уведомления (очередь/лог/IPC). */
  onAlert: (advice: Advice) => void
  /** Отключённые в настройках типы событий (по умолчанию — пусто). */
  getDisabledEventIds?: () => ReadonlySet<string>
  /** Источник wall-clock для Advice.createdAtMs (по умолчанию Date.now). */
  now?: () => number
  /** Фабрика id уведомления (по умолчанию — случайный). */
  idFactory?: () => string
}

export class TimingScheduler {
  private readonly store: GameStateStore
  private readonly getEvents: () => TimingsConfig | null
  private readonly onAlert: (advice: Advice) => void
  private readonly getDisabledEventIds: () => ReadonlySet<string>
  private readonly now: () => number
  private readonly idFactory: () => string

  private prevClockTimeSec: number | null = null
  private prevBuybackCooldownSec: number | null = null
  private unsubscribe: (() => void) | null = null

  constructor(options: TimingSchedulerOptions) {
    this.store = options.store
    this.getEvents = options.getEvents
    this.onAlert = options.onAlert
    this.getDisabledEventIds = options.getDisabledEventIds ?? (() => EMPTY_DISABLED)
    this.now = options.now ?? Date.now
    this.idFactory = options.idFactory ?? defaultIdFactory
  }

  /** Подписывается на обновления состояния. Идемпотентен. */
  start(): void {
    if (this.unsubscribe) {
      return
    }
    this.unsubscribe = this.store.subscribe((state) => this.onGameState(state))
  }

  /** Снимает подписку и сбрасывает историю тиков. */
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.prevClockTimeSec = null
    this.prevBuybackCooldownSec = null
  }

  /** Обрабатывает один тик GSI. Публичен для юнит-тестов без реального стора. */
  onGameState(state: GameState): void {
    const clockTimeSec = state.map?.clockTime ?? null
    if (clockTimeSec === null) {
      // Ещё нет карты (стадия подключения) — историю не ведём.
      return
    }
    const buybackCooldownSec = state.hero?.buybackCooldown ?? null

    // Скачок времени назад = новый матч / перемотка реплея: сбрасываем историю,
    // чтобы не породить ложные «прошлые» события, и ждём следующего тика.
    if (this.prevClockTimeSec !== null && clockTimeSec < this.prevClockTimeSec) {
      this.prevClockTimeSec = null
      this.prevBuybackCooldownSec = null
    }

    const config = this.getEvents()
    const events = config?.events ?? []
    const ctx: TimingContext = {
      clockTimeSec,
      prevClockTimeSec: this.prevClockTimeSec,
      buybackCooldownSec,
      prevBuybackCooldownSec: this.prevBuybackCooldownSec,
      disabledEventIds: this.getDisabledEventIds()
    }

    for (const alert of dueTimingAlerts(events, ctx)) {
      this.onAlert(this.toAdvice(alert))
    }

    this.prevClockTimeSec = clockTimeSec
    this.prevBuybackCooldownSec = buybackCooldownSec
  }

  private toAdvice(alert: TimingAlert): Advice {
    const message =
      alert.warnBeforeSec > 0
        ? `${alert.labelRu} — через ${alert.warnBeforeSec} сек`
        : alert.labelRu
    return {
      id: this.idFactory(),
      ruleId: `timing:${alert.eventId}`,
      message,
      severity: alert.severity,
      priority: alert.priority,
      estimated: false,
      createdAtMs: this.now()
    }
  }
}

function defaultIdFactory(): string {
  return `advice_${Math.random().toString(36).slice(2, 10)}`
}
