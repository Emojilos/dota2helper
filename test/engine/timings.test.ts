/**
 * Юнит-тесты чистого ядра engine/timings (F3, TASK-012).
 *
 * Покрывают test_step 1 задачи: события due рассчитываются верно по фикстурам
 * clock_time (руны воды 2:00/4:00, руны силы с 6:00, стак xx:53), срабатывают
 * РОВНО один раз на пересечение окна, не порождаются на первом тике, отключённые
 * типы не срабатывают, байбек детектируется по edge кулдауна. Плюс проверка, что
 * реальный content/timings.json содержит все события таблицы F3 и валиден схемой.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  dueTimingAlerts,
  upcomingTimingEvents,
  type TimingContext
} from '@engine/timings'
import { TimingsConfigSchema, type TimingEvent } from '@shared/schemas/timings'

/** Мини-конструктор события расписания для локальных сценариев. */
function fixedEvent(id: string, timesSec: number[], warnBeforeSec = 0): TimingEvent {
  return {
    id,
    labelRu: id,
    severity: 'timing',
    priority: 3,
    schedule: { kind: 'fixed', timesSec },
    warnBeforeSec,
    enabledByDefault: true
  }
}

function intervalEvent(
  id: string,
  intervalSec: number,
  startSec: number,
  warnBeforeSec = 0
): TimingEvent {
  return {
    id,
    labelRu: id,
    severity: 'timing',
    priority: 3,
    schedule: { kind: 'interval', intervalSec, startSec },
    warnBeforeSec,
    enabledByDefault: true
  }
}

function buybackEvent(id: string): TimingEvent {
  return {
    id,
    labelRu: id,
    severity: 'opportunity',
    priority: 4,
    schedule: { kind: 'buyback' },
    warnBeforeSec: 0,
    enabledByDefault: true
  }
}

function ctx(prev: number | null, cur: number, extra: Partial<TimingContext> = {}): TimingContext {
  return { clockTimeSec: cur, prevClockTimeSec: prev, ...extra }
}

describe('dueTimingAlerts — fixed schedule', () => {
  it('срабатывает при пересечении момента предупреждения (руны воды 2:00, warn 20 → триггер 100)', () => {
    const events = [fixedEvent('water', [120, 240], 20)]
    const alerts = dueTimingAlerts(events, ctx(99, 101))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ eventId: 'water', occurrenceSec: 120, warnBeforeSec: 20 })
  })

  it('не срабатывает, пока окно не дошло до момента предупреждения', () => {
    const events = [fixedEvent('water', [120, 240], 20)]
    expect(dueTimingAlerts(events, ctx(50, 60))).toHaveLength(0)
  })

  it('срабатывает ровно один раз (следующий тик того же события — пусто)', () => {
    const events = [fixedEvent('water', [120, 240], 20)]
    expect(dueTimingAlerts(events, ctx(99, 101))).toHaveLength(1)
    expect(dueTimingAlerts(events, ctx(101, 110))).toHaveLength(0)
  })

  it('при скачке через несколько наступлений отдаёт одно (самое позднее) наступление', () => {
    const events = [fixedEvent('water', [120, 240], 20)]
    // окно (99, 230] покрывает триггеры 100 (occ 120) и 220 (occ 240) → берём 240.
    const alerts = dueTimingAlerts(events, ctx(99, 230))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.occurrenceSec).toBe(240)
  })

  it('warn=0 (Tormentor) срабатывает ровно на моменте наступления', () => {
    const events = [fixedEvent('tormentor', [1200], 0)]
    expect(dueTimingAlerts(events, ctx(1199, 1200))).toHaveLength(1)
    expect(dueTimingAlerts(events, ctx(1200, 1201))).toHaveLength(0)
  })
})

describe('dueTimingAlerts — interval schedule', () => {
  it('стак кемпа xx:53 (interval 60 от 53, warn 10 → триггер xx:43)', () => {
    const events = [intervalEvent('stack', 60, 53, 10)]
    // первое наступление 53, триггер 43
    expect(dueTimingAlerts(events, ctx(42, 44))[0]).toMatchObject({ occurrenceSec: 53 })
    // следующее наступление 113, триггер 103
    expect(dueTimingAlerts(events, ctx(102, 104))[0]).toMatchObject({ occurrenceSec: 113 })
    // между триггерами — тишина
    expect(dueTimingAlerts(events, ctx(60, 90))).toHaveLength(0)
  })

  it('руны силы: interval 360 от 6:00, warn 30 → первый триггер 330 (occ 360)', () => {
    const events = [intervalEvent('power', 360, 360, 30)]
    expect(dueTimingAlerts(events, ctx(329, 331))[0]).toMatchObject({ occurrenceSec: 360 })
    expect(dueTimingAlerts(events, ctx(689, 691))[0]).toMatchObject({ occurrenceSec: 720 })
  })

  it('не срабатывает до первого наступления интервала', () => {
    const events = [intervalEvent('power', 360, 360, 30)]
    expect(dueTimingAlerts(events, ctx(0, 100))).toHaveLength(0)
  })
})

