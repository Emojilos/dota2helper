/**
 * Zod-схемы DraftContext (F1, TASK-027) — состояние текущего драфта: стадия
 * (idle/picking/finalized), свой герой (авто-детект из GSI — hero.id !== 0,
 * см. docs/gsi-fields.md) и ручной ввод пиков врага/союзников + роль
 * вражеского мидера. GSI НЕ отдаёт пики команд игроку ни в одной из трёх
 * захваченных сессий (TASK-009, открытый вопрос #1 закрыт) — авто-детект
 * ограничен своим героем и стадией, остальное только ручной ввод.
 *
 * DraftContext пересекает границу IPC (main -> renderer: draftContext:update;
 * renderer -> main: draftContext:applyManualAction) — поэтому живёт в shared,
 * а не в чистом engine/draft (который импортирует эти типы и реализует над
 * ними чистые функции без состояния, TimingEvent/HeroProfile — тот же приём).
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const DraftStageSchema = z.enum(['idle', 'picking', 'finalized'])
export type DraftStage = z.infer<typeof DraftStageSchema>

export const DraftContextSchema = z.object({
  stage: DraftStageSchema,
  ownHeroId: z.number().int().positive().nullable(),
  allyHeroIds: z.array(z.number().int().positive()),
  enemyHeroIds: z.array(z.number().int().positive()),
  /** Вражеский мидер — вес ×2 в counter_score (F1 PRD) и пара для LanePlanBuilder (F2). Всегда подмножество enemyHeroIds. */
  enemyMidHeroId: z.number().int().positive().nullable(),
  updatedAtMs: z.number()
})
export type DraftContext = z.infer<typeof DraftContextSchema>

export const EMPTY_DRAFT_CONTEXT: DraftContext = {
  stage: 'idle',
  ownHeroId: null,
  allyHeroIds: [],
  enemyHeroIds: [],
  enemyMidHeroId: null,
  updatedAtMs: 0
}

/** Ручной ввод пиков (renderer -> main, invoke draftContext:applyManualAction). */
export const DraftManualActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addAlly'), heroId: z.number().int().positive() }),
  z.object({ type: z.literal('removeAlly'), heroId: z.number().int().positive() }),
  z.object({ type: z.literal('addEnemy'), heroId: z.number().int().positive() }),
  z.object({ type: z.literal('removeEnemy'), heroId: z.number().int().positive() }),
  z.object({ type: z.literal('setEnemyMid'), heroId: z.number().int().positive().nullable() }),
  z.object({ type: z.literal('reset') })
])
export type DraftManualAction = z.infer<typeof DraftManualActionSchema>
