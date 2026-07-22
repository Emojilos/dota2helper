/**
 * selectBenchmarkComparison — сравнение текущих LH/networth/XP героя с
 * эталонными кривыми content/benchmarks.json (F5, TASK-039, TASK-038) для
 * бенчмарк-виджетов конструктора (в стиле Dota Plus). Renderer не может
 * импортировать engine/** для сложной логики (INV1 ограничивает только
 * rules/draft/facts/timings, но по духу F5-конструктор уже держит такую
 * логику в shared, см. selectPresetTimingEvent.ts) — здесь чистая функция,
 * которую видят и main (если понадобится), и renderer.
 *
 * Источник текущих значений — WidgetGsiSnapshot (см. @shared/schemas/gsiRawSnapshot,
 * resolveFieldPath) — тот же санитизированный срез сырого GSI-пакета, что уже
 * питает дженерик-рендерер полей каталога (TASK-016). `net_worth` живым GSI не
 * отдаётся (docs/gsi-fields.md, TASK-009: поле только в наблюдательском
 * формате) — здесь используется честная оценка: сумма `player.gold_from_*`
 * (всё заработанное золото за матч, включая уже потраченное на предметы) как
 * приближение networth. Она НЕ учитывает потери голды со смертей
 * (gold_lost_to_death тоже недоступен игроку) — оценка помечена `approximate`
 * независимо от того, приближённая ли сама кривая benchmarks.json.
 *
 * INV2: модуль чист (без electron/react/fs/сети).
 */
import type { BenchmarkPoint, BenchmarksConfig } from '../schemas/benchmarks'
import type { WidgetGsiSnapshot } from '../schemas/gsiRawSnapshot'
import { resolveFieldPath } from '../gsi/resolveFieldPath'

export type BenchmarkMetric = 'lh' | 'networth' | 'xp'
export type BenchmarkStatus = 'ahead' | 'onPar' | 'behind'

export interface BenchmarkComparison {
  current: number
  p50: number
  p75: number
  status: BenchmarkStatus
  /** true, если эталонная кривая приближённая (сейчас всегда, TASK-038) ИЛИ current сам — оценка (networth). */
  approximate: boolean
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

/** Оценка networth: сумма всех gold_from_* полей player (см. doc-комментарий модуля). */
function estimateNetWorth(snapshot: WidgetGsiSnapshot): number | null {
  const sources = [
    'player.gold_from_hero_kills',
    'player.gold_from_creep_kills',
    'player.gold_from_summon_kills',
    'player.gold_from_income',
    'player.gold_from_shared'
  ]
  let total = 0
  let sawAny = false
  for (const path of sources) {
    const num = toFiniteNumber(resolveFieldPath(snapshot, path))
    if (num !== null) {
      total += num
      sawAny = true
    }
  }
  return sawAny ? total : null
}

function currentValue(snapshot: WidgetGsiSnapshot, metric: BenchmarkMetric): number | null {
  switch (metric) {
    case 'lh':
      return toFiniteNumber(resolveFieldPath(snapshot, 'player.last_hits'))
    case 'xp':
      return toFiniteNumber(resolveFieldPath(snapshot, 'hero.xp'))
    case 'networth':
      return estimateNetWorth(snapshot)
  }
}

function findBenchmarkPoint(benchmarks: BenchmarksConfig, heroId: number, minute: number): BenchmarkPoint | null {
  const forHero = benchmarks.filter((point) => point.hero_id === heroId)
  if (forHero.length === 0) {
    return null
  }
  const maxMinute = forHero.reduce((max, point) => Math.max(max, point.minute), 0)
  const clampedMinute = Math.min(Math.max(minute, 0), maxMinute)
  return forHero.find((point) => point.minute === clampedMinute) ?? null
}

/**
 * Возвращает сравнение для указанной метрики или null, если данных для
 * текущего героя/показателя ещё нет (герой не выбран, поле не пришло с GSI,
 * бенчмарков для этого hero_id нет в конфиге).
 */
export function selectBenchmarkComparison(
  benchmarks: BenchmarksConfig,
  snapshot: WidgetGsiSnapshot,
  metric: BenchmarkMetric
): BenchmarkComparison | null {
  const heroId = toFiniteNumber(resolveFieldPath(snapshot, 'hero.id'))
  const clockTime = toFiniteNumber(resolveFieldPath(snapshot, 'map.clock_time'))
  const current = currentValue(snapshot, metric)
  if (heroId === null || clockTime === null || current === null) {
    return null
  }
  const minute = Math.floor(clockTime / 60)
  const point = findBenchmarkPoint(benchmarks, heroId, minute)
  if (point === null) {
    return null
  }
  const p50 = point[`${metric}_p50`]
  const p75 = point[`${metric}_p75`]
  const status: BenchmarkStatus = current >= p75 ? 'ahead' : current >= p50 ? 'onPar' : 'behind'
  return { current, p50, p75, status, approximate: point.approximate || metric === 'networth' }
}
