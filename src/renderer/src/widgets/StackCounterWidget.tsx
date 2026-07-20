import type { JSX } from 'react'
import { formatClockTime } from '@shared/index'
import { selectStackCounterEvent } from '@shared/widgets/selectPresetTimingEvent'
import { useUpcomingTimings } from './useUpcomingTimings'
import { WidgetRow } from './WidgetRow'

/**
 * Именованный пресет "счётчик стака кемпа" (F5, TASK-016) — обратный отсчёт до
 * следующего окна стака нейтралов (событие camp_stack, content/timings.json).
 */
export function StackCounterWidget(): JSX.Element {
  const upcoming = useUpcomingTimings()
  const event = selectStackCounterEvent(upcoming)
  return <WidgetRow label={event?.labelRu ?? 'Стак кемпа'} value={event ? formatClockTime(event.secondsUntil) : '—'} />
}
