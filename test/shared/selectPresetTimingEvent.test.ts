/**
 * selectPresetTimingEvent (F5, TASK-016): выбор ближайшего события для
 * пресетов rune-timer/stack-counter из полного списка timings:upcoming —
 * независимая от engine/timings реализация (renderer не может импортировать
 * engine/timings, INV1), логика должна давать те же результаты, что
 * selectCompactPanelTimers (engine/timings, TASK-014) на тех же входных данных.
 */
import { describe, expect, it } from 'vitest'
import { selectRuneTimerEvent, selectStackCounterEvent } from '@shared/widgets/selectPresetTimingEvent'
import type { TimingUpcomingEventPayload } from '@shared/types/ipc'

const EVENTS: TimingUpcomingEventPayload[] = [
  { eventId: 'water_runes', labelRu: 'Руны воды', secondsUntil: 40 },
  { eventId: 'power_runes', labelRu: 'Руны силы', secondsUntil: 15 },
  { eventId: 'camp_stack', labelRu: 'Стак кемпа (xx:53)', secondsUntil: 7 },
  { eventId: 'day_night', labelRu: 'Смена дня и ночи', secondsUntil: 200 }
]

describe('selectRuneTimerEvent', () => {
  it('выбирает ближайшую руну среди нескольких видов рун', () => {
    expect(selectRuneTimerEvent(EVENTS)).toEqual(EVENTS[1])
  })

  it('возвращает null, если рун нет в списке', () => {
    expect(selectRuneTimerEvent(EVENTS.filter((event) => !event.eventId.includes('rune')))).toBeNull()
  })
})

describe('selectStackCounterEvent', () => {
  it('выбирает событие camp_stack', () => {
    expect(selectStackCounterEvent(EVENTS)).toEqual(EVENTS[2])
  })

  it('возвращает null, если camp_stack нет в списке', () => {
    expect(selectStackCounterEvent(EVENTS.filter((event) => event.eventId !== 'camp_stack'))).toBeNull()
  })
})
