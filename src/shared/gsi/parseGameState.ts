/**
 * Чистый парсер сырого GSI-пакета в типизированный GameState.
 *
 * parseGameState(input):
 *  1. валидирует вход GsiRawPacketSchema (бросает ZodError с понятным путём,
 *     если пакет структурно битый);
 *  2. нормализует snake_case → camelCase, проставляет дефолты, выводит
 *     ult_status из способностей.
 *
 * INV2: модуль чист — только zod-схемы и логика, без electron / react / fs.
 */
import { GsiRawPacketSchema, type GsiRawPacket } from '../schemas/gsi'
import type {
  Ability,
  GameState,
  HeroState,
  Item,
  MapState,
  PlayerState,
  UltStatus
} from '../schemas/gameState'

/** Извлекает завершающее число из ключа слота ("ability3" → 3, "neutral0" → 0). */
function trailingInt(key: string): number {
  const match = key.match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function mapAbilities(raw: GsiRawPacket['abilities']): Ability[] {
  if (!raw) return []
  return Object.entries(raw)
    .filter(([, ability]) => ability.name !== 'generic_hidden')
    .sort(([a], [b]) => trailingInt(a) - trailingInt(b))
    .map(([, ability]) => ({
      name: ability.name,
      level: ability.level ?? 0,
      cooldown: ability.cooldown ?? 0,
      canCast: ability.can_cast ?? false,
      passive: ability.passive ?? false,
      ultimate: ability.ultimate ?? false
    }))
}

function mapItems(raw: GsiRawPacket['items']): Item[] {
  if (!raw) return []
  return Object.entries(raw)
    .filter(([, item]) => item.name !== 'empty')
    .map(([key, item]) => ({
      name: item.name,
      slot: trailingInt(key),
      cooldown: item.cooldown ?? 0,
      charges: item.charges ?? 0
    }))
}

/** В raw GSI нет ult_status — выводим из ультимативной способности. */
function computeUltStatus(abilities: Ability[]): UltStatus {
  const ult = abilities.find((ability) => ability.ultimate)
  if (!ult || ult.level <= 0) return 'not_learned'
  if (ult.cooldown > 0) return 'cooldown'
  if (!ult.canCast) return 'no_mana'
  return 'ready'
}

function mapMap(raw: GsiRawPacket['map']): MapState | null {
  if (!raw) return null
  return {
    matchId: raw.matchid && raw.matchid !== '0' ? raw.matchid : null,
    gameState: raw.game_state ?? 'DOTA_GAMERULES_STATE_INIT',
    clockTime: raw.clock_time ?? 0,
    gameTime: raw.game_time ?? 0,
    daytime: raw.daytime ?? true,
    paused: raw.paused ?? false,
    radiantScore: raw.radiant_score ?? 0,
    direScore: raw.dire_score ?? 0
  }
}

function mapPlayer(raw: GsiRawPacket['player']): PlayerState | null {
  if (!raw) return null
  return {
    steamId: raw.steamid,
    name: raw.name ?? '',
    kills: raw.kills ?? 0,
    deaths: raw.deaths ?? 0,
    assists: raw.assists ?? 0,
    lastHits: raw.last_hits ?? 0,
    denies: raw.denies ?? 0,
    gold: raw.gold ?? 0,
    gpm: raw.gpm ?? 0,
    xpm: raw.xpm ?? 0
  }
}

function mapHero(raw: GsiRawPacket['hero'], abilities: Ability[]): HeroState | null {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name ?? '',
    level: raw.level ?? 0,
    alive: raw.alive ?? true,
    respawnSeconds: raw.respawn_seconds ?? 0,
    healthPercent: raw.health_percent ?? 0,
    manaPercent: raw.mana_percent ?? 0,
    buybackCost: raw.buyback_cost ?? 0,
    buybackCooldown: raw.buyback_cooldown ?? 0,
    ultStatus: computeUltStatus(abilities)
  }
}

/** Валидирует сырой пакет и нормализует его в GameState. Бросает ZodError на битом входе. */
export function parseGameState(input: unknown): GameState {
  const raw = GsiRawPacketSchema.parse(input)
  const abilities = mapAbilities(raw.abilities)
  const items = mapItems(raw.items)
  return {
    map: mapMap(raw.map),
    player: mapPlayer(raw.player),
    hero: mapHero(raw.hero, abilities),
    abilities,
    items
  }
}
