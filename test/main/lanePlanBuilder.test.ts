/**
 * Тесты LanePlanBuilder (F2, TASK-036). Фейковый LanePlanDataSource вместо
 * реального DataService (тот же приём, что CacheWarmer/AdviceGate тесты) —
 * позволяет детерминированно смоделировать known/unknown пару и деградацию
 * STRATZ→кэш без сети/SQLite.
 */
import { describe, expect, it } from 'vitest'
import { LanePlanBuilder, type LanePlanDataSource } from '@main/lane/LanePlanBuilder'
import type { DataResult } from '@shared/types/dataResult'
import type { BuildData, MatchupData } from '@shared/schemas/stratzDto'
import type { HeroProfilesConfig } from '@shared/schemas/heroProfiles'
import type { MatchupKnowledgeConfig } from '@shared/schemas/matchupKnowledge'

const SCOPE = { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }
const STORM_ID = 17
const VIPER_ID = 47
const UNKNOWN_ID = 999

const HERO_PROFILES: HeroProfilesConfig = {
  patch: '7.39',
  profiles: [
    {
      heroId: STORM_ID,
      ultIsKillWindow: true,
      powerSpikeLevels: [6, 7],
      aggressionPattern: 'all_in',
      typicalLevel6TimeSec: 360,
      notes: ''
    },
    {
      heroId: VIPER_ID,
      ultIsKillWindow: false,
      powerSpikeLevels: [1, 2],
      aggressionPattern: 'passive_farm',
      typicalLevel6TimeSec: 420,
      notes: ''
    }
  ]
}

const MATCHUP_KNOWLEDGE: MatchupKnowledgeConfig = {
  patch: '7.39',
  entries: [
    {
      heroId: STORM_ID,
      vsHeroId: VIPER_ID,
      doTips: ['Фарми джунгли под ультой', 'Разменивайся только после 6', 'Дави линию до пика силы'],
      avoidTips: ['Не стой под Nethertoxin', 'Не разменивайся до 6 уровня'],
      powerSpikes: [
        { side: 'my', level: 6, note: 'Ульта даёт мгновенное окно на килл' },
        { side: 'enemy', level: 1, note: 'Viper силён с первого уровня' }
      ],
      killWindows: [6, 7]
    }
  ]
}

function buildOk(data: BuildData[]): DataResult<BuildData[]> {
  return { status: 'ok', data, source: 'stratz', fetchedAt: new Date().toISOString(), stale: false }
}

function matchupOk(
  data: MatchupData[],
  overrides: { source?: 'stratz' | 'opendota' | 'cache'; stale?: boolean } = {}
): DataResult<MatchupData[]> {
  return {
    status: 'ok',
    data,
    source: overrides.source ?? 'stratz',
    fetchedAt: new Date().toISOString(),
    stale: overrides.stale ?? false
  }
}

function noData<T>(reason: string): DataResult<T> {
  return { status: 'no-data', source: 'none', fetchedAt: null, stale: true, reason }
}

function makeSource(overrides: Partial<LanePlanDataSource> = {}): LanePlanDataSource {
  return {
    getHeroBuilds: async () => buildOk([]),
    getHeroMatchups: async () => matchupOk([]),
    ...overrides
  }
}

