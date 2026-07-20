/**
 * F1 детект драфта (TASK-027): чистые функции над DraftContext
 * (@shared/schemas/draft) — вывод стадии драфта из сырого map.gameState и
 * собственного героя (GSI не отдаёт пики команд игроку ни в одной из трёх
 * захваченных сессий, docs/gsi-fields.md/TASK-009 — авто-детект ограничен
 * стадией и своим героем) плюс reducer ручного ввода пиков врага/союзников и
 * роли вражеского мидера. main (DraftContextManager, src/main/draft) держит
 * состояние между тиками GSI и вызовами ручного ввода и вызывает эти функции.
 *
 * INV1: renderer НИКОГДА не импортирует этот модуль напрямую (см.
 * .dependency-cruiser.cjs, renderer-no-engine-impl) — только готовый
 * DraftContext через IPC (draftContext:update).
 * INV2: модуль чист (только shared-типы, без electron/react/sqlite/сеть).
 */
import { EMPTY_DRAFT_CONTEXT, type DraftContext, type DraftManualAction, type DraftStage } from '@shared/schemas/draft'
import type { MatchupData } from '@shared/schemas/stratzDto'
import type { DraftCandidate } from '@shared/schemas/advice'

export const HERO_SELECTION_GAME_STATE = 'DOTA_GAMERULES_STATE_HERO_SELECTION'
const WAIT_FOR_PLAYERS_GAME_STATE = 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD'

/** Максимум героев на сторону (4 союзника + сам игрок, 5 врагов) — защита ручного ввода от мусора. */
const MAX_ALLY_PICKS = 4
const MAX_ENEMY_PICKS = 5

/**
 * Стадия драфта по сырой строке map.gameState (см. docs/gsi-fields.md —
 * реально встреченные значения game_state):
 *  - WAIT_FOR_PLAYERS_TO_LOAD — новый матч начинается заново → 'idle'.
 *  - HERO_SELECTION — идёт пик → 'picking'.
 *  - любое другое известное состояние ПОСЛЕ picking → 'finalized' (пики завершены).
 *  - если состояние ещё 'idle', но свой герой уже известен (напр. приложение
 *    запущено уже после пика, HERO_SELECTION-тик пропущен) — сразу 'finalized',
 *    без искусственного прохождения через 'picking'.
 */
export function deriveDraftStage(
  gameState: string | null,
  currentStage: DraftStage,
  ownHeroKnown: boolean
): DraftStage {
  if (gameState === WAIT_FOR_PLAYERS_GAME_STATE) {
    return 'idle'
  }
  if (gameState === HERO_SELECTION_GAME_STATE) {
    return 'picking'
  }
  if (currentStage === 'picking' && gameState !== null) {
    return 'finalized'
  }
  if (currentStage === 'idle' && ownHeroKnown) {
    return 'finalized'
  }
  return currentStage
}

/**
 * Обновляет DraftContext на очередной тик GSI: стадия + собственный герой.
 * Ручные пики (allies/enemies/enemyMid) не трогает. Возвращает ТОТ ЖЕ объект
 * при отсутствии изменений (main опирается на это по reference-равенству,
 * чтобы не рассылать draftContext:update на каждый GSI-тик впустую).
 */
export function updateDraftContextFromGameState(
  context: DraftContext,
  gameState: string | null,
  ownHeroId: number | null,
  nowMs: number
): DraftContext {
  const ownHeroKnown = ownHeroId !== null && ownHeroId !== 0
  const nextStage = deriveDraftStage(gameState, context.stage, ownHeroKnown)

  if (nextStage === 'idle' && context.stage !== 'idle') {
    // Новый матч — сбрасываем ручные пики прошлой игры.
    return { ...EMPTY_DRAFT_CONTEXT, updatedAtMs: nowMs }
  }

  const nextOwnHeroId = ownHeroKnown ? (ownHeroId as number) : context.ownHeroId
  if (nextStage === context.stage && nextOwnHeroId === context.ownHeroId) {
    return context
  }
  return { ...context, stage: nextStage, ownHeroId: nextOwnHeroId, updatedAtMs: nowMs }
}

/**
 * Применяет ручной ввод пиков (TASK-027 — GSI не видит пики команд,
 * единственный источник для enemyHeroIds/allyHeroIds/enemyMidHeroId). Чистый
 * reducer: невалидные/дублирующие/переполняющие лимит действия возвращают
 * тот же объект без изменений.
 */
export function applyDraftManualAction(
  context: DraftContext,
  action: DraftManualAction,
  nowMs: number
): DraftContext {
  switch (action.type) {
    case 'addAlly': {
      if (context.allyHeroIds.includes(action.heroId) || context.allyHeroIds.length >= MAX_ALLY_PICKS) {
        return context
      }
      return { ...context, allyHeroIds: [...context.allyHeroIds, action.heroId], updatedAtMs: nowMs }
    }
    case 'removeAlly': {
      if (!context.allyHeroIds.includes(action.heroId)) {
        return context
      }
      return {
        ...context,
        allyHeroIds: context.allyHeroIds.filter((id) => id !== action.heroId),
        updatedAtMs: nowMs
      }
    }
    case 'addEnemy': {
      if (context.enemyHeroIds.includes(action.heroId) || context.enemyHeroIds.length >= MAX_ENEMY_PICKS) {
        return context
      }
      return { ...context, enemyHeroIds: [...context.enemyHeroIds, action.heroId], updatedAtMs: nowMs }
    }
    case 'removeEnemy': {
      if (!context.enemyHeroIds.includes(action.heroId)) {
        return context
      }
      return {
        ...context,
        enemyHeroIds: context.enemyHeroIds.filter((id) => id !== action.heroId),
        // Убрали мидера из списка врагов — роль мидера тоже теряет смысл.
        enemyMidHeroId: context.enemyMidHeroId === action.heroId ? null : context.enemyMidHeroId,
        updatedAtMs: nowMs
      }
    }
    case 'setEnemyMid': {
      if (action.heroId !== null && !context.enemyHeroIds.includes(action.heroId)) {
        // Мидер должен сначала быть добавлен как открытый вражеский пик.
        return context
      }
      return { ...context, enemyMidHeroId: action.heroId, updatedAtMs: nowMs }
    }
    case 'reset':
      return { ...EMPTY_DRAFT_CONTEXT, updatedAtMs: nowMs }
  }
}