describe('dueTimingAlerts — общие правила', () => {
  it('первый тик (prevClockTime === null) не порождает алертов', () => {
    const events = [fixedEvent('water', [120], 20)]
    expect(dueTimingAlerts(events, ctx(null, 500))).toHaveLength(0)
  })

  it('отключённый тип не срабатывает', () => {
    const events = [fixedEvent('water', [120], 20)]
    const alerts = dueTimingAlerts(events, ctx(99, 101, { disabledEventIds: new Set(['water']) }))
    expect(alerts).toHaveLength(0)
  })
})

describe('dueTimingAlerts — buyback', () => {
  const events = [buybackEvent('buyback_ready')]

  it('срабатывает на edge: кулдаун был > 0, стал ≤ 0', () => {
    const alerts = dueTimingAlerts(
      events,
      ctx(600, 605, { prevBuybackCooldownSec: 3, buybackCooldownSec: 0 })
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ eventId: 'buyback_ready', occurrenceSec: 605 })
  })

  it('не срабатывает, пока кулдаун не дошёл до нуля', () => {
    expect(
      dueTimingAlerts(events, ctx(600, 605, { prevBuybackCooldownSec: 10, buybackCooldownSec: 5 }))
    ).toHaveLength(0)
  })

  it('не срабатывает без данных о кулдауне (edge не определить)', () => {
    expect(
      dueTimingAlerts(events, ctx(600, 605, { prevBuybackCooldownSec: null, buybackCooldownSec: 0 }))
    ).toHaveLength(0)
  })
})

describe('upcomingTimingEvents', () => {
  it('возвращает ближайшее будущее наступление каждого события, отсортировано по времени', () => {
    const events = [
      fixedEvent('water', [120, 240], 20),
      intervalEvent('stack', 60, 53, 10)
    ]
    const upcoming = upcomingTimingEvents(events, 100)
    // stack next = 113, water next = 120
    expect(upcoming.map((u) => u.eventId)).toEqual(['stack', 'water'])
    expect(upcoming[0]).toMatchObject({ occurrenceSec: 113, secondsUntil: 13 })
    expect(upcoming[1]).toMatchObject({ occurrenceSec: 120, secondsUntil: 20 })
  })

  it('исключает события без будущих наступлений (все fixed-времена прошли) и buyback', () => {
    const events = [fixedEvent('water', [120], 20), buybackEvent('buyback_ready')]
    expect(upcomingTimingEvents(events, 500)).toHaveLength(0)
  })
})

describe('content/timings.json (F3 — таблица событий MVP)', () => {
  const raw = readFileSync(resolve(__dirname, '../../content/timings.json'), 'utf-8')

  it('валиден по TimingsConfigSchema', () => {
    const parsed = TimingsConfigSchema.safeParse(JSON.parse(raw))
    expect(parsed.success).toBe(true)
  })

  it('содержит все тайминги таблицы F3 MVP', () => {
    const config = TimingsConfigSchema.parse(JSON.parse(raw))
    const ids = new Set(config.events.map((e) => e.id))
    for (const required of [
      'water_runes',
      'power_runes',
      'bounty_runes',
      'camp_stack',
      'day_night',
      'outpost_xp',
      'tormentor',
      'buyback_ready'
    ]) {
      expect(ids.has(required)).toBe(true)
    }
  })

  it('отвергает дублирующиеся id событий', () => {
    const bad = {
      patch: '7.39',
      events: [
        { id: 'dup', labelRu: 'a', schedule: { kind: 'fixed', timesSec: [1] }, warnBeforeSec: 0 },
        { id: 'dup', labelRu: 'b', schedule: { kind: 'fixed', timesSec: [2] }, warnBeforeSec: 0 }
      ]
    }
    expect(TimingsConfigSchema.safeParse(bad).success).toBe(false)
  })
})
