/**
 * Zod-схемы типизированного производного зеркала состояния игры (GameState).
 * Это «источник правды» приложения (INV1): main держит его, renderer получает
 * проекцию через IPC. Поля нормализованы в camelCase, обязательны и с явными
 * значениями по умолчанию (заполняются в parseGameState), чтобы потребители
 * не разбирались с undefined.
 *
 * Отражает раздел 5.3 PRD: map (game_state/clock_time/daytime),
 * player (steamid/gold/kills/deaths), hero (level/health_percent/mana_percent/
 * buyback_cooldown/ult_status), abilities, items.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

/** Производный статус ультимейта героя (в raw GSI отдельного поля нет). */
export const UltStatusSchema = z.enum(['ready', 'cooldown', 'no_mana', 'not_learned'])
export type UltStatus = z.infer<typeof UltStatusSchema>

export const AbilitySchema = z.object({
  name: z.string(),
  level: z.number(),
  cooldown: z.number(),
  canCast: z.boolean(),
  passive: z.boolean(),
  ultimate: z.boolean()
})
export type Ability = z.infer<typeof AbilitySchema>

export const ItemSchema = z.object({
  name: z.string(),
  /** индекс из ключа слота (slot0 → 0, neutral0 → 0) */
  slot: z.number(),
  cooldown: z.number(),
  charges: z.number()
})
export type Item = z.infer<typeof ItemSchema>

export const MapStateSchema = z.object({
  matchId: z.string().nullable(),
  gameState: z.string(),
  clockTime: z.number(),
  gameTime: z.number(),
  daytime: z.boolean(),
  paused: z.boolean(),
  radiantScore: z.number(),
  direScore: z.number()
})
export type MapState = z.infer<typeof MapStateSchema>

export const PlayerStateSchema = z.object({
  steamId: z.string(),
  name: z.string(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  lastHits: z.number(),
  denies: z.number(),
  gold: z.number(),
  gpm: z.number(),
  xpm: z.number()
})
export type PlayerState = z.infer<typeof PlayerStateSchema>

export const HeroStateSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  alive: z.boolean(),
  respawnSeconds: z.number(),
  healthPercent: z.number(),
  manaPercent: z.number(),
  buybackCost: z.number(),
  buybackCooldown: z.number(),
  ultStatus: UltStatusSchema
})
export type HeroState = z.infer<typeof HeroStateSchema>

/**
 * map/player/hero nullable: на стадии подключения или HERO_SELECTION часть
 * секций может отсутствовать в пакете.
 */
export const GameStateSchema = z.object({
  map: MapStateSchema.nullable(),
  player: PlayerStateSchema.nullable(),
  hero: HeroStateSchema.nullable(),
  abilities: z.array(AbilitySchema),
  items: z.array(ItemSchema)
})
export type GameState = z.infer<typeof GameStateSchema>