describe('LanePlanBuilder', () => {
  it('assembles a full plan for a pair in the knowledge base (test_steps шаг 1)', async () => {
    const source = makeSource({
      getHeroBuilds: async (heroId, scope, vsHeroId) =>
        buildOk([
          { heroId, vsHeroId: vsHeroId ?? null, skillBuild: [1, 2, 1, 3], startingItems: [1, 2], winrate: 0.55, sampleSize: 500, patch: scope.patch }
        ]),
      getHeroMatchups: async (heroId) =>
        matchupOk([{ heroId, otherHeroId: VIPER_ID, relation: 'vs', winrate: 0.48, sampleSize: 1200, ...SCOPE }])
    })
    const builder = new LanePlanBuilder(source, () => HERO_PROFILES, () => MATCHUP_KNOWLEDGE)

    const plan = await builder.build(STORM_ID, VIPER_ID, SCOPE)

    expect(plan.hasKnowledge).toBe(true)
    expect(plan.knowledge?.doTips).toHaveLength(3)
    expect(plan.knowledge?.avoidTips).toHaveLength(2)
    expect(plan.build.status).toBe('ok')
    if (plan.build.status !== 'ok') throw new Error('unreachable')
    expect(plan.build.data?.patch).toBe('7.39')
    expect(plan.matchup.status).toBe('ok')
    if (plan.matchup.status !== 'ok') throw new Error('unreachable')
    expect(plan.matchup.data?.winrate).toBe(0.48)
    // knowledge-derived timing points carry notes (не голая статистика).
    const spike = plan.timingPlan.find((p) => p.kind === 'power_spike' && p.side === 'my')
    expect(spike?.note).toContain('Ульта')
    const killWindow = plan.timingPlan.find((p) => p.kind === 'kill_window')
    expect(killWindow?.value).toBe(6)
    // typicalLevel6TimeSec всегда присутствует для обеих сторон.
    expect(plan.timingPlan.some((p) => p.kind === 'level6' && p.side === 'my' && p.value === 360)).toBe(true)
    expect(plan.timingPlan.some((p) => p.kind === 'level6' && p.side === 'enemy' && p.value === 420)).toBe(true)
  })

  it('falls back to statistical data without invented texts for a pair outside the knowledge base (test_steps шаг 2)', async () => {
    const source = makeSource({
      getHeroBuilds: async (heroId, scope, vsHeroId) =>
        buildOk([{ heroId, vsHeroId: vsHeroId ?? null, skillBuild: [1], startingItems: [1], winrate: 0.5, sampleSize: 50, patch: scope.patch }]),
      getHeroMatchups: async (heroId) =>
        matchupOk([{ heroId, otherHeroId: UNKNOWN_ID, relation: 'vs', winrate: 0.52, sampleSize: 80, ...SCOPE }])
    })
    const builder = new LanePlanBuilder(source, () => HERO_PROFILES, () => MATCHUP_KNOWLEDGE)

    const plan = await builder.build(STORM_ID, UNKNOWN_ID, SCOPE)

    expect(plan.hasKnowledge).toBe(false)
    expect(plan.knowledge).toBeNull()
    // fallback: build + winrate пары ещё присутствуют...
    expect(plan.build.status).toBe('ok')
    expect(plan.matchup.status).toBe('ok')
    if (plan.matchup.status !== 'ok') throw new Error('unreachable')
    expect(plan.matchup.data?.winrate).toBe(0.52)
    // ...но пики силы — голая статистика hero-profiles, БЕЗ текстов (note).
    expect(plan.timingPlan.length).toBeGreaterThan(0)
    expect(plan.timingPlan.every((p) => p.note === undefined)).toBe(true)
    expect(plan.timingPlan.some((p) => p.kind === 'power_spike' && p.side === 'my' && p.value === 6)).toBe(true)
  })

  it('surfaces stale-cache matchup data via DataResult, while builds have no fallback path (test_steps шаг 3)', async () => {
    const source = makeSource({
      getHeroBuilds: async () => noData('STRATZ unavailable'),
      getHeroMatchups: async (heroId) =>
        matchupOk([{ heroId, otherHeroId: VIPER_ID, relation: 'vs', winrate: 0.5, sampleSize: 300, ...SCOPE }], {
          source: 'cache',
          stale: true
        })
    })
    const builder = new LanePlanBuilder(source, () => HERO_PROFILES, () => MATCHUP_KNOWLEDGE)

    const plan = await builder.build(STORM_ID, VIPER_ID, SCOPE)

    expect(plan.matchup.status).toBe('ok')
    if (plan.matchup.status !== 'ok') throw new Error('unreachable')
    expect(plan.matchup.source).toBe('cache')
    expect(plan.matchup.stale).toBe(true)
    // билды не имеют stale-фолбэка (см. заголовок LanePlanBuilder.ts) — явное no-data, не exception.
    expect(plan.build.status).toBe('no-data')
  })

  it('picks the build candidate with the largest sample size when multiple are returned', async () => {
    const source = makeSource({
      getHeroBuilds: async () =>
        buildOk([
          { heroId: STORM_ID, vsHeroId: VIPER_ID, skillBuild: [1], startingItems: [1], winrate: 0.6, sampleSize: 10, patch: '7.39' },
          { heroId: STORM_ID, vsHeroId: VIPER_ID, skillBuild: [2], startingItems: [2], winrate: 0.5, sampleSize: 900, patch: '7.39' }
        ])
    })
    const builder = new LanePlanBuilder(source, () => HERO_PROFILES, () => MATCHUP_KNOWLEDGE)

    const plan = await builder.build(STORM_ID, VIPER_ID, SCOPE)

    expect(plan.build.status).toBe('ok')
    if (plan.build.status !== 'ok') throw new Error('unreachable')
    expect(plan.build.data?.sampleSize).toBe(900)
  })

  it('never throws to the caller when the data source rejects', async () => {
    const source = makeSource({
      getHeroBuilds: async () => {
        throw new Error('network timeout')
      },
      getHeroMatchups: async () => {
        throw new Error('network timeout')
      }
    })
    const builder = new LanePlanBuilder(source, () => HERO_PROFILES, () => MATCHUP_KNOWLEDGE)

    const plan = await builder.build(STORM_ID, VIPER_ID, SCOPE)

    expect(plan.build.status).toBe('no-data')
    expect(plan.matchup.status).toBe('no-data')
  })

  it('degrades gracefully when hero profiles or matchup-knowledge configs are missing', async () => {
    const source = makeSource()
    const builder = new LanePlanBuilder(source, () => null, () => null)

    const plan = await builder.build(STORM_ID, VIPER_ID, SCOPE)

    expect(plan.myHeroProfile).toBeNull()
    expect(plan.enemyHeroProfile).toBeNull()
    expect(plan.hasKnowledge).toBe(false)
    expect(plan.timingPlan).toEqual([])
  })
})
