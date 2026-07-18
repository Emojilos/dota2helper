/**
 * Юнит-тесты чистого ядра engine/facts (F4, TASK-041).
 *
 * Покрывают test_steps задачи: факты на фикстурах GameState совпадают с
 * ожидаемыми; estimatedLevel помечен isEstimate:true и рассчитан
 * консервативно (floor, не round); модуль не тянет electron/fs/react
 * (проверяется отдельно `npm run lint:boundaries`).
 */
import { describe, expect, it } from 'vitest'
import { buildFacts } from '@engine/facts'
import type { GameState } from '@shared/schemas/gameState'
import type { HeroProfile } from '@shared/schemas/heroProfiles'
import type { TimingEvent } from '@shared/schemas/timings'

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

const powerRunesEvent: TimingEvent = {
  id: 'power_runes',
  labelRu: 'Руны силы',
  severity: 'timing',
  priority: 3,
  schedule: { kind: 'interval', intervalSec: 360, startSec: 360 },
  warnBeforeSec: 30,
  enabledByDefault: true
}

describe('TASK-041: engine/facts buildFacts', () => {
  it('maps plain GameState fields directly', () => {
    const facts = buildFacts({ gameState: gameState() })
    expect(facts.clockTimeSec).toBe(360)
    expect(facts.gameTimeSec).toBe(400)
    expect(facts.level).toBe(6)
    expect(facts.healthPercent).toBe(80)
    expect(facts.manaPercent).toBe(90)
    expect(facts.gold).toBe(800)
    expect(facts.deaths).toBe(2)
    expect(facts.ultReady).toBe(true)
    expect(facts.heroAlive).toBe(true)
  })

  it('falls back to defaults when map/player/hero are null (e.g. HERO_SELECTION)', () => {
    const facts = buildFacts({
      gameState: { map: null, player: null, hero: null, abilities: [], items: [] }
    })
    expect(facts.clockTimeSec).toBe(0)
    expect(facts.heroAlive).toBe(true)
    expect(facts.level).toBe(0)
    expect(facts.ultReady).toBe(false)
    expect(facts.myHero).toEqual({ ultIsKillWindow: null, powerSpikeLevels: [], isPowerSpikeLevel: false })
    expect(facts.enemyHero).toEqual({ heroId: null, ultIsKillWindow: null, estimatedLevel: null })
  })

  it('derives healthLow/manaLow from configurable thresholds (default 35/20, PRD F4 example)', () => {
    const low = buildFacts({
      gameState: gameState({
        hero: { ...gameState().hero!, healthPercent: 30, manaPercent: 15 }
      })
    })
    expect(low.healthLow).toBe(true)
    expect(low.manaLow).toBe(true)

    const high = buildFacts({ gameState: gameState() })
    expect(high.healthLow).toBe(false)
    expect(high.manaLow).toBe(false)

    const customThreshold = buildFacts({
      gameState: gameState(),
      thresholds: { lowHealthPercent: 90 }
    })
    expect(customThreshold.healthLow).toBe(true)
  })

  it('derives buybackAvailable from buybackCooldown edge (<=0)', () => {
    const available = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, buybackCooldown: 0 } })
    })
    expect(available.buybackAvailable).toBe(true)

    const onCooldown = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, buybackCooldown: 45 } })
    })
    expect(onCooldown.buybackAvailable).toBe(false)
  })

  it('derives hasTpScroll from items array by name', () => {
    const withTp = buildFacts({
      gameState: gameState({
        items: [{ name: 'item_tpscroll', slot: 0, cooldown: 0, charges: 0 }]
      })
    })
    expect(withTp.hasTpScroll).toBe(true)

    const withoutTp = buildFacts({ gameState: gameState() })
    expect(withoutTp.hasTpScroll).toBe(false)
  })

  it('derives myHero.isPowerSpikeLevel from hero-profiles powerSpikeLevels', () => {
    const atSpike = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, level: 6 } }),
      myHeroProfile: heroProfile({ powerSpikeLevels: [6, 7] })
    })
    expect(atSpike.myHero.isPowerSpikeLevel).toBe(true)
    expect(atSpike.myHero.ultIsKillWindow).toBe(true)

    const notAtSpike = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, level: 4 } }),
      myHeroProfile: heroProfile({ powerSpikeLevels: [6, 7] })
    })
    expect(notAtSpike.myHero.isPowerSpikeLevel).toBe(false)
  })

  it('estimates enemyHero.estimatedLevel conservatively (floor) and marks isEstimate:true', () => {
    // typicalLevel6TimeSec=360; at clockTime=360 raw = 6*360/360 = 6 exactly.
    const exact = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 360 } }),
      enemyMidHeroId: 11,
      enemyHeroProfile: heroProfile({ heroId: 11, typicalLevel6TimeSec: 360 })
    })
    expect(exact.enemyHero.heroId).toBe(11)
    expect(exact.enemyHero.estimatedLevel).toEqual({ value: 6, isEstimate: true })

    // at clockTime=539 raw = 6*539/360 = 8.98(3) -> floor 8, NOT round to 9 (conservative).
    const flooredNotRounded = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 539 } }),
      enemyMidHeroId: 11,
      enemyHeroProfile: heroProfile({ heroId: 11, typicalLevel6TimeSec: 360 })
    })
    expect(flooredNotRounded.enemyHero.estimatedLevel!.value).toBe(8)
    expect(flooredNotRounded.enemyHero.estimatedLevel!.isEstimate).toBe(true)

    // negative/pre-0:00 clock time clamps to level 1, never below.
    const preGame = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: -30 } }),
      enemyMidHeroId: 11,
      enemyHeroProfile: heroProfile({ heroId: 11, typicalLevel6TimeSec: 360 })
    })
    expect(preGame.enemyHero.estimatedLevel).toEqual({ value: 1, isEstimate: true })

    // far into the game clamps at MAX_ESTIMATED_LEVEL=25, does not overshoot 25.
    const lateGame = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 100000 } }),
      enemyMidHeroId: 11,
      enemyHeroProfile: heroProfile({ heroId: 11, typicalLevel6TimeSec: 360 })
    })
    expect(lateGame.enemyHero.estimatedLevel!.value).toBe(25)
  })

  it('enemyHero.estimatedLevel is null when heroId known but profile missing', () => {
    const facts = buildFacts({ gameState: gameState(), enemyMidHeroId: 999 })
    expect(facts.enemyHero.heroId).toBe(999)
    expect(facts.enemyHero.ultIsKillWindow).toBeNull()
    expect(facts.enemyHero.estimatedLevel).toBeNull()
  })

  it('derives matchup.killWindowAtLevel from matchup context and current level', () => {
    const inWindow = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, level: 6 } }),
      matchup: { killWindowLevels: [6, 11] }
    })
    expect(inWindow.matchup.killWindowAtLevel).toBe(true)

    const outOfWindow = buildFacts({
      gameState: gameState({ hero: { ...gameState().hero!, level: 5 } }),
      matchup: { killWindowLevels: [6, 11] }
    })
    expect(outOfWindow.matchup.killWindowAtLevel).toBe(false)

    const noMatchup = buildFacts({ gameState: gameState() })
    expect(noMatchup.matchup.killWindowAtLevel).toBe(false)
  })

  it('derives powerRuneWindow from timingEvents power_runes schedule within +-30s default', () => {
    const near = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 345 } }), // 15s before 360
      timingEvents: [powerRunesEvent]
    })
    expect(near.powerRuneWindow).toBe(true)

    const far = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 200 } }),
      timingEvents: [powerRunesEvent]
    })
    expect(far.powerRuneWindow).toBe(false)

    const noEvents = buildFacts({ gameState: gameState({ map: { ...gameState().map!, clockTime: 360 } }) })
    expect(noEvents.powerRuneWindow).toBe(false)

    const customWindow = buildFacts({
      gameState: gameState({ map: { ...gameState().map!, clockTime: 200 } }),
      timingEvents: [powerRunesEvent],
      powerRuneWindowSec: 200
    })
    expect(customWindow.powerRuneWindow).toBe(true)
  })
})
