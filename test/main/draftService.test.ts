/**
 * Тесты DraftService (F1, TASK-028) — main-оркестратора скоринга кандидатов:
 * собирает пул кандидатов (исключая уже занятых героев), запрашивает
 * матчапы/личную статистику через фейковый DataSource и вызывает чистый
 * engine/draft.rankDraftCandidates для Meta- и Personal-ранжирований.
 */
import { describe, expect, it, vi } from 'vitest'
import { DraftService, type DraftServiceDataSource } from '@main/draft'
import { EMPTY_DRAFT_CONTEXT, type DraftContext } from '@shared/schemas/draft'
import type { MatchupData, HeroPoolEntry } from '@shared/schemas/stratzDto'
import type { DataResult } from '@shared/types/dataResult'

const SCOPE = { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }

function ok<T>(data: T): DataResult<T> {
  return { status: 'ok', data, source: 'cache', fetchedAt: '2026-01-01T00:00:00.000Z', stale: false }
}

function noData<T>(): DataResult<T> {
  return { status: 'no-data', source: 'none', fetchedAt: null, stale: true, reason: 'test' }
}

function matchup(partial: Partial<MatchupData> & Pick<MatchupData, 'heroId' | 'otherHeroId' | 'relation' | 'winrate'>): MatchupData {
  return { sampleSize: 100, patch: SCOPE.patch, rankBracket: SCOPE.rankBracket, ...partial }
}

describe('DraftService.computeRankings', () => {
  it('исключает уже занятых героев (свой/союзники/враги) из выдачи', async () => {
    const dataSource: DraftServiceDataSource = {
      getHeroMatchups: vi.fn(async () => noData<MatchupData[]>()),
      getHeroPool: vi.fn(async () => noData<HeroPoolEntry[]>())
    }
    const service = new DraftService(
      dataSource,
      () => ({ heroIds: [1, 2, 3, 4], scope: SCOPE }),
      (heroId) => `Hero ${heroId}`
    )
    const context: DraftContext = { ...EMPTY_DRAFT_CONTEXT, ownHeroId: 1, allyHeroIds: [2], enemyHeroIds: [3] }

    const rankings = await service.computeRankings(context, null)

    expect(rankings.meta.map((c) => c.heroId).sort()).toEqual([4])
    expect(rankings.personal.map((c) => c.heroId).sort()).toEqual([4])
  })

  it('Meta-ранжирование не учитывает personalWinrate, Personal — учитывает', async () => {
    const dataSource: DraftServiceDataSource = {
      getHeroMatchups: vi.fn(async () => ok<MatchupData[]>([])),
      getHeroPool: vi.fn(async () => ok<HeroPoolEntry[]>([{ heroId: 5, matchesCount: 20, winrate: 0.9, lastSyncedAtMs: 0 }]))
    }
    const service = new DraftService(dataSource, () => ({ heroIds: [5, 6], scope: SCOPE }), (heroId) => `Hero ${heroId}`)
    const context: DraftContext = EMPTY_DRAFT_CONTEXT

    const rankings = await service.computeRankings(context, 111)

    const metaHero5 = rankings.meta.find((c) => c.heroId === 5)!
    const personalHero5 = rankings.personal.find((c) => c.heroId === 5)!
    expect(metaHero5.personalWinrate).toBe(0.9) // поле присутствует для отображения
    expect(personalHero5.score).toBeGreaterThan(metaHero5.score) // но не влияет на score в Meta
  })

  it('без привязанного Steam ID (steamAccountId=null) getHeroPool не вызывается, personalWinrate=null', async () => {
    const getHeroPool = vi.fn(async () => ok<HeroPoolEntry[]>([{ heroId: 5, matchesCount: 20, winrate: 0.9, lastSyncedAtMs: 0 }]))
    const dataSource: DraftServiceDataSource = {
      getHeroMatchups: vi.fn(async () => ok<MatchupData[]>([])),
      getHeroPool
    }
    const service = new DraftService(dataSource, () => ({ heroIds: [5], scope: SCOPE }), (heroId) => `Hero ${heroId}`)

    const rankings = await service.computeRankings(EMPTY_DRAFT_CONTEXT, null)

    expect(getHeroPool).not.toHaveBeenCalled()
    expect(rankings.meta[0]?.personalWinrate).toBeNull()
  })

  it('counterScore учитывает открытые вражеские пики и удваивает вес мидера', async () => {
    const dataSource: DraftServiceDataSource = {
      getHeroMatchups: vi.fn(async (heroId: number) => {
        if (heroId === 10) {
          return ok<MatchupData[]>([
            matchup({ heroId: 10, otherHeroId: 17, relation: 'vs', winrate: 0.7 }),
            matchup({ heroId: 10, otherHeroId: 11, relation: 'vs', winrate: 0.3 })
          ])
        }
        return ok<MatchupData[]>([])
      }),
      getHeroPool: vi.fn(async () => noData<HeroPoolEntry[]>())
    }
    const service = new DraftService(dataSource, () => ({ heroIds: [10], scope: SCOPE }), (heroId) => `Hero ${heroId}`)
    const context: DraftContext = { ...EMPTY_DRAFT_CONTEXT, enemyHeroIds: [17, 11], enemyMidHeroId: 17 }

    const rankings = await service.computeRankings(context, null)

    const candidate = rankings.meta[0]!
    expect(candidate.heroId).toBe(10)
    expect(candidate.counterScore).toBeCloseTo((0.7 * 2 + 0.3 * 1) / 3, 6)
  })

  it('отказ getHeroMatchups для одного героя не прерывает построение остальных', async () => {
    const dataSource: DraftServiceDataSource = {
      getHeroMatchups: vi.fn(async (heroId: number) => {
        if (heroId === 1) {
          throw new Error('stratz down')
        }
        return ok<MatchupData[]>([])
      }),
      getHeroPool: vi.fn(async () => noData<HeroPoolEntry[]>())
    }
    const service = new DraftService(dataSource, () => ({ heroIds: [1, 2], scope: SCOPE }), (heroId) => `Hero ${heroId}`)

    const rankings = await service.computeRankings(EMPTY_DRAFT_CONTEXT, null)

    expect(rankings.meta.map((c) => c.heroId).sort()).toEqual([1, 2])
  })

  it('без сконфигурированного пула кандидатов возвращает пустые ранжирования', async () => {
    const dataSource: DraftServiceDataSource = {
      getHeroMatchups: vi.fn(),
      getHeroPool: vi.fn()
    }
    const service = new DraftService(dataSource, () => null, (heroId) => `Hero ${heroId}`)

    const rankings = await service.computeRankings(EMPTY_DRAFT_CONTEXT, null)

    expect(rankings).toEqual({ meta: [], personal: [] })
    expect(dataSource.getHeroMatchups).not.toHaveBeenCalled()
  })
})
