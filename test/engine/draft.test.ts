/**
 * Юнит-тесты чистого ядра engine/draft (F1, TASK-027).
 *
 * Покрывают test_steps задачи: стадия драфта из map.gameState (HERO_SELECTION
 * → picking, следующее состояние → finalized, WAIT_FOR_PLAYERS_TO_LOAD →
 * сброс на idle для нового матча), ручной ввод пиков врага/союзников и роли
 * мидера (GSI не отдаёт пики команд игроку — docs/gsi-fields.md, TASK-009).
 */
import { describe, expect, it } from 'vitest'
import {
  applyDraftManualAction,
  deriveDraftStage,
  updateDraftContextFromGameState,
  scoreDraftCandidate,
  rankDraftCandidates,
  metaScoringWeights,
  DEFAULT_DRAFT_SCORING_WEIGHTS,
  type DraftCandidateData,
  type OpenDraftPicks
} from '@engine/draft'
import { EMPTY_DRAFT_CONTEXT, type DraftContext } from '@shared/schemas/draft'
import type { MatchupData } from '@shared/schemas/stratzDto'

const HERO_SELECTION = 'DOTA_GAMERULES_STATE_HERO_SELECTION'
const WAIT_FOR_PLAYERS = 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD'
const STRATEGY_TIME = 'DOTA_GAMERULES_STATE_STRATEGY_TIME'
const GAME_IN_PROGRESS = 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'

describe('deriveDraftStage', () => {
  it('переходит в picking на HERO_SELECTION', () => {
    expect(deriveDraftStage(HERO_SELECTION, 'idle', false)).toBe('picking')
  })

  it('переходит в finalized при выходе из picking в любое известное состояние', () => {
    expect(deriveDraftStage(STRATEGY_TIME, 'picking', true)).toBe('finalized')
    expect(deriveDraftStage(GAME_IN_PROGRESS, 'picking', true)).toBe('finalized')
  })

  it('сбрасывает в idle на WAIT_FOR_PLAYERS_TO_LOAD (новый матч)', () => {
    expect(deriveDraftStage(WAIT_FOR_PLAYERS, 'finalized', true)).toBe('idle')
  })

  it('finalized сразу, если свой герой уже известен, а стадия ещё idle (пропущенный тик HERO_SELECTION)', () => {
    expect(deriveDraftStage(GAME_IN_PROGRESS, 'idle', true)).toBe('finalized')
  })

  it('остаётся без изменений на неизвестном/null состоянии без нового героя', () => {
    expect(deriveDraftStage(null, 'idle', false)).toBe('idle')
  })
})

describe('updateDraftContextFromGameState', () => {
  it('фиксирует собственного героя, ещё находясь в HERO_SELECTION (hero.id становится известен раньше конца пика)', () => {
    const afterPick = updateDraftContextFromGameState(EMPTY_DRAFT_CONTEXT, HERO_SELECTION, 25, 1000)
    expect(afterPick.stage).toBe('picking')
    expect(afterPick.ownHeroId).toBe(25)
  })

  it('hero.id=0 не считается известным героем (ещё не выбран)', () => {
    const context = updateDraftContextFromGameState(EMPTY_DRAFT_CONTEXT, HERO_SELECTION, 0, 1000)
    expect(context.ownHeroId).toBeNull()
  })

  it('пересчёт происходит при каждом новом тике (обновляется updatedAtMs)', () => {
    const first = updateDraftContextFromGameState(EMPTY_DRAFT_CONTEXT, HERO_SELECTION, 25, 1000)
    const second = updateDraftContextFromGameState(first, STRATEGY_TIME, 25, 2000)
    expect(second.stage).toBe('finalized')
    expect(second.updatedAtMs).toBe(2000)
  })

  it('возвращает тот же объект (reference equality), если ничего не изменилось — не плодит лишние рассылки', () => {
    const first = updateDraftContextFromGameState(EMPTY_DRAFT_CONTEXT, HERO_SELECTION, 25, 1000)
    const second = updateDraftContextFromGameState(first, HERO_SELECTION, 25, 2000)
    expect(second).toBe(first)
  })

  it('сбрасывает ручные пики прошлого матча при возврате в WAIT_FOR_PLAYERS_TO_LOAD', () => {
    const withManualPicks: DraftContext = {
      ...EMPTY_DRAFT_CONTEXT,
      stage: 'finalized',
      ownHeroId: 25,
      enemyHeroIds: [1, 2],
      enemyMidHeroId: 1
    }
    const reset = updateDraftContextFromGameState(withManualPicks, WAIT_FOR_PLAYERS, 0, 3000)
    expect(reset).toEqual({ ...EMPTY_DRAFT_CONTEXT, updatedAtMs: 3000 })
  })
})

