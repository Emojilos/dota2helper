/**
 * Zod-схема контентного конфига hero-profiles.json (F2/F4, TASK-034, INV4).
 *
 * Раздел 5.2 PRD: `{ hero_id, ult_is_kill_window (bool), power_spike_levels
 * (int[]), aggression_pattern (all_in|trade|passive_farm),
 * typical_level6_time_sec (int), notes }` — герой-зависимые параметры, на
 * которые ссылаются правила F4 (TASK-042/043, вместо жёстко зашитых условий
 * по конкретным героям) и статистический fallback F2 (TASK-036) для пар вне
 * matchup-knowledge.json. typicalLevel6TimeSec также используется
 * fact-builder'ом (TASK-041) для оценки estimated_enemy_level — GSI не
 * отдаёт уровень/способности вражеских героев (раздел 5.2 PRD).
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const AggressionPatternSchema = z.enum(['all_in', 'trade', 'passive_farm'])
export type AggressionPattern = z.infer<typeof AggressionPatternSchema>

export const HeroProfileSchema = z.object({
  heroId: z.number().int().positive(),
  /** Даёт ли получение/наличие ульты немедленное окно на килл (Storm Spirit — true; TA/Invoker — false, раздел 5.2 PRD). */
  ultIsKillWindow: z.boolean(),
  /** Уровни пиков силы героя (напр. [6,7] у Storm Spirit, [2,3] у Shadow Fiend). */
  powerSpikeLevels: z.array(z.number().int().positive()).min(1),
  aggressionPattern: AggressionPatternSchema,
  /** Медиана времени получения 6 уровня, сек игрового времени (используется для estimated_enemy_level, TASK-041). */
  typicalLevel6TimeSec: z.number().int().positive(),
  notes: z.string().default('')
})
export type HeroProfile = z.infer<typeof HeroProfileSchema>

export const HeroProfilesConfigSchema = z
  .object({
    /** патч Dota, под который выверены профили (справочно). */
    patch: z.string(),
    profiles: z.array(HeroProfileSchema)
  })
  .superRefine((config, ctx) => {
    const seen = new Set<number>()
    for (const [index, profile] of config.profiles.entries()) {
      if (seen.has(profile.heroId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate hero profile heroId '${profile.heroId}'`,
          path: ['profiles', index, 'heroId']
        })
      }
      seen.add(profile.heroId)
    }
  })
export type HeroProfilesConfig = z.infer<typeof HeroProfilesConfigSchema>
