import { useEffect, useState } from 'react'
import type { BenchmarksConfig } from '@shared/schemas/benchmarks'

const EMPTY_BENCHMARKS: BenchmarksConfig = []

/**
 * content/benchmarks.json (F5, TASK-039) — invoke, а не push (тот же приём,
 * что useGsiFieldCatalog: конфиг меняется редко, не поток GSI).
 * Перезапрашивает актуальную версию при hot-reload конфига (config:reloaded,
 * name='benchmarks', TASK-011).
 */
export function useBenchmarksConfig(): BenchmarksConfig {
  const [benchmarks, setBenchmarks] = useState<BenchmarksConfig>(EMPTY_BENCHMARKS)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void window.midmind.invoke('benchmarks:get', undefined).then((result) => {
        if (!cancelled) {
          setBenchmarks(result)
        }
      })
    }
    load()
    const unsubscribe = window.midmind.on('config:reloaded', (payload) => {
      if (payload.name === 'benchmarks' && payload.status === 'ok') {
        load()
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return benchmarks
}
