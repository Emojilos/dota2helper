/**
 * Юнит-тесты чистого ядра engine/rules (F4, TASK-043).
 *
 * Покрывают test_steps задачи:
 *  - Storm Spirit (ultIsKillWindow=true) при готовой ульте даёт кандидата,
 *    TA (ultIsKillWindow=false) — нет (герой-зависимость через facts).
 *  - правило TP-напоминания срабатывает, когда факты его удовлетворяют.
 *  - evaluator чистый (без cooldown/времени) и не тянет electron/fs/react
 *    (проверяется отдельно `npm run lint:boundaries`).
 */
import { describe, expect, it } from 'vitest'
import { evaluateRules } from '@engine/rules'
import { buildFacts, type Facts } from '@engine/facts'
import type { GameState } from '@shared/schemas/gameState'
import type { HeroProfile } from '@shared/schemas/heroProfiles'
import type { Rule } from '@shared/schemas/rules'

function heroProfile(overrides: Partial<HeroProfile> = {}): HeroProfile {
  return {
    heroId: 17,
    ultIsKillWindow: true,
    powerSpikeLevels: [6, 7],
    aggressionPattern: 'all_in',
    typicalLevel6TimeSec: 360,
    notes: '',
    ...overrides
  }
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    map: {
      matchId: '123',
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      clockTime: 360,
      gameTime: 400,
      daytime: true,
      paused: false,
      radiantScore: 0,
      direScore: 0,
      winTeam: null
    },
    player: {
      steamId: '1',
      name: 'me',
      team: null,
      kills: 1,
      deaths: 2,
      assists: 0,
      lastHits: 40,
      denies: 2,
      gold: 800,
      gpm: 400,
      xpm: 450
    },
    hero: {
      id: 17,
      name: 'npc_dota_hero_storm_spirit',
      level: 6,
      alive: true,
      respawnSeconds: 0,
      healthPercent: 80,
      manaPercent: 90,
      buybackCost: 0,
      buybackCooldown: 0,
      ultStatus: 'ready'
    },
    abilities: [],
    items: [],
    ...overrides
  }
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    ruleId: 'test-rule',
    condition: true,
    messageRu: 'test message',
    priority: 3,
    cooldownSec: 30,
    minVerbosity: 'minimal',
    severity: 'timing',
    estimated: false,
    ...overrides
  }
}

const ultKillWindowRule = rule({
  ruleId: 'ult_kill_window',
  condition: { and: [{ '==': [{ var: 'myHero.ultIsKillWindow' }, true] }, { '==': [{ var: 'ultReady' }, true] }] },
  messageRu: 'Ульта готова — ищи размен',
  severity: 'opportunity'
})

const tpReminderRule = rule({
  ruleId: 'tp_reminder',
  condition: { '==': [{ var: 'hasTpScroll' }, false] },
  messageRu: 'Купи телепорт',
  severity: 'danger',
  priority: 4
})

describe('TASK-043: engine/rules evaluateRules', () => {
  it('Storm Spirit (ultIsKillWindow=true) with ult ready produces a candidate', () => {
    const facts = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, ultStatus: 'ready' } }),
      myHeroProfile: heroProfile({ heroId: 17, ultIsKillWindow: true })
    })
    const candidates = evaluateRules(facts, [ultKillWindowRule])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toEqual({
      ruleId: 'ult_kill_window',
      message: 'Ульта готова — ищи размен',
      priority: 3,
      severity: 'opportunity',
      estimated: false,
      minVerbosity: 'minimal'
    })
  })

  it('Templar Assassin (ultIsKillWindow=false) with ult ready does NOT produce a candidate', () => {
    const facts = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, ultStatus: 'ready' } }),
      myHeroProfile: heroProfile({ heroId: 46, ultIsKillWindow: false })
    })
    const candidates = evaluateRules(facts, [ultKillWindowRule])
    expect(candidates).toEqual([])
  })

  it('a TP-reminder rule fires when facts satisfy it (no tp scroll) and not when they do not', () => {
    const withoutTp = buildFacts({ gameState: gameState({ items: [] }) })
    expect(evaluateRules(withoutTp, [tpReminderRule])).toHaveLength(1)

    const withTp = buildFacts({
      gameState: gameState({ items: [{ name: 'item_tpscroll', slot: 0, cooldown: 0, charges: 0 }] })
    })
    expect(evaluateRules(withTp, [tpReminderRule])).toEqual([])
  })

  it('evaluates multiple rules independently and preserves rule order', () => {
    const facts = buildFacts({
      gameState: gameState({ items: [] }),
      myHeroProfile: heroProfile({ ultIsKillWindow: true })
    })
    const candidates = evaluateRules(facts, [ultKillWindowRule, tpReminderRule])
    expect(candidates.map((c) => c.ruleId)).toEqual(['ult_kill_window', 'tp_reminder'])
  })

  it('does not crash on a malformed condition (unknown operator) — treats it as non-matching', () => {
    const facts = buildFacts({ gameState: gameState() })
    const malformed = rule({ ruleId: 'broken', condition: { unknownOp: [1, 2] } })
    expect(() => evaluateRules(facts, [malformed])).not.toThrow()
    expect(evaluateRules(facts, [malformed])).toEqual([])
  })

  it('is pure: repeated calls with identical inputs give identical results (no cooldown/state)', () => {
    const facts = buildFacts({ gameState: gameState({ items: [] }) })
    const first = evaluateRules(facts, [tpReminderRule])
    const second = evaluateRules(facts, [tpReminderRule])
    expect(first).toEqual(second)
  })

  it('carries the estimated flag from the rule content through to the candidate', () => {
    const estimatedRule = rule({
      ruleId: 'enemy_probably_low',
      condition: true,
      estimated: true
    })
    const facts: Facts = buildFacts({ gameState: gameState() })
    const [candidate] = evaluateRules(facts, [estimatedRule])
    expect(candidate?.estimated).toBe(true)
  })

  it('returns an empty array for an empty rule set', () => {
    const facts = buildFacts({ gameState: gameState() })
    expect(evaluateRules(facts, [])).toEqual([])
  })
})
