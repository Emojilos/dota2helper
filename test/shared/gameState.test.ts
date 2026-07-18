import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ZodError } from 'zod'
import { parseGameState } from '@shared/gsi/parseGameState'
import { GameStateSchema } from '@shared/schemas/gameState'

const rawPacket: unknown = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/gsi/in_progress.json'), 'utf-8')
)

describe('TASK-004: GSI raw packet → typed GameState', () => {
  it('parses a valid raw packet into a schema-valid GameState', () => {
    const state = parseGameState(rawPacket)
    // производный GameState сам проходит свою Zod-схему (нет дублирования типов)
    expect(() => GameStateSchema.parse(state)).not.toThrow()
  })

  it('normalizes map fields (snake_case → camelCase)', () => {
    const { map } = parseGameState(rawPacket)
    expect(map).not.toBeNull()
    expect(map?.matchId).toBe('7412345678')
    expect(map?.clockTime).toBe(600)
    expect(map?.gameTime).toBe(645)
    expect(map?.gameState).toBe('DOTA_GAMERULES_STATE_GAME_IN_PROGRESS')
    expect(map?.daytime).toBe(true)
    expect(map?.radiantScore).toBe(12)
    expect(map?.direScore).toBe(8)
    // win_team='none' в фикстуре (матч не завершён) — нормализуется в null
    expect(map?.winTeam).toBeNull()
  })

  it('normalizes player stats', () => {
    const { player } = parseGameState(rawPacket)
    expect(player?.steamId).toBe('76561198000000001')
    expect(player?.lastHits).toBe(82)
    expect(player?.denies).toBe(11)
    expect(player?.gold).toBe(1350)
    expect(player?.gpm).toBe(612)
    // team_name отсутствует в фикстуре in_progress → null
    expect(player?.team).toBeNull()
  })

  it('normalizes team/win_team for a completed match (TASK-033)', () => {
    const postGame: unknown = JSON.parse(
      readFileSync(resolve(__dirname, '../fixtures/gsi/post_game.json'), 'utf-8')
    )
    const state = parseGameState(postGame)
    expect(state.map?.gameState).toBe('DOTA_GAMERULES_STATE_POST_GAME')
    expect(state.map?.winTeam).toBe('radiant')
    expect(state.player?.team).toBe('radiant')
  })

  it('normalizes hero fields and derives ult_status = ready', () => {
    const { hero } = parseGameState(rawPacket)
    expect(hero?.id).toBe(74)
    expect(hero?.level).toBe(11)
    expect(hero?.healthPercent).toBe(82)
    expect(hero?.manaPercent).toBe(65)
    expect(hero?.buybackCooldown).toBe(0)
    // ball_lightning выучен (level 2), не на кулдауне, can_cast=true → ready
    expect(hero?.ultStatus).toBe('ready')
  })

  it('drops hidden abilities and empty item slots', () => {
    const state = parseGameState(rawPacket)
    // generic_hidden отфильтрован → 4 способности
    expect(state.abilities).toHaveLength(4)
    expect(state.abilities.some((a) => a.name === 'generic_hidden')).toBe(false)
    // пустой слот отфильтрован → bottle, travel_boots, grove_bow
    expect(state.items).toHaveLength(3)
    expect(state.items.some((i) => i.name === 'empty')).toBe(false)
    expect(state.items.find((i) => i.name === 'item_bottle')?.charges).toBe(3)
  })

  it('derives not_learned when the ultimate is unleveled', () => {
    const noUlt = {
      hero: { id: 5 },
      abilities: {
        ability0: { name: 'a', level: 1, ultimate: false },
        ability3: { name: 'ult', level: 0, can_cast: false, cooldown: 0, ultimate: true }
      }
    }
    expect(parseGameState(noUlt).hero?.ultStatus).toBe('not_learned')
  })

  it('returns null sections when the packet omits them', () => {
    const state = parseGameState({})
    expect(state.map).toBeNull()
    expect(state.player).toBeNull()
    expect(state.hero).toBeNull()
    expect(state.abilities).toEqual([])
    expect(state.items).toEqual([])
  })

  it('throws a descriptive ZodError on a structurally broken packet', () => {
    // hero без обязательного числового id
    const broken = { hero: { name: 'x' } }
    expect(() => parseGameState(broken)).toThrow(ZodError)
    try {
      parseGameState(broken)
    } catch (error) {
      expect(JSON.stringify((error as ZodError).issues)).toContain('id')
    }
  })
})
