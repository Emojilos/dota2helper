/**
 * engine/timings — ЧИСТОЕ ядро тайминговых напоминалок (F3, TASK-012).
 *
 * Не тянет electron/react/fs/сеть/Date.now (INV2): игровое время и предыдущий
 * тик подаются явно аргументами, поэтому функции детерминированы и полностью
 * покрываются юнит-тестами. Всю сторону эффектов (подписка на GSI, отправка
 * уведомлений, wall-clock) делает планировщик в main (src/main/timings).
 *
 * Две задачи модуля:
 *  - dueTimingAlerts(): какие события должны СРАБОТАТЬ на этом тике GSI. Триггер
 *    edge-детектируется по окну (prevClockTime, clockTime]: момент предупреждения
 *    события = occurrence − warnBeforeSec; если он пересечён между прошлым и
 *    текущим тиком — событие срабатывает РОВНО один раз. При частоте GSI ~2 Гц
 *    это даёт точность ±1 сек и не спамит повторами.
 *  - upcomingTimingEvents(): ближайшее наступление каждого события (для
 *    компактной панели F5 «таймер ближайшего события», TASK-016).
 */
import type { TimingEvent } from '@shared/schemas/timings'
import type { AdviceSeverity } from '@shared/schemas/advice'

/** Контекст одного тика GSI, подаётся планировщиком явно (INV2 — без Date.now). */
export interface TimingContext {
  /** текущее игровое время, сек (может быть отрицательным до 0:00). */
  clockTimeSec: number
  /** игровое время предыдущего тика; null на первом тике (edge ещё не с чем сравнить). */
  prevClockTimeSec: number | null
  /** текущий кулдаун байбека, сек (из hero.buyback_cooldown); undefined — нет данных. */
  buybackCooldownSec?: number | null
  /** кулдаун байбека на прошлом тике; для edge-детекта «стал доступен». */
  prevBuybackCooldownSec?: number | null
  /** id отключённых в настройках типов — не срабатывают (F3: тумблеры). */
  disabledEventIds?: ReadonlySet<string>
}

/** Сработавшее событие; планировщик превращает его в Advice. */
export interface TimingAlert {
  eventId: string
  labelRu: string
  severity: AdviceSeverity
  priority: number
  /** за сколько секунд до наступления предупреждаем (0 — по факту). */
  warnBeforeSec: number
  /** абсолютное игровое время наступления события, сек. */
  occurrenceSec: number
}

/** Ближайшее наступление события в будущем (для панели-таймера). */
export interface UpcomingTimingEvent {
  eventId: string
  labelRu: string
  occurrenceSec: number
  /** сколько секунд до наступления от текущего clock_time (≥ 0). */
  secondsUntil: number
}

/**
 * Возвращает события, у которых момент предупреждения (occurrence − warnBefore)
 * пересечён окном (prevClockTime, clockTime]. На каждый тик по каждому событию
 * отдаётся не более одного алерта (самое позднее наступление в окне) — это
 * защищает от всплеска при скачке времени (реконнект/пауза).
 */
export function dueTimingAlerts(events: readonly TimingEvent[], ctx: TimingContext): TimingAlert[] {
  const alerts: TimingAlert[] = []
  for (const event of events) {
    if (ctx.disabledEventIds?.has(event.id)) {
      continue
    }
    if (event.schedule.kind === 'buyback') {
      const occurrence = buybackOccurrence(ctx)
      if (occurrence !== null) {
        alerts.push(toAlert(event, occurrence))
      }
      continue
    }
    if (ctx.prevClockTimeSec === null) {
      // Первый тик: нет предыдущего значения — не порождаем «прошлые» алерты.
      continue
    }
    const occurrence = lastOccurrenceInWindow(
      event,
      ctx.prevClockTimeSec,
      ctx.clockTimeSec
    )
    if (occurrence !== null) {
      alerts.push(toAlert(event, occurrence))
    }
  }
  return alerts
}

/**
 * Для каждого расписанного (не buyback) события — ближайшее наступление в момент
 * clockTimeSec или позже. События без будущих наступлений (все fixed-времена
 * прошли) опускаются. Результат отсортирован по времени наступления.
 */