describe('applyDraftManualAction — ручной ввод пиков (GSI не видит пики команд)', () => {
  it('добавляет и удаляет союзника', () => {
    const added = applyDraftManualAction(EMPTY_DRAFT_CONTEXT, { type: 'addAlly', heroId: 5 }, 1000)
    expect(added.allyHeroIds).toEqual([5])
    const removed = applyDraftManualAction(added, { type: 'removeAlly', heroId: 5 }, 2000)
    expect(removed.allyHeroIds).toEqual([])
  })

  it('не добавляет дубликат врага и не превышает лимит 5', () => {
    let context = EMPTY_DRAFT_CONTEXT
    for (const heroId of [1, 2, 3, 4, 5]) {
      context = applyDraftManualAction(context, { type: 'addEnemy', heroId }, 1000)
    }
    expect(context.enemyHeroIds).toEqual([1, 2, 3, 4, 5])

    const duplicate = applyDraftManualAction(context, { type: 'addEnemy', heroId: 1 }, 2000)
    expect(duplicate).toBe(context)

    const overLimit = applyDraftManualAction(context, { type: 'addEnemy', heroId: 6 }, 2000)
    expect(overLimit).toBe(context)
  })

  it('задаёт роль вражеского мидера только среди уже открытых пиков врага', () => {
    const withEnemy = applyDraftManualAction(EMPTY_DRAFT_CONTEXT, { type: 'addEnemy', heroId: 17 }, 1000)
    const rejected = applyDraftManualAction(withEnemy, { type: 'setEnemyMid', heroId: 99 }, 2000)
    expect(rejected).toBe(withEnemy)

    const accepted = applyDraftManualAction(withEnemy, { type: 'setEnemyMid', heroId: 17 }, 2000)
    expect(accepted.enemyMidHeroId).toBe(17)
  })

  it('удаление вражеского мидера из enemyHeroIds сбрасывает enemyMidHeroId', () => {
    const withMid: DraftContext = { ...EMPTY_DRAFT_CONTEXT, enemyHeroIds: [17], enemyMidHeroId: 17 }
    const afterRemove = applyDraftManualAction(withMid, { type: 'removeEnemy', heroId: 17 }, 1000)
    expect(afterRemove.enemyHeroIds).toEqual([])
    expect(afterRemove.enemyMidHeroId).toBeNull()
  })

  it('reset возвращает контекст к EMPTY_DRAFT_CONTEXT (с новым updatedAtMs)', () => {
    const dirty: DraftContext = { ...EMPTY_DRAFT_CONTEXT, allyHeroIds: [1, 2], stage: 'finalized' }
    const reset = applyDraftManualAction(dirty, { type: 'reset' }, 5000)
    expect(reset).toEqual({ ...EMPTY_DRAFT_CONTEXT, updatedAtMs: 5000 })
  })
})

