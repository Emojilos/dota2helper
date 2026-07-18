/**
 * Zod-схемы СЫРОГО GSI-пакета от Dota 2 (raw), как его присылает
 * gamestate_integration. Поля называются точно так, как в JSON Valve
 * (snake_case), структура намеренно «мягкая»: почти всё optional, а
 * контейнеры .passthrough(), чтобы неизвестные/новые поля не роняли парсинг.
 *
 * Нормализация в типизированный GameState — в src/shared/gsi/parseGameState.
 *
 * INV2: модуль чист (только zod), без electron / react / fs / сети.
 */
import { z } from 'zod'

export const GsiProviderSchema = z.object({
  name: z.string(),
  appid: z.number(),
  version: z.number(),
  timestamp: z.number()
})

export const GsiMapSchema = z
  .object({
    name: z.string().optional(),
    matchid: z.string().optional(),
    game_time: z.number().optional(),
    clock_time: z.number().optional(),
    game_state: z.string().optional(),
    daytime: z.boolean().optional(),
    paused: z.boolean().optional(),
    win_team: z.string().optional(),
    radiant_score: z.number().optional(),
    dire_score: z.number().optional()
  })
  .passthrough()

export const GsiPlayerSchema = z
  .object({
    steamid: z.string(),
    name: z.string().optional(),
    activity: z.string().optional(),
    team_name: z.string().optional(),
    kills: z.number().optional(),
    deaths: z.number().optional(),
    assists: z.number().optional(),
    last_hits: z.number().optional(),
    denies: z.number().optional(),
    gold: z.number().optional(),
    gpm: z.number().optional(),
    xpm: z.number().optional()
  })
  .passthrough()

export const GsiHeroSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
    level: z.number().optional(),
    alive: z.boolean().optional(),
    respawn_seconds: z.number().optional(),
    buyback_cost: z.number().optional(),
    buyback_cooldown: z.number().optional(),
    health_percent: z.number().optional(),
    mana_percent: z.number().optional()
  })
  .passthrough()

export const GsiAbilitySchema = z
  .object({
    name: z.string(),
    level: z.number().optional(),
    can_cast: z.boolean().optional(),
    passive: z.boolean().optional(),
    ability_active: z.boolean().optional(),
    cooldown: z.number().optional(),
    ultimate: z.boolean().optional()
  })
  .passthrough()

export const GsiItemSchema = z
  .object({
    name: z.string(),
    purchaser: z.number().optional(),
    can_cast: z.boolean().optional(),
    cooldown: z.number().optional(),
    passive: z.boolean().optional(),
    charges: z.number().optional()
  })
  .passthrough()

/** abilities приходят как { ability0: {...}, ability1: {...}, ... } */
export const GsiAbilitiesSchema = z.record(z.string(), GsiAbilitySchema)

/** items приходят как { slot0: {...}, ..., neutral0: {...} } */
export const GsiItemsSchema = z.record(z.string(), GsiItemSchema)

export const GsiRawPacketSchema = z
  .object({
    provider: GsiProviderSchema.optional(),
    map: GsiMapSchema.optional(),
    player: GsiPlayerSchema.optional(),
    hero: GsiHeroSchema.optional(),
    abilities: GsiAbilitiesSchema.optional(),
    items: GsiItemsSchema.optional(),
    auth: z.object({ token: z.string() }).optional()
  })
  .passthrough()

export type GsiProvider = z.infer<typeof GsiProviderSchema>
export type GsiRawPacket = z.infer<typeof GsiRawPacketSchema>
