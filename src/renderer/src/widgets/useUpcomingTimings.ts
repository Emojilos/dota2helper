import { useEffect, useState } from 'react'
import type { TimingUpcomingEventPayload } from '@shared/types/ipc'

/**
 * Подписка на timings:upcoming (F5, TASK-016) — полный список ближайших
 * наступлений всех тайминг-событий, используется именованными пресетами
 * реестра виджетов (RuneTimerWidget/StackCounterWidget).
 */
export function useUpcomingTimings(): TimingUpcomingEventPayload[] {
  const [events, setEvents] = useState<TimingUpcomingEventPayload[]>([])

  useEffect(() => {
    return window.midmind.on('timings:upcoming', setEvents)
  }, [])

  return events
}
