/**
 * Тесты TimingScheduler (main, F3, TASK-012) — сторона эффектов вокруг чистого
 * движка engine/timings.
 *
 * Покрывают test_step'ы, не требующие живого матча:
 *  - поток тиков GSI → уведомления в нужные моменты (эквивалент прогона матча);
 *  - отключение типа в настройках → уведомления перестают приходить (шаг 3);
 *  - смена конфига между тиками (hot-reload warnBeforeSec) применяется без
 *    перезапуска (эквивалент шага 4, без реального fs.watch);
 *  - скачок игрового времени назад (новый матч/реплей) не порождает ложных
 *    «прошлых» событий;
 *  - байбек-edge из hero.buybackCooldown.
 */
import { describe, expect, it } from 'vitest'
import { GameStateStore } from '@main/gsi'
import { TimingScheduler } from '@main/timings'
import type { Advice } from '@shared/schemas/advice'
import type { GameState } from '@shared/schemas/gameState'
import type { TimingsConfig } from '@shared/schemas/timings'

/** Минимальный GameState для планировщика (он читает только map.clockTime и hero). */
function state(clockTimeSec: number, buybackCooldownSec?: number): GameState {
  return {
    map: { clockTime: clockTimeSec },
    hero: buybackCooldownSec === undefined ? undefined : { buybackCooldown: buybackCooldownSec }
  } as unknown as GameState
}

function makeConfig(events: TimingsConfig['events']): TimingsConfig {
  return { patch: 'test', events }
}

const waterRunes: TimingsConfig['events'][number] = {
  id: 'water_runes',
  labelRu: 'Руны воды',
  severity: 'timing',
  priority: 3,
  schedule: { kind: 'fixed', timesSec: [120, 240] },
  warnBeforeSec: 20,
  enabledByDefault: true
}

interface Harness {
  store: GameStateStore
  scheduler: TimingScheduler
  alerts: Advice[]
}

function harness(
  getEvents: () => TimingsConfig | null,
  getDisabledEventIds?: () => ReadonlySet<string>
): Harness {
  const store = new GameStateStore()
  const alerts: Advice[] = []
  let seq = 0
  const scheduler = new TimingScheduler({
    store,
    getEvents,
    onAlert: (advice) => alerts.push(advice),
    getDisabledEventIds,
    now: () => 1_000,
    idFactory: () => `advice_${seq++}`
  })
  scheduler.start()
  return { store, scheduler, alerts }
}

describe('TimingScheduler', () => {
  it('поток тиков GSI даёт уведомление о рунах воды в нужный момент', () => {
    const { store, alerts } = harness(() => makeConfig([waterRunes]))
    store.set(state(90)) // первый тик — истории нет, алертов нет
    store.set(state(101)) // окно (90,101] покрывает триггер 100 (occ 120)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      ruleId: 'timing:water_runes',
      severity: 'timing',
      priority: 3,
      estimated: false
    })
    expect(alerts[0]?.message).toContain('через 20 сек')
  })

  it('отключённый в настройках тип не порождает уведомлений (шаг 3)', () => {
    const disabled = new Set(['water_runes'])
    const { store, alerts } = harness(() => makeConfig([waterRunes]), () => disabled)
    store.set(state(90))
    store.set(state(101))
    expect(alerts).toHaveLength(0)
  })

  it('смена конфига между тиками применяется без перезапуска (эквивалент hot-reload warnBeforeSec)', () => {
    let config = makeConfig([{ ...waterRunes, warnBeforeSec: 20 }])
    const { store, alerts } = harness(() => config)
    store.set(state(50)) // первый тик, история
    store.set(state(60)) // окно (50,60] — с warn=20 триггер 100, ещё не крест
    // Правка timings.json: warnBeforeSec 20 → 40, триггер сдвигается на 80.
    config = makeConfig([{ ...waterRunes, warnBeforeSec: 40 }])
    store.set(state(79)) // окно (60,79] — триггер 80 ещё не пересечён
    expect(alerts).toHaveLength(0)
    store.set(state(81)) // окно (79,81] пересекает новый триггер 80 (occ 120)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.message).toContain('через 40 сек')
  })

  it('скачок игрового времени назад (новый матч) не порождает лавины ложных прошлых событий', () => {
    const { store, alerts } = harness(() => makeConfig([waterRunes]))
    store.set(state(300)) // первый тик поздней игры (baseline)
    store.set(state(0)) // время прыгнуло назад → история сбрасывается, лавины нет
    // Ключевое: сам скачок не «пробегает» окно (0,300] и не сыплет прошлыми рунами.
    expect(alerts).toHaveLength(0)
    // После сброса детект возобновляется штатно от новой базы (свежий матч):
    store.set(state(101)) // окно (0,101] пересекает триггер 100 (occ 120) → 1 алерт
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.ruleId).toBe('timing:water_runes')
  })

  it('нет карты (map=null) — история не ведётся, без падений', () => {
    const { store, alerts } = harness(() => makeConfig([waterRunes]))
    store.set({ map: null } as unknown as GameState)
    store.set(state(101))
    store.set(state(102))
    expect(alerts).toHaveLength(0)
  })

  it('байбек стал доступен → уведомление', () => {
    const buyback: TimingsConfig['events'][number] = {
      id: 'buyback_ready',
      labelRu: 'Байбек снова доступен',
      severity: 'opportunity',
      priority: 4,
      schedule: { kind: 'buyback' },
      warnBeforeSec: 0,
      enabledByDefault: true
    }
    const { store, alerts } = harness(() => makeConfig([buyback]))
    store.set(state(600, 5)) // первый тик — история кулдауна фиксируется
    store.set(state(605, 0)) // 5 → 0: байбек доступен
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.ruleId).toBe('timing:buyback_ready')
  })

  it('stop() снимает подписку — дальнейшие тики игнорируются', () => {
    const { store, scheduler, alerts } = harness(() => makeConfig([waterRunes]))
    store.set(state(90))
    scheduler.stop()
    store.set(state(101))
    expect(alerts).toHaveLength(0)
  })

  it('нет конфига (null) — тик безопасен', () => {
    const { store, alerts } = harness(() => null)
    store.set(state(90))
    store.set(state(101))
    expect(alerts).toHaveLength(0)
  })
})
