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
