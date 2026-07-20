/**
 * Zod-схемы Advice (подсказка/уведомление) и DraftCandidate (кандидат на пик
 * в драфте). Это payload'ы IPC-каналов advice:push и draft:update.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

/**
 * Цветовое кодирование уведомления (раздел 6 PRD):
 * opportunity — зелёный (возможность), timing — жёлтый (тайминг),
 * danger — красный (опасность).
 */
export const AdviceSeveritySchema = z.enum(['opportunity', 'timing', 'danger'])
export type AdviceSeverity = z.infer<typeof AdviceSeveritySchema>

export const AdviceSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  message: z.string(),
  severity: AdviceSeveritySchema,
  /** приоритет 1..5 (5 — важнее всего) */
  priority: z.number().int().min(1).max(5),
  /** подсказка основана на оценке состояния врага и помечается «вероятно» */
  estimated: z.boolean(),
  createdAtMs: z.number()
})
export type Advice = z.infer<typeof AdviceSchema>

/**
 * Один пункт детализации counter/synergy (TASK-029, панель драфта): винрейт
 * кандидата против/с одним конкретным открытым пиком. sampleSize=0 и
 * winrate=0.5 — открытый пик БЕЗ матчап-данных (нейтральное значение,
 * см. NEUTRAL_WINRATE в engine/draft), а не "матчап нулевой".
 */
export const DraftMatchupBreakdownEntrySchema = z.object({
  heroId: z.number(),
  winrate: z.number(),
  sampleSize: z.number()
})
export type DraftMatchupBreakdownEntry = z.infer<typeof DraftMatchupBreakdownEntrySchema>

export const DraftCandidateSchema = z.object({
  heroId: z.number(),
  heroName: z.string(),
  score: z.number(),
  counterScore: z.number(),
  synergyScore: z.number(),
  /** null, если Steam ID не привязан или нет личной статистики */
  personalWinrate: z.number().nullable(),
  sampleSize: z.number(),
  /** Разбивка counterScore — один элемент на каждый открытый вражеский пик (TASK-029). */
  vsBreakdown: z.array(DraftMatchupBreakdownEntrySchema),
  /** Разбивка synergyScore — один элемент на каждого открытого союзника (TASK-029). */
  withBreakdown: z.array(DraftMatchupBreakdownEntrySchema)
})
export type DraftCandidate = z.infer<typeof DraftCandidateSchema>
