import type { JSX } from 'react'
import { formatClockTime } from '@shared/index'
import { selectRuneTimerEvent } from '@shared/widgets/selectPresetTimingEvent'
import { useUpcomingTimings } from './useUpcomingTimings'
import { WidgetRow } from './WidgetRow'

/**
 * Именованный пресет "таймер ближайшей руны" (F5, TASK-016) — обратный отсчёт
 * до ближайшей из водной/силы/богатства руны (см. selectRuneTimerEvent).
 * В отличие от дженерик-виджета сырого поля, у пресета есть собственная логика
 * выбора события, а не просто чтение одного поля по fieldPath.
 */
export function RuneTimerWidget(): JSX.Element {
  const upcoming = useUpcomingTimings()
  const event = selectRuneTimerEvent(upcoming)
  return <WidgetRow label={event?.labelRu ?? 'Ближайшая руна'} value={event ? formatClockTime(event.secondsUntil) : '—'} />
}
