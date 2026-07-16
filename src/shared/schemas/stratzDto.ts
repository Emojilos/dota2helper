/**
 * Внутренние DTO для матчап-статистики и связанных сущностей (раздел 5.1 PRD).
 * К этой форме приводятся ответы И STRATZ (основной источник), И OpenDota
 * (fallback, TASK-024) — потребители (кэш/фасад/скоринг) не знают, откуда
 * данные пришли, только что они в этой форме (INV5).
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

/** vs — контрпик (винрейт кандидата ПРОТИВ героя), with — синергия (винрейт В КОМАНДЕ с героем). */
export const MatchupRelationSchema = z.enum(['vs', 'with'])
export type MatchupRelation = z.infer<typeof MatchupRelationSchema>

export const MatchupDataSchema = z.object({
  heroId: z.number().int(),
  otherHeroId: z.number().int(),
  relation: MatchupRelationSchema,
  winrate: z.number().min(0).max(1),
  sampleSize: z.number().int().min(0),
  patch: z.string(),
  rankBracket: z.string()
})
export type MatchupData = z.infer<typeof MatchupDataSchema>

/** Пул героев игрока (кэш из STRATZ, соответствует HeroPoolStats без steamId — тот известен из контекста запроса). */
export const HeroPoolEntrySchema = z.object({
  heroId: z.number().int(),
  matchesCount: z.number().int().min(0),
  winrate: z.number().min(0).max(1),
  lastSyncedAtMs: z.number()
})
export type HeroPoolEntry = z.infer<typeof HeroPoolEntrySchema>

/** Популярный/высоковинрейтный билд героя (стартовая закупка + скиллбилд) для конкретного матчапа. */
export const BuildDataSchema = z.object({
  heroId: z.number().int(),
  vsHeroId: z.number().int().nullable(),
  /** ability_id в порядке взятия уровней */
  skillBuild: z.array(z.number().int()),
  /** item_id стартовой закупки */
  startingItems: z.array(z.number().int()),
  winrate: z.number().min(0).max(1),
  sampleSize: z.number().int().min(0),
  patch: z.string()
})
export type BuildData = z.infer<typeof BuildDataSchema>

export const MatchResultSchema = z.enum(['win', 'loss'])
export type MatchResult = z.infer<typeof MatchResultSchema>

export const MatchKdaSchema = z.object({
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0)
})
export type MatchKda = z.infer<typeof MatchKdaSchema>

/** Соответствует MatchHistory (раздел 5.1 PRD): краткая сводка завершённого матча. */
export const MatchSummarySchema = z.object({
  matchId: z.string(),
  heroId: z.number().int(),
  enemyMidHeroId: z.number().int().nullable(),
  result: MatchResultSchema,
  kda: MatchKdaSchema,
  playedAtMs: z.number()
})
export type MatchSummary = z.infer<typeof MatchSummarySchema>
