/**
 * selectPresetTimingEvent — выбор ближайшего наступления события для именованных
 * пресетов конструктора виджетов F5 (rune-timer/stack-counter, TASK-016) из
 * полного списка timings:upcoming (TimingUpcomingEventPayload[], main —
 * upcomingTimingEvents()). Renderer НЕ может импортировать engine/timings
 * (INV1: src/engine/timings в списке запрещённых для renderer модулей) —
 * поэтому такая же по духу, но независимая от движка выборка живёт здесь, в
 * shared, куда renderer'у ходить можно.
 *
 * Логика совпадает с selectCompactPanelTimers (engine/timings, TASK-014) —
 * rune-timer берёт ближайшее событие, id которого содержит 'rune'
 * (water/power/bounty_runes, content/timings.json), stack-counter — событие
 * 'camp_stack'. Дублирование сознательное: два модуля решают одну и ту же
 * задачу по разные стороны границы main/renderer (INV1), общий код пришлось
 * бы тянуть через electron-чистый shared в любом случае — он здесь и есть.
 *
 * INV2: модуль чист (без electron/react/fs/сети).
 */
import type { TimingUpcomingEventPayload } from '../types/ipc'

export function selectRuneTimerEvent(
  events: readonly TimingUpcomingEventPayload[]
): TimingUpcomingEventPayload | null {
  return nearest(events.filter((event) => event.eventId.includes('rune')))
}

export function selectStackCounterEvent(
  events: readonly TimingUpcomingEventPayload[]
): TimingUpcomingEventPayload | null {
  return nearest(events.filter((event) => event.eventId === 'camp_stack'))
}

function nearest(events: readonly TimingUpcomingEventPayload[]): TimingUpcomingEventPayload | null {
  return events.reduce<TimingUpcomingEventPayload | null>(
    (best, event) => (best === null || event.secondsUntil < best.secondsUntil ? event : best),
    null
  )
}