export function upcomingTimingEvents(
  events: readonly TimingEvent[],
  clockTimeSec: number
): UpcomingTimingEvent[] {
  const upcoming: UpcomingTimingEvent[] = []
  for (const event of events) {
    const occurrence = nextOccurrence(event, clockTimeSec)
    if (occurrence !== null) {
      upcoming.push({
        eventId: event.id,
        labelRu: event.labelRu,
        occurrenceSec: occurrence,
        secondsUntil: occurrence - clockTimeSec
      })
    }
  }
  upcoming.sort((a, b) => a.occurrenceSec - b.occurrenceSec)
  return upcoming
}

/** Компактная сводка одного таймера для панели F5 (без internal occurrenceSec/eventId). */
export interface CompactPanelTimer {
  labelRu: string
  secondsUntil: number
}

/** Таймеры компактной панели (F5 режим 1, TASK-014): ближайшее событие вообще
 * и отдельно ближайшая руна (id события содержит 'rune' — water/power/bounty_runes,
 * см. content/timings.json). Ожидает уже отсортированный upcomingTimingEvents(). */
export interface CompactPanelTimers {
  nextEvent: CompactPanelTimer | null
  nextRune: CompactPanelTimer | null
}

export function selectCompactPanelTimers(upcoming: readonly UpcomingTimingEvent[]): CompactPanelTimers {
  const nextEvent = upcoming[0] ?? null
  const nextRune = upcoming.find((event) => event.eventId.includes('rune')) ?? null
  return {
    nextEvent: nextEvent ? { labelRu: nextEvent.labelRu, secondsUntil: nextEvent.secondsUntil } : null,
    nextRune: nextRune ? { labelRu: nextRune.labelRu, secondsUntil: nextRune.secondsUntil } : null
  }
}

function toAlert(event: TimingEvent, occurrenceSec: number): TimingAlert {
  return {
    eventId: event.id,
    labelRu: event.labelRu,
    severity: event.severity,
    priority: event.priority,
    warnBeforeSec: event.warnBeforeSec,
    occurrenceSec
  }
}

/**
 * Самое позднее наступление события, момент предупреждения которого попадает в
 * (prev, cur]. Возвращает occurrenceSec либо null.
 */
function lastOccurrenceInWindow(
  event: TimingEvent,
  prev: number,
  cur: number
): number | null {
  const { schedule, warnBeforeSec: warn } = event
  if (schedule.kind === 'fixed') {
    let best: number | null = null
    for (const occ of schedule.timesSec) {
      const trigger = occ - warn
      if (trigger > prev && trigger <= cur && (best === null || occ > best)) {
        best = occ
      }
    }
    return best
  }
  if (schedule.kind === 'buyback') {
    return null
  }
  // interval: occurrence_k = start + k*interval (k ≥ 0); trigger_k = occ − warn.
  // Ищем наибольший k, у которого trigger_k ≤ cur, и проверяем trigger_k > prev.
  const { intervalSec: step, startSec: start } = schedule
  const kHi = Math.floor((cur + warn - start) / step)
  if (kHi < 0) {
    return null
  }
  const occurrence = start + kHi * step
  const trigger = occurrence - warn
  return trigger > prev && trigger <= cur ? occurrence : null
}

/** Ближайшее наступление расписанного события в момент `at` или позже. */
function nextOccurrence(event: TimingEvent, at: number): number | null {
  const { schedule } = event
  if (schedule.kind === 'buyback') {
    return null
  }
  if (schedule.kind === 'fixed') {
    let best: number | null = null
    for (const occ of schedule.timesSec) {
      if (occ >= at && (best === null || occ < best)) {
        best = occ
      }
    }
    return best
  }
  const { intervalSec: step, startSec: start } = schedule
  const k = Math.max(0, Math.ceil((at - start) / step))
  return start + k * step
}

/**
 * Байбек «стал доступен»: кулдаун на прошлом тике был > 0, а на текущем ≤ 0.
 * Требует обоих значений (иначе edge не определить). occurrence = текущий clock.
 */
function buybackOccurrence(ctx: TimingContext): number | null {
  const prev = ctx.prevBuybackCooldownSec
  const cur = ctx.buybackCooldownSec
  if (prev === null || prev === undefined || cur === null || cur === undefined) {
    return null
  }
  return prev > 0 && cur <= 0 ? ctx.clockTimeSec : null
}
