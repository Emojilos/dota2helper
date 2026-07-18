/**
 * Интеграционные тесты РЕАЛЬНОГО content/rules.json (F4, TASK-045) поверх
 * реального content/hero-profiles.json и чистых buildFacts/evaluateRules.
 *
 * В отличие от test/engine/rules.test.ts (юнит-тесты evaluator'а на
 * авторских тестовых правилах) и test/shared/rules.test.ts (валидация
 * формата), этот файл проверяет, что КОНКРЕТНОЕ содержимое MVP-набора
 * из 10–15 правил (раздел F4 PRD, TASK-045) действительно герой-зависимо
 * на реальных профилях героев — то же самое событие (готовая ульта,
 * оценённый уровень 6, смерти) даёт разный набор кандидатов для Storm
 * Spirit (ultIsKillWindow=true) и Templar Assassin (ultIsKillWindow=false).
 *
 * Живой прогон в 3 тестовых матчах (test_steps TASK-045) требует реального
 * GSI-потока из клиента Dota 2 — вне возможностей автоматических тестов;
 * задокументировано как риск/ограничение (см. progress.txt).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildFacts } from '@engine/facts'
import { evaluateRules } from '@engine/rules'
import { RulesConfigSchema } from '@shared/schemas/rules'
import { HeroProfilesConfigSchema, type HeroProfile } from '@shared/schemas/heroProfiles'
import type { GameState } from '@shared/schemas/gameState'

function loadRules() {
  const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/rules.json'), 'utf-8'))
  return RulesConfigSchema.parse(raw).rules
}

function loadHeroProfile(heroId: number): HeroProfile {
  const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/hero-profiles.json'), 'utf-8'))
  const config = HeroProfilesConfigSchema.parse(raw)
  const profile = config.profiles.find((p) => p.heroId === heroId)
  if (!profile) throw new Error(`fixture assumption broken: hero ${heroId} missing from content/hero-profiles.json`)
  return profile
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
      deaths: 0,
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

const rules = loadRules()
const powerRuneEvents = [
  {
    id: 'power_runes',
    labelRu: 'Руна силы',
    severity: 'opportunity' as const,
    priority: 3,
    schedule: { kind: 'interval' as const, startSec: 0, intervalSec: 120 },
    warnBeforeSec: 15,
    enabledByDefault: true
  }
]

describe('TASK-045: real content/rules.json is hero-dependent (Storm Spirit vs Templar Assassin)', () => {
  it('Storm Spirit (ultIsKillWindow=true) with ult ready in the power-rune window fires the kill-window rule, not the fallback', () => {
    const storm = loadHeroProfile(17)
    const facts = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 0 } }),
      myHeroProfile: storm,
      timingEvents: powerRuneEvents
    })
    const candidates = evaluateRules(facts, rules)
    const ids = candidates.map((c) => c.ruleId)
    expect(ids).toContain('ult_kill_window_power_rune')
    expect(ids).not.toContain('ult_ready_no_kill_window')
  })

  it('Templar Assassin (ultIsKillWindow=false) with the same ult-ready + power-rune facts fires the non-burst fallback instead', () => {
    const ta = loadHeroProfile(46)
    const facts = buildFacts({
      gameState: gameState({
        hero: { ...gameState().hero!, id: 46, name: 'npc_dota_hero_templar_assassin' },
        map: { ...gameState().map!, clockTime: 0 }
      }),
      myHeroProfile: ta,
      timingEvents: powerRuneEvents
    })
    const candidates = evaluateRules(facts, rules)
    const ids = candidates.map((c) => c.ruleId)
    expect(ids).toContain('ult_ready_no_kill_window')
    expect(ids).not.toContain('ult_kill_window_power_rune')
  })

  it('a probably-6th-level enemy with a kill-window ult marks the advice candidate as estimated', () => {
    const stormEnemy = loadHeroProfile(17)
    const facts = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, healthPercent: 90, manaPercent: 90 } }),
      enemyMidHeroId: 17,
      enemyHeroProfile: stormEnemy
    })
    expect(facts.enemyHero.estimatedLevel?.value).toBeGreaterThanOrEqual(6)
    const candidates = evaluateRules(facts, rules)
    const enemyUltCandidate = candidates.find((c) => c.ruleId === 'enemy_probably_ult_ready_danger')
    expect(enemyUltCandidate).toBeDefined()
    expect(enemyUltCandidate?.estimated).toBe(true)
  })

  it('deaths >= 3 before the 12-minute mark fires the change-plan rule regardless of hero', () => {
    const facts = buildFacts({
      gameState: gameState({
        player: { ...gameState().player!, deaths: 3 },
        map: { ...gameState().map!, clockTime: 600 }
      })
    })
    expect(evaluateRules(facts, rules).map((c) => c.ruleId)).toContain('deaths_change_plan')
  })

  it('reaching a power-spike level with a matchup kill window fires the opportunity rule; without matchup knowledge it fires the softer fallback', () => {
    const storm = loadHeroProfile(17)
    const withMatchup = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, level: 6 } }),
      myHeroProfile: storm,
      matchup: { killWindowLevels: [6] }
    })
    expect(evaluateRules(withMatchup, rules).map((c) => c.ruleId)).toContain('power_spike_kill_window')

    const withoutMatchup = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, level: 6 } }),
      myHeroProfile: storm
    })
    const ids = evaluateRules(withoutMatchup, rules).map((c) => c.ruleId)
    expect(ids).toContain('power_spike_no_matchup_window')
    expect(ids).not.toContain('power_spike_kill_window')
  })

  it('every rule in the real config is well-formed and never throws when evaluated against baseline facts', () => {
    const facts = buildFacts({ gameState: gameState() })
    expect(() => evaluateRules(facts, rules)).not.toThrow()
    expect(rules.length).toBeGreaterThanOrEqual(10)
    expect(rules.length).toBeLessThanOrEqual(15)
  })
})
