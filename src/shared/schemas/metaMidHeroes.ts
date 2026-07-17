/**
 * Zod-схема контентного конфига meta-mid-heroes.json (TASK-025, INV4).
 *
 * Список героев/scope (patch, rankBracket) для фонового прогрева кэша
 * матчапов (CacheWarmer, src/main/data/CacheWarmer.ts) при старте
 * приложения. Правка списка/патча — только данные, без изменения кода
 * прогревщика.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const MetaMidHeroesConfigSchema = z.object({
  /** Патч, под который греется кэш (передаётся как StratzQueryScope.patch). */
  patch: z.string(),
  /** напр. "ARCHON_TO_ANCIENT" (StratzQueryScope.rankBracket). */
  rankBracket: z.string(),
  /** ID героев меты для прогрева, без дублей. */
  heroIds: z.array(z.number().int().positive()).min(1)
})
export type MetaMidHeroesConfig = z.infer<typeof MetaMidHeroesConfigSchema>
