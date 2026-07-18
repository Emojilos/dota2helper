import { describe, expect, it, vi } from 'vitest'
import { MatchCompletionDetector, buildMatchSummary } from '@main/matchHistory/MatchCompletionDetector'
import type { GameState } from '@shared/schemas/gameState'

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    map: {
      matchId: '7412345678',
      gameState: 'DOTA_GAMERULES_STATE_POST_GAME',
      clockTime: 2350,
      gameTime: 2400,
      daytime: false,
      paused: false,
      radiantScore: 32,
      direScore: 20,
      winTeam: 'radiant'
    },
    player: {
      steamId: '76561198000000001',
      name: 'midlaner',
      team: 'radiant',
      kills: 12,
      deaths: 3,
      assists: 9,
      lastHits: 240,
      denies: 18,
      gold: 5200,
      gpm: 612,
      xpm: 700
    },
    hero: {
      id: 74,
      name: 'npc_dota_hero_storm_spirit',
      level: 25,
      alive: true,
      respawnSeconds: 0,
      healthPercent: 100,
      manaPercent: 100,
      buybackCost: 0,
      buybackCooldown: 0,
      ultStatus: 'ready'
    },
    abilities: [],
    items: [],
    ...overrides
  }
}

describe('buildMatchSummary', () => {
  it('builds a win summary when the player is on the winning team', () => {
    const summary = buildMatchSummary(gameState(), null, 1000)
    expect(summary).toEqual({
      matchId: '7412345678',
      heroId: 74,
      enemyMidHeroId: null,
      result: 'win',
      kda: { kills: 12, deaths: 3, assists: 9 },
      playedAtMs: 1000
    })
  })

  it('builds a loss summary when the player is on the losing team', () => {
    const state = gameState({
      player: {
        steamId: '76561198000000001',
        name: 'midlaner',
        team: 'dire',
        kills: 2,
        deaths: 10,
        assists: 1,
        lastHits: 90,
        denies: 3,
        gold: 1200,
        gpm: 300,
        xpm: 320
      }
    })
    const summary = buildMatchSummary(state, 26, 1000)
    expect(summary?.result).toBe('loss')
    expect(summary?.enemyMidHeroId).toBe(26)
  })

  it('returns null when winTeam/team are undetermined', () => {
    const state = gameState({
      map: {
        matchId: '7412345678',
        gameState: 'DOTA_GAMERULES_STATE_POST_GAME',
        clockTime: 2350,
        gameTime: 2400,
        daytime: false,
        paused: false,
        radiantScore: 32,
        direScore: 20,
        winTeam: null
      }
    })
    expect(buildMatchSummary(state, null, 1000)).toBeNull()
  })

  it('returns null when map/player/hero sections are missing', () => {
    expect(buildMatchSummary({ map: null, player: null, hero: null, abilities: [], items: [] }, null, 1000)).toBeNull()
  })
})

describe('MatchCompletionDetector', () => {
  it('fires onMatchCompleted once on transition into post-game for a new matchId', () => {
    const onMatchCompleted = vi.fn()
    const detector = new MatchCompletionDetector({
      getEnemyMidHeroId: () => null,
      onMatchCompleted,
      now: () => 5000
    })

    detector.onGameState(gameState())
    detector.onGameState(gameState())
    detector.onGameState(gameState())

    expect(onMatchCompleted).toHaveBeenCalledTimes(1)
    expect(onMatchCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: '7412345678', result: 'win', playedAtMs: 5000 })
    )
  })

  it('ignores non-post-game states', () => {
    const onMatchCompleted = vi.fn()
    const detector = new MatchCompletionDetector({ getEnemyMidHeroId: () => null, onMatchCompleted })

    detector.onGameState(
      gameState({
        map: {
          matchId: '7412345678',
          gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          clockTime: 600,
          gameTime: 645,
          daytime: true,
          paused: false,
          radiantScore: 12,
          direScore: 8,
          winTeam: null
        }
      })
    )

    expect(onMatchCompleted).not.toHaveBeenCalled()
  })

  it('does not spam onMatchCompleted when the result stays undetermined across ticks', () => {
    const onMatchCompleted = vi.fn()
    const logger = vi.fn()
    const detector = new MatchCompletionDetector({ getEnemyMidHeroId: () => null, onMatchCompleted, logger })
    const undetermined = gameState({
      map: {
        matchId: '7412345678',
        gameState: 'DOTA_GAMERULES_STATE_POST_GAME',
        clockTime: 2350,
        gameTime: 2400,
        daytime: false,
        paused: false,
        radiantScore: 32,
        direScore: 20,
        winTeam: null
      }
    })

    detector.onGameState(undetermined)
    detector.onGameState(undetermined)

    expect(onMatchCompleted).not.toHaveBeenCalled()
    expect(logger).toHaveBeenCalledTimes(1)
  })

  it('fires again for a subsequent match after a new matchId reaches post-game', () => {
    const onMatchCompleted = vi.fn()
    const detector = new MatchCompletionDetector({ getEnemyMidHeroId: () => null, onMatchCompleted })

    detector.onGameState(gameState())
    detector.onGameState(
      gameState({
        map: {
          matchId: '999',
          gameState: 'DOTA_GAMERULES_STATE_POST_GAME',
          clockTime: 1800,
          gameTime: 1850,
          daytime: true,
          paused: false,
          radiantScore: 10,
          direScore: 30,
          winTeam: 'dire'
        },
        player: {
          steamId: '76561198000000001',
          name: 'midlaner',
          team: 'dire',
          kills: 1,
          deaths: 8,
          assists: 2,
          lastHits: 60,
          denies: 2,
          gold: 900,
          gpm: 280,
          xpm: 300
        }
      })
    )

    expect(onMatchCompleted).toHaveBeenCalledTimes(2)
    expect(onMatchCompleted.mock.calls[1][0]).toMatchObject({ matchId: '999', result: 'win' })
  })

  it('reset() allows the same matchId to fire again', () => {
    const onMatchCompleted = vi.fn()
    const detector = new MatchCompletionDetector({ getEnemyMidHeroId: () => null, onMatchCompleted })

    detector.onGameState(gameState())
    detector.reset()
    detector.onGameState(gameState())

    expect(onMatchCompleted).toHaveBeenCalledTimes(2)
  })
})
