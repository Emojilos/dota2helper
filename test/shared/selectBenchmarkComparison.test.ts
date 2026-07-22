/**
 * selectBenchmarkComparison (F5, TASK-039): сравнение текущих LH/networth/XP
 * с эталонной кривой benchmarks.json на текущей минуте, включая оценку
 * networth из player.gold_from_* (net_worth недоступен живому GSI, TASK-009).
 */
import { describe, expect, it } from 'vitest'
import { selectBenchmarkComparison } from '@shared/widgets/selectBenchmarkComparison'
import type { BenchmarksConfig } from '@shared/schemas/benchmarks'
import type { WidgetGsiSnapshot } from '@shared/schemas/gsiRawSnapshot'

const BENCHMARKS: BenchmarksConfig = [
  {
    hero_id: 1,
    minute: 5,
    lh_p50: 30,
    lh_p75: 40,
    networth_p50: 2000,
    networth_p75: 2600,
    xp_p50: 3000,
    xp_p75: 3800,
    rank_bracket: 'ARCHON_TO_ANCIENT',
    patch: '7.39',
    approximate: true
  },
  {
    hero_id: 1,
    minute: 10,
    lh_p50: 60,
    lh_p75: 75,
    networth_p50: 4000,
    networth_p75: 5200,
    xp_p50: 6000,
    xp_p75: 7600,
    rank_bracket: 'ARCHON_TO_ANCIENT',
    patch: '7.39',
    approximate: true
  }
]

function snapshotAt(overrides: {
  heroId?: number
  clockTime?: number
  lastHits?: number
  xp?: number
  goldFrom?: Partial<Record<'hero_kills' | 'creep_kills' | 'summon_kills' | 'income' | 'shared', number>>
}): WidgetGsiSnapshot {
  const gold = overrides.goldFrom ?? {}
  return {
    hero: { id: overrides.heroId ?? 1, xp: overrides.xp },
    map: { clock_time: overrides.clockTime ?? 300 },
    player: {
      last_hits: overrides.lastHits,
      gold_from_hero_kills: gold.hero_kills,
      gold_from_creep_kills: gold.creep_kills,
      gold_from_summon_kills: gold.summon_kills,
      gold_from_income: gold.income,
      gold_from_shared: gold.shared
    }
  }
}

describe('selectBenchmarkComparison', () => {
  it('lh: возвращает ahead, когда текущее значение ≥ p75 на точной минуте', () => {
    const snapshot = snapshotAt({ clockTime: 300, lastHits: 45 })
    const result = selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')
    expect(result).toEqual({ current: 45, p50: 30, p75: 40, status: 'ahead', approximate: true })
  })

  it('lh: onPar между p50 и p75', () => {
    const snapshot = snapshotAt({ clockTime: 300, lastHits: 35 })
    expect(selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')?.status).toBe('onPar')
  })

  it('lh: behind ниже p50', () => {
    const snapshot = snapshotAt({ clockTime: 300, lastHits: 10 })
    expect(selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')?.status).toBe('behind')
  })

  it('xp: читает hero.xp и сравнивает с xp_p50/p75', () => {
    const snapshot = snapshotAt({ clockTime: 600, xp: 6500 })
    const result = selectBenchmarkComparison(BENCHMARKS, snapshot, 'xp')
    expect(result).toEqual({ current: 6500, p50: 6000, p75: 7600, status: 'onPar', approximate: true })
  })

  it('networth: оценивается суммой gold_from_* и всегда помечена approximate', () => {
    const snapshot = snapshotAt({
      clockTime: 300,
      goldFrom: { hero_kills: 500, creep_kills: 1200, summon_kills: 0, income: 900, shared: 0 }
    })
    const result = selectBenchmarkComparison(BENCHMARKS, snapshot, 'networth')
    expect(result).toEqual({ current: 2600, p50: 2000, p75: 2600, status: 'ahead', approximate: true })
  })

  it('минута сверх максимальной в конфиге — клэмпится на последнюю доступную точку героя', () => {
    const snapshot = snapshotAt({ clockTime: 20 * 60, lastHits: 80 })
    const result = selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')
    expect(result).toEqual({ current: 80, p50: 60, p75: 75, status: 'ahead', approximate: true })
  })

  it('возвращает null, если герой не выбран (hero.id отсутствует)', () => {
    const snapshot: WidgetGsiSnapshot = { map: { clock_time: 300 }, player: { last_hits: 10 } }
    expect(selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')).toBeNull()
  })

  it('возвращает null, если нужное поле ещё не пришло с GSI', () => {
    const snapshot = snapshotAt({ clockTime: 300 })
    expect(selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')).toBeNull()
  })

  it('возвращает null, если для hero_id нет бенчмарков в конфиге', () => {
    const snapshot = snapshotAt({ heroId: 999, clockTime: 300, lastHits: 10 })
    expect(selectBenchmarkComparison(BENCHMARKS, snapshot, 'lh')).toBeNull()
  })
})
