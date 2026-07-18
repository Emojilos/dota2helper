/**
 * Zod-схема контентного конфига matchup-knowledge.json (F2, TASK-035, INV4).
 *
 * Раздел 5.2 PRD: `{ hero_id, vs_hero_id, do_tips[], avoid_tips[],
 * power_spikes[], kill_windows[] }` — ключ ВСЕГДА пара (свой герой, вражеский
 * мидер), направленная: запись (heroId=Storm, vsHeroId=Viper) описывает
 * матчап с ПОЗИЦИИ Storm Spirit и не взаимозаменяема с (heroId=Viper,
 * vsHeroId=Storm). Раздел F2 PRD прямо требует этого — карточка одного и
 * того же врага (Viper) для разных своих героев (Storm Spirit / Huskar)
 * принципиально разная, поэтому пара не симметрична и обратная запись (если
 * нужна) заполняется отдельной content-строкой, а не выводится автоматически.
 *
 * powerSpikes — "тайминги силы обеих сторон" (раздел F2 PRD): массив с явным
 * side ('my' | 'enemy'), а не два отдельных поля, чтобы контент мог свободно
 * перечислить произвольное число пиков силы каждой стороны без изменения
 * схемы.
 *
 * killWindows — уровни СВОЕГО героя (heroId), на которых матчап даёт окно
 * убийства именно против этого врага; потребитель — engine/facts
 * (MatchupFactsContext.killWindowLevels, TASK-041) и правило F4
 * `level in power_spike_levels && matchup.kill_window_at_level` (раздел F4
 * PRD).
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const MatchupPowerSpikeSideSchema = z.enum(['my', 'enemy'])
export type MatchupPowerSpikeSide = z.infer<typeof MatchupPowerSpikeSideSchema>

export const MatchupPowerSpikeSchema = z.object({
  side: MatchupPowerSpikeSideSchema,
  /** уровень героя указанной стороны, на котором наступает пик силы В ЭТОМ матчапе. */
  level: z.number().int().positive(),
  /** тезис с позиции heroId — что этот пик силы значит для игрока (напр. "ищи размен" / "жди отхода в тень, не разменивайся"). */
  note: z.string().min(1)
})
export type MatchupPowerSpike = z.infer<typeof MatchupPowerSpikeSchema>

export const MatchupKnowledgeEntrySchema = z.object({
  /** свой герой — ВСЕ тексты записи пишутся с его позиции (раздел F2 PRD). */
  heroId: z.number().int().positive(),
  /** вражеский мидер, против которого этот совет применим. */
  vsHeroId: z.number().int().positive(),
  /** "что делать" — минимум 3 тезиса (раздел F2 PRD acceptance criteria). */
  doTips: z.array(z.string().min(1)).min(3),
  /** "чего бояться" — минимум 2 тезиса (раздел F2 PRD acceptance criteria). */
  avoidTips: z.array(z.string().min(1)).min(2),
  /** тайминги силы обеих сторон в этом матчапе — минимум по одному на каждую сторону. */
  powerSpikes: z
    .array(MatchupPowerSpikeSchema)
    .min(2)
    .refine((spikes) => spikes.some((s) => s.side === 'my') && spikes.some((s) => s.side === 'enemy'), {
      message: 'powerSpikes must include at least one entry for each side (my, enemy)'
    }),
  /** уровни heroId, дающие окно убийства против vsHeroId именно в этом матчапе (может быть пустым). */
  killWindows: z.array(z.number().int().positive()).default([])
})
export type MatchupKnowledgeEntry = z.infer<typeof MatchupKnowledgeEntrySchema>

export const MatchupKnowledgeConfigSchema = z
  .object({
    /** патч Dota, под который выверены матчапы (справочно). */
    patch: z.string(),
    entries: z.array(MatchupKnowledgeEntrySchema)
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>()
    for (const [index, entry] of config.entries.entries()) {
      if (entry.heroId === entry.vsHeroId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `matchup entry heroId and vsHeroId must differ (got ${entry.heroId})`,
          path: ['entries', index, 'vsHeroId']
        })
      }
      const key = `${entry.heroId}:${entry.vsHeroId}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate matchup entry for pair (heroId=${entry.heroId}, vsHeroId=${entry.vsHeroId})`,
          path: ['entries', index]
        })
      }
      seen.add(key)
    }
  })
export type MatchupKnowledgeConfig = z.infer<typeof MatchupKnowledgeConfigSchema>

/** Ищет запись матчапа с позиции heroId против vsHeroId (направленный ключ — см. шапку модуля). */
export function findMatchupEntry(
  config: MatchupKnowledgeConfig | null | undefined,
  heroId: number,
  vsHeroId: number
): MatchupKnowledgeEntry | undefined {
  return config?.entries.find((entry) => entry.heroId === heroId && entry.vsHeroId === vsHeroId)
}
