/**
 * Тесты DraftContextManager (F1, TASK-027) — main-обёртки над engine/draft:
 * держит DraftContext между тиками GSI и ручными действиями, уведомляет
 * onChange только при реальном изменении (иначе draftContext:update пушился
 * бы на каждый GSI-тик, ~2 Гц, впустую).
 */
import { describe, expect, it, vi } from 'vitest'
import { DraftContextManager } from '@main/draft'
import type { GameState } from '@shared/schemas/gameState'

function gameState(overrides: { gameStateValue: string | null; heroId: number | null }): GameState {
  return {
    map: overrides.gameStateValue === null ? null : {
      matchId: '1',
      gameState: overrides.gameStateValue,
      clockTime: 0,
      gameTime: 0,
      daytime: true,
      paused: false,
      radiantScore: 0,
      direScore: 0,
      winTeam: null
    },
    player: null,
    hero:
      overrides.heroId === null
        ? null
        : {
            id: overrides.heroId,
            name: '',
            level: 0,
            alive: true,
            respawnSeconds: 0,
            healthPercent: 100,
            manaPercent: 100,
            buybackCost: 0,
            buybackCooldown: 0,
            ultStatus: 'not_learned'
          },
    abilities: [],
    items: []
  }
}

describe('DraftContextManager', () => {
  it('переходит в picking и фиксирует своего героя на тике GSI', () => {
    const onChange = vi.fn()
    const manager = new DraftContextManager({ onChange, now: () => 1000 })

    manager.onGameState(gameState({ gameStateValue: 'DOTA_GAMERULES_STATE_HERO_SELECTION', heroId: 25 }))

    expect(manager.get().stage).toBe('picking')
    expect(manager.get().ownHeroId).toBe(25)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('не вызывает onChange повторно, если тик GSI ничего не изменил', () => {
    const onChange = vi.fn()
    const manager = new DraftContextManager({ onChange, now: () => 1000 })
    const state = gameState({ gameStateValue: 'DOTA_GAMERULES_STATE_HERO_SELECTION', heroId: 25 })

    manager.onGameState(state)
    manager.onGameState(state)
    manager.onGameState(state)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('applyManualAction добавляет врага и возвращает актуальный контекст', () => {
    const onChange = vi.fn()
    const manager = new DraftContextManager({ onChange, now: () => 1000 })

    const result = manager.applyManualAction({ type: 'addEnemy', heroId: 17 })

    expect(result.enemyHeroIds).toEqual([17])
    expect(manager.get().enemyHeroIds).toEqual([17])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('getEnemyMidHeroId отражает роль мидера, заданную вручную', () => {
    const manager = new DraftContextManager({ now: () => 1000 })

    expect(manager.getEnemyMidHeroId()).toBeNull()

    manager.applyManualAction({ type: 'addEnemy', heroId: 17 })
    manager.applyManualAction({ type: 'setEnemyMid', heroId: 17 })

    expect(manager.getEnemyMidHeroId()).toBe(17)
  })

  it('сбрасывает ручные пики при новом матче (WAIT_FOR_PLAYERS_TO_LOAD)', () => {
    const manager = new DraftContextManager({ now: () => 1000 })
    manager.onGameState(gameState({ gameStateValue: 'DOTA_GAMERULES_STATE_HERO_SELECTION', heroId: 25 }))
    manager.applyManualAction({ type: 'addEnemy', heroId: 17 })
    manager.onGameState(gameState({ gameStateValue: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', heroId: 25 }))
    expect(manager.get().stage).toBe('finalized')

    manager.onGameState(gameState({ gameStateValue: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD', heroId: 0 }))

    expect(manager.get().stage).toBe('idle')
    expect(manager.get().enemyHeroIds).toEqual([])
    expect(manager.get().ownHeroId).toBeNull()
  })
})
