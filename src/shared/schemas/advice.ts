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

export const DraftCandidateSchema = z.object({
  heroId: z.number(),
  heroName: z.string(),
  score: z.number(),
  counterScore: z.number(),
  synergyScore: z.number(),
  /** null, если Steam ID не привязан или нет личной статистики */
  personalWinrate: z.number().nullable(),
  sampleSize: z.number()
})
export type DraftCandidate = z.infer<typeof DraftCandidateSchema>
