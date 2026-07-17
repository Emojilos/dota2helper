/**
 * Тесты CacheWarmer (TASK-025): последовательный прогрев кэша матчапов по
 * списку героев меты. Фейковый DataSource вместо реального DataService —
 * позволяет детерминированно смоделировать ok/no-data/throw для конкретных
 * героев и проверить, что прогрев не прерывается ошибкой одного из них.
 */
import { describe, expect, it } from 'vitest'
import { CacheWarmer, type CacheWarmerDataSource, type CacheWarmerProgress } from '@main/data/CacheWarmer'
import type { DataResult } from '@shared/types/dataResult'
import type { MatchupData } from '@shared/schemas/stratzDto'

const SCOPE = { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }

function okResult(heroId: number): DataResult<MatchupData[]> {
  return {
    status: 'ok',
    data: [{ heroId, otherHeroId: 11, relation: 'vs', winrate: 0.5, sampleSize: 100, ...SCOPE }],
    source: 'stratz',
    fetchedAt: new Date().toISOString(),
    stale: false
  }
}

function noDataResult(): DataResult<MatchupData[]> {
  return { status: 'no-data', source: 'none', fetchedAt: null, stale: true, reason: 'no source available' }
}

describe('CacheWarmer', () => {
  it('warms every hero in the list sequentially and reports ok progress', async () => {
    const calls: number[] = []
    const source: CacheWarmerDataSource = {
      getHeroMatchups: async (heroId) => {
        calls.push(heroId)
        return okResult(heroId)
      }
    }
    const progress: CacheWarmerProgress[] = []
    const warmer = new CacheWarmer(source, [1, 2, 3], SCOPE, {
      onProgress: (p) => progress.push(p)
    })

    await warmer.run()

    expect(calls).toEqual([1, 2, 3])
    expect(progress).toEqual([
      { completed: 1, total: 3, heroId: 1, status: 'ok' },
      { completed: 2, total: 3, heroId: 2, status: 'ok' },
      { completed: 3, total: 3, heroId: 3, status: 'ok' }
    ])
  })

  it('reports no-data status without throwing when DataService has no data for a hero', async () => {
    const source: CacheWarmerDataSource = {
      getHeroMatchups: async () => noDataResult()
    }
    const progress: CacheWarmerProgress[] = []
    const warmer = new CacheWarmer(source, [42], SCOPE, { onProgress: (p) => progress.push(p) })

    await warmer.run()

    expect(progress).toEqual([{ completed: 1, total: 1, heroId: 42, status: 'no-data' }])
  })

  it('continues warming remaining heroes after one hero throws', async () => {
    const calls: number[] = []
    const source: CacheWarmerDataSource = {
      getHeroMatchups: async (heroId) => {
        calls.push(heroId)
        if (heroId === 2) {
          throw new Error('network timeout')
        }
        return okResult(heroId)
      }
    }
    const progress: CacheWarmerProgress[] = []
    const warmer = new CacheWarmer(source, [1, 2, 3], SCOPE, { onProgress: (p) => progress.push(p) })

    await warmer.run()

    expect(calls).toEqual([1, 2, 3])
    expect(progress.map((p) => p.status)).toEqual(['ok', 'error', 'ok'])
  })

  it('handles an empty hero list without invoking progress callbacks', async () => {
    const source: CacheWarmerDataSource = {
      getHeroMatchups: async () => okResult(1)
    }
    const progress: CacheWarmerProgress[] = []
    const warmer = new CacheWarmer(source, [], SCOPE, { onProgress: (p) => progress.push(p) })

    await warmer.run()

    expect(progress).toEqual([])
  })
})