/**
 * F1 скоринг кандидатов на пик (TASK-028): чистые функции над матчап-данными
 * (@shared/schemas/stratzDto) и открытыми пиками из DraftContext — формула
 * раздела F1 PRD:
 *
 *   score = w1*counterScore + w2*synergyScore + w3*personalWinrate
 *
 * counterScore — взвешенное среднее винрейтов кандидата relation='vs' против
 * каждого ОТКРЫТОГО вражеского пика (вражеский мидер ×2, остальные враги ×1);
 * synergyScore — среднее винрейтов relation='with' с каждым открытым
 * союзником (×1, без удвоения). Откуда берутся сами матчап-данные (STRATZ/
 * OpenDota/кэш) и кто в пуле кандидатов — забота main (DraftService,
 * src/main/draft) через DataService-фасад (INV5); этот модуль ничего не
 * запрашивает и не знает об источниках (INV2).
 */

export interface DraftScoringWeights {
  /** w1 — вес counterScore. */
  counter: number
  /** w2 — вес synergyScore. */
  synergy: number
  /** w3 — вес personalWinrate. В Meta-режиме всегда 0 (см. metaScoringWeights). */
  personal: number
}

/** Дефолтные веса раздела F1 PRD (0.5/0.4/0.1) — используются в Personal-режиме как есть. */
export const DEFAULT_DRAFT_SCORING_WEIGHTS: DraftScoringWeights = {
  counter: 0.5,
  synergy: 0.4,
  personal: 0.1
}

/** Meta-режим (раздел F1 PRD): те же counter/synergy веса, но w3 обнулён — personalWinrate не влияет на ранжирование. */
export function metaScoringWeights(weights: DraftScoringWeights = DEFAULT_DRAFT_SCORING_WEIGHTS): DraftScoringWeights {
  return { ...weights, personal: 0 }
}

/** Матчап-данные и личная статистика ОДНОГО кандидата на пик — вход скоринга. */
export interface DraftCandidateData {
  heroId: number
  heroName: string
  /** Матчапы кандидата 'vs'/'with' против произвольных героев — фильтруются по открытым пикам внутри scoreDraftCandidate. */
  matchups: MatchupData[]
  /** null — нет привязанного Steam ID или нет данных по герою в пуле игрока. */
  personalWinrate: number | null
}

/** Открытые пики текущего драфта, нужные скорингу (подмножество DraftContext). */
export interface OpenDraftPicks {
  enemyHeroIds: number[]
  enemyMidHeroId: number | null
  allyHeroIds: number[]
}

/** Нейтральное значение при отсутствии матчап-данных против открытых пиков — не топит кандидата ниже реально слабых. */
const NEUTRAL_WINRATE = 0.5

function weightedAverageWinrate(
  matchups: MatchupData[],
  relation: MatchupData['relation'],
  heroIds: number[],
  weightFor: (heroId: number) => number
): { average: number; sampleSize: number } {
  let weightedSum = 0
  let totalWeight = 0
  let sampleSize = 0

  for (const heroId of heroIds) {
    const matchup = matchups.find((m) => m.relation === relation && m.otherHeroId === heroId)
    if (!matchup) {
      continue
    }
    const weight = weightFor(heroId)
    weightedSum += matchup.winrate * weight
    totalWeight += weight
    sampleSize += matchup.sampleSize
  }

  if (totalWeight === 0) {
    return { average: NEUTRAL_WINRATE, sampleSize: 0 }
  }
  return { average: weightedSum / totalWeight, sampleSize }
}

export interface ScoreDraftCandidateParams {
  candidate: DraftCandidateData
  picks: OpenDraftPicks
  weights: DraftScoringWeights
}

/** Считает counterScore/synergyScore/итоговый score для ОДНОГО кандидата по формуле F1 PRD. */
export function scoreDraftCandidate(params: ScoreDraftCandidateParams): DraftCandidate {
  const { candidate, picks, weights } = params

  const counter = weightedAverageWinrate(candidate.matchups, 'vs', picks.enemyHeroIds, (heroId) =>
    heroId === picks.enemyMidHeroId ? 2 : 1
  )
  const synergy = weightedAverageWinrate(candidate.matchups, 'with', picks.allyHeroIds, () => 1)
  const personalContribution = candidate.personalWinrate ?? 0

  const score =
    weights.counter * counter.average + weights.synergy * synergy.average + weights.personal * personalContribution

  return {
    heroId: candidate.heroId,
    heroName: candidate.heroName,
    score,
    counterScore: counter.average,
    synergyScore: synergy.average,
    personalWinrate: candidate.personalWinrate,
    sampleSize: counter.sampleSize + synergy.sampleSize
  }
}

/** Ранжирует всех кандидатов по формуле F1 PRD, по убыванию итогового score. */
export function rankDraftCandidates(
  candidates: DraftCandidateData[],
  picks: OpenDraftPicks,
  weights: DraftScoringWeights
): DraftCandidate[] {
  return candidates.map((candidate) => scoreDraftCandidate({ candidate, picks, weights })).sort((a, b) => b.score - a.score)
}
