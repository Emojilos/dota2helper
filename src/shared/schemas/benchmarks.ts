/**
 * Zod-схема контентного конфига benchmarks.json (F5, TASK-038, INV4, раздел 5.2 PRD).
 *
 * Эталонные кривые LH/networth/XP по герою и минуте (перцентили p50/p75, ранг
 * Archon–Ancient) для бенчмарк-виджетов (TASK-039) — live-сравнение текущих
 * показателей игрока с нормой в стиле Dota Plus.
 *
 * Генерируется офлайн-инструментом `tools/generate-benchmarks.ts` (не правится
 * руками — перегенерировать инструментом при смене патча).
 *
 * `approximate` (open_question #3 в tasks.json): ни STRATZ (нет токена/подтверждённой
 * схемы на момент написания), ни публичный OpenDota `/benchmarks` не отдают
 * истинную поминутную дистрибуцию — OpenDota отдаёт только средние ставки за
 * матч (gold_per_min и т.п.) по перцентилям. Кривые здесь — честная линейная
 * интерполяция rate*minute, всегда помечены `approximate: true`, чтобы
 * потребители (виджет TASK-039) не выдавали их за точные данные.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const BenchmarkPointSchema = z.object({
  hero_id: z.number().int().positive(),
  minute: z.number().int().min(0),
  lh_p50: z.number().min(0),
  lh_p75: z.number().min(0),
  networth_p50: z.number().min(0),
  networth_p75: z.number().min(0),
  xp_p50: z.number().min(0),
  xp_p75: z.number().min(0),
  rank_bracket: z.string(),
  patch: z.string(),
  /** true — кривая получена интерполяцией из агрегатных ставок, не из реальной поминутной выборки. */
  approximate: z.boolean()
})
export type BenchmarkPoint = z.infer<typeof BenchmarkPointSchema>

export const BenchmarksConfigSchema = z.array(BenchmarkPointSchema)
export type BenchmarksConfig = z.infer<typeof BenchmarksConfigSchema>