function matchup(partial: Partial<MatchupData> & Pick<MatchupData, 'otherHeroId' | 'relation' | 'winrate'>): MatchupData {
  return { heroId: 1, sampleSize: 100, patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT', ...partial }
}

describe('scoreDraftCandidate', () => {
  const picks: OpenDraftPicks = { enemyHeroIds: [17, 11], enemyMidHeroId: 17, allyHeroIds: [8] }

  it('считает counterScore как взвешенное среднее (мидер ×2) и synergyScore как среднее with-матчапов', () => {
    const candidate: DraftCandidateData = {
      heroId: 1,
      heroName: 'Hero 1',
      matchups: [
        matchup({ otherHeroId: 17, relation: 'vs', winrate: 0.6, sampleSize: 100 }),
        matchup({ otherHeroId: 11, relation: 'vs', winrate: 0.4, sampleSize: 50 }),
        matchup({ otherHeroId: 8, relation: 'with', winrate: 0.55, sampleSize: 80 })
      ],
      personalWinrate: null
    }

    const result = scoreDraftCandidate({ candidate, picks, weights: DEFAULT_DRAFT_SCORING_WEIGHTS })

    // (0.6*2 + 0.4*1) / 3 = 0.5333...
    expect(result.counterScore).toBeCloseTo((0.6 * 2 + 0.4 * 1) / 3, 6)
    expect(result.synergyScore).toBeCloseTo(0.55, 6)
    expect(result.sampleSize).toBe(100 + 50 + 80)
    // score = 0.5*counter + 0.4*synergy + 0.1*0 (personalWinrate null -> 0 вклад)
    expect(result.score).toBeCloseTo(0.5 * result.counterScore + 0.4 * result.synergyScore, 6)
    expect(result.personalWinrate).toBeNull()
  })

  it('без матчап-данных против открытых пиков возвращает нейтральные 0.5', () => {
    const candidate: DraftCandidateData = { heroId: 2, heroName: 'Hero 2', matchups: [], personalWinrate: null }
    const result = scoreDraftCandidate({ candidate, picks, weights: DEFAULT_DRAFT_SCORING_WEIGHTS })
    expect(result.counterScore).toBe(0.5)
    expect(result.synergyScore).toBe(0.5)
    expect(result.sampleSize).toBe(0)
  })

  it('metaScoringWeights обнуляет вклад personalWinrate независимо от его значения', () => {
    const candidate: DraftCandidateData = { heroId: 3, heroName: 'Hero 3', matchups: [], personalWinrate: 0.9 }
    const meta = scoreDraftCandidate({ candidate, picks, weights: metaScoringWeights() })
    const personal = scoreDraftCandidate({ candidate, picks, weights: DEFAULT_DRAFT_SCORING_WEIGHTS })

    expect(meta.score).toBeCloseTo(0.5 * 0.5 + 0.4 * 0.5, 6) // без вклада personalWinrate
    expect(personal.score).toBeCloseTo(0.5 * 0.5 + 0.4 * 0.5 + 0.1 * 0.9, 6)
    expect(personal.score).toBeGreaterThan(meta.score)
  })
})

describe('rankDraftCandidates', () => {
  const picks: OpenDraftPicks = { enemyHeroIds: [17], enemyMidHeroId: 17, allyHeroIds: [] }

  const strongCounter: DraftCandidateData = {
    heroId: 1,
    heroName: 'Strong',
    matchups: [matchup({ otherHeroId: 17, relation: 'vs', winrate: 0.65, sampleSize: 100 })],
    personalWinrate: null
  }
  const weakCounter: DraftCandidateData = {
    heroId: 2,
    heroName: 'Weak',
    matchups: [matchup({ otherHeroId: 17, relation: 'vs', winrate: 0.35, sampleSize: 100 })],
    personalWinrate: null
  }

  it('сортирует кандидатов по убыванию итогового score', () => {
    const ranked = rankDraftCandidates([weakCounter, strongCounter], picks, DEFAULT_DRAFT_SCORING_WEIGHTS)
    expect(ranked.map((c) => c.heroId)).toEqual([1, 2])
  })

  it('изменение весов предсказуемо меняет ранжирование (перевес на personalWinrate переворачивает порядок)', () => {
    const withPersonal: DraftCandidateData = { ...weakCounter, personalWinrate: 1 }
    const heavyPersonalWeights = { counter: 0.1, synergy: 0.1, personal: 0.8 }

    const ranked = rankDraftCandidates([strongCounter, withPersonal], picks, heavyPersonalWeights)
    expect(ranked[0]?.heroId).toBe(2)

    const rankedDefault = rankDraftCandidates([strongCounter, withPersonal], picks, DEFAULT_DRAFT_SCORING_WEIGHTS)
    expect(rankedDefault[0]?.heroId).toBe(1)
  })
})
