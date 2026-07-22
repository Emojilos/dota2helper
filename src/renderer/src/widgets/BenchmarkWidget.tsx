import type { JSX } from 'react'
import { selectBenchmarkComparison, type BenchmarkMetric, type BenchmarkStatus } from '@shared/widgets/selectBenchmarkComparison'
import { useGsiRawSnapshot } from './useGsiRawSnapshot'
import { useBenchmarksConfig } from './useBenchmarksConfig'

const METRIC_LABELS_RU: Record<BenchmarkMetric, string> = {
  lh: 'Добито',
  networth: 'Net worth',
  xp: 'Опыт'
}

/** Зелёный опережаешь / жёлтый в норме / красный отстаёшь (раздел F5 PRD, живой цвет как у уведомлений TASK-015). */
const STATUS_COLORS_RU: Record<BenchmarkStatus, string> = {
  ahead: 'text-emerald-400',
  onPar: 'text-amber-300',
  behind: 'text-rose-400'
}

/**
 * Бенчмарк-виджет (F5, TASK-039) — именованный пресет конструктора виджетов:
 * live-сравнение текущего показателя героя с эталонной кривой content/benchmarks.json
 * (TASK-038) на текущей игровой минуте, в стиле Dota Plus ("LH: 45 / норма 52").
 * Три виджета (LH/networth/XP) параметризуются `metric`, вся логика сравнения —
 * чистая selectBenchmarkComparison (@shared/widgets/), сам компонент только
 * подписывается на живые данные (gsiRaw:update, benchmarks:get) и рисует.
 *
 * "—" вместо значения, пока герой не выбран/поле не пришло с GSI/бенчмарков
 * для этого героя нет в конфиге (см. selectBenchmarkComparison, возвращает null).
 * `approximate` (networth — оценка из gold_from_*, сама кривая benchmarks.json
 * всегда approximate, TASK-038) отражается суффиксом "≈", а не отдельным
 * DataFreshnessBadge (TASK-029) — это другой вид приближённости, не источник/
 * давность данных.
 */
export function BenchmarkWidget({ metric }: { metric: BenchmarkMetric }): JSX.Element {
  const snapshot = useGsiRawSnapshot()
  const benchmarks = useBenchmarksConfig()
  const comparison = snapshot ? selectBenchmarkComparison(benchmarks, snapshot, metric) : null

  const label = METRIC_LABELS_RU[metric]
  if (!comparison) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
        <span className="truncate text-slate-400">{label}</span>
        <span className="shrink-0 font-medium text-slate-100">—</span>
      </div>
    )
  }

  const approxMark = comparison.approximate ? ' ≈' : ''
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
      <span className="truncate text-slate-400">{label}</span>
      <span className={`shrink-0 font-medium ${STATUS_COLORS_RU[comparison.status]}`}>
        {Math.round(comparison.current)} / норма {Math.round(comparison.p50)}
        {approxMark}
      </span>
    </div>
  )
}
