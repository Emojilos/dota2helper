/**
 * engine/facts — ЧИСТОЕ ядро fact-builder'а (F4, TASK-041).
 *
 * buildFacts(): (GameState + hero-profiles + matchup-контекст) → плоский
 * объект фактов, на котором работают правила F4 (json-logic, TASK-043).
 * Не тянет electron/react/fs/сеть/Date.now (INV2): игровое время берётся из
 * GameState.map.clockTime (само GameState уже собрано main-оркестратором из
 * GSI), а всё, чего сама Dota не даёт (профиль вражеского мидера, matchup-
 * контекст, конфиг таймингов, пороги) подаётся явно аргументами — модуль не
 * лезет в content/ напрямую и не хранит состояние между вызовами.
 *
 * Модель врага (раздел 5.2/F4 PRD): GSI не отдаёт уровень/способности
 * вражеских героев. estimatedLevel в enemyHero — ОЦЕНКА по игровому времени и
 * typicalLevel6TimeSec профиля вражеского героя, намеренно занижена (floor, не
 * round) и явно помечена isEstimate:true — правила/UI обязаны показывать
 * такие подсказки со словом «вероятно» (раздел F4 PRD), а не как факт.
 */
import type { GameState } from '@shared/schemas/gameState'
import type { HeroProfile } from '@shared/schemas/heroProfiles'
import type { TimingEvent } from '@shared/schemas/timings'

/**
 * Матчап-контекст текущей пары (matchup-knowledge.json kill_windows,
 * TASK-035) — на каких уровнях СВОЕГО героя матчап даёт киллвиндоу против
 * текущего врага. Опционален: конфиг может быть ещё не наполнен для пары,
 * или враг вне базы знаний (F2 статистический fallback).
 */
export interface MatchupFactsContext {
  killWindowLevels: readonly number[]
}

/** Пороги для производных hp/mana-фактов. Дефолты — из примера правила F4 PRD ("hp < 35% && mana < 20%"). */
export interface FactsThresholds {
  lowHealthPercent?: number
  lowManaPercent?: number
}

export interface FactsInput {
  gameState: GameState
  /** профиль своего героя (hero-profiles.json по gameState.hero.id); undefined — героя нет в базе профилей. */
  myHeroProfile?: HeroProfile
  /** id вражеского мидера — из драфта (TASK-027, ручной/авто ввод); GSI его напрямую не даёт. */
  enemyMidHeroId?: number
  /** профиль вражеского мидера (hero-profiles.json по enemyMidHeroId). */
  enemyHeroProfile?: HeroProfile
  matchup?: MatchupFactsContext
  /** события таймингов (timings.json, TASK-012) — источник расписания руны силы для powerRuneWindow (без дублирования магических чисел, INV4). */
  timingEvents?: readonly TimingEvent[]
  /** окно вокруг наступления руны силы, сек (раздел F4 PRD: "± 30 сек"). Дефолт 30. */
  powerRuneWindowSec?: number
  thresholds?: FactsThresholds
}

export interface EstimatedLevel {
  value: number
  /** всегда true: GSI не отдаёт уровень врага, это ОЦЕНКА — правила/UI обязаны помечать такие подсказки как «вероятно» (раздел F4 PRD). */
  isEstimate: true
}

export interface EnemyHeroFacts {
  heroId: number | null
  ultIsKillWindow: boolean | null
  estimatedLevel: EstimatedLevel | null
}

export interface MyHeroFacts {
  ultIsKillWindow: boolean | null
  powerSpikeLevels: readonly number[]
  isPowerSpikeLevel: boolean
}

export interface MatchupFacts {
  killWindowAtLevel: boolean
}

export interface Facts {
  clockTimeSec: number
  gameTimeSec: number
  daytime: boolean
  matchState: string

  heroAlive: boolean
  respawnSeconds: number
  level: number
  healthPercent: number
  manaPercent: number
  healthLow: boolean
  manaLow: boolean

  gold: number
  kills: number
  deaths: number
  assists: number
  lastHits: number
  denies: number
  gpm: number
  xpm: number

  buybackCooldownSec: number
  buybackAvailable: boolean
  ultReady: boolean
  hasTpScroll: boolean

  powerRuneWindow: boolean

  myHero: MyHeroFacts
  enemyHero: EnemyHeroFacts
  matchup: MatchupFacts
}

const DEFAULT_LOW_HEALTH_PERCENT = 35
const DEFAULT_LOW_MANA_PERCENT = 20
const DEFAULT_POWER_RUNE_WINDOW_SEC = 30
const MAX_ESTIMATED_LEVEL = 25
const LEVEL_AT_TYPICAL_TIME = 6

export function buildFacts(input: FactsInput): Facts {
  const { gameState } = input
  const map = gameState.map
  const hero = gameState.hero
  const player = gameState.player

  const clockTimeSec = map?.clockTime ?? 0
  const healthPercent = hero?.healthPercent ?? 0
  const manaPercent = hero?.manaPercent ?? 0
  const level = hero?.level ?? 0
  const buybackCooldownSec = hero?.buybackCooldown ?? 0

  const lowHealthPercent = input.thresholds?.lowHealthPercent ?? DEFAULT_LOW_HEALTH_PERCENT
  const lowManaPercent = input.thresholds?.lowManaPercent ?? DEFAULT_LOW_MANA_PERCENT

  return {
    clockTimeSec,
    gameTimeSec: map?.gameTime ?? 0,
    daytime: map?.daytime ?? true,
    matchState: map?.gameState ?? 'DOTA_GAMERULES_STATE_INIT',

    heroAlive: hero?.alive ?? true,
    respawnSeconds: hero?.respawnSeconds ?? 0,
    level,
    healthPercent,
    manaPercent,
    healthLow: healthPercent < lowHealthPercent,
    manaLow: manaPercent < lowManaPercent,

    gold: player?.gold ?? 0,
    kills: player?.kills ?? 0,
    deaths: player?.deaths ?? 0,
    assists: player?.assists ?? 0,
    lastHits: player?.lastHits ?? 0,
    denies: player?.denies ?? 0,
    gpm: player?.gpm ?? 0,
    xpm: player?.xpm ?? 0,

    buybackCooldownSec,
    buybackAvailable: buybackCooldownSec <= 0,
    ultReady: hero?.ultStatus === 'ready',
    hasTpScroll: gameState.items.some((item) => item.name === 'item_tpscroll'),

    powerRuneWindow: computePowerRuneWindow(
      clockTimeSec,
      input.timingEvents,
      input.powerRuneWindowSec ?? DEFAULT_POWER_RUNE_WINDOW_SEC
    ),

    myHero: buildMyHeroFacts(input.myHeroProfile, level),
    enemyHero: buildEnemyHeroFacts(input.enemyMidHeroId, input.enemyHeroProfile, clockTimeSec),
    matchup: {
      killWindowAtLevel: input.matchup?.killWindowLevels.includes(level) ?? false
    }
  }
}

function buildMyHeroFacts(profile: HeroProfile | undefined, level: number): MyHeroFacts {
  if (!profile) {
    return { ultIsKillWindow: null, powerSpikeLevels: [], isPowerSpikeLevel: false }
  }
  return {
    ultIsKillWindow: profile.ultIsKillWindow,
    powerSpikeLevels: profile.powerSpikeLevels,
    isPowerSpikeLevel: profile.powerSpikeLevels.includes(level)
  }
}

function buildEnemyHeroFacts(
  heroId: number | undefined,
  profile: HeroProfile | undefined,
  clockTimeSec: number
): EnemyHeroFacts {
  if (heroId === undefined) {
    return { heroId: null, ultIsKillWindow: null, estimatedLevel: null }
  }
  return {
    heroId,
    ultIsKillWindow: profile?.ultIsKillWindow ?? null,
    estimatedLevel: profile ? estimateEnemyLevel(clockTimeSec, profile.typicalLevel6TimeSec) : null
  }
}

/**
 * Оценка уровня вражеского мидера по игровому времени и медиане времени
 * получения 6 уровня его героя (typical_level6_time_sec, hero-profiles.json).
 * Линейная экстраполяция от уровня 6 — сама по себе грубая (реальная XP-
 * кривая нелинейна, точная калибровка — задача TASK-038 бенчмарков),
 * намеренно занижена (Math.floor вместо round): раздел F4 PRD требует
 * консервативных оценок угрозы от врага, чтобы не давать ложных «вероятно».
 */
function estimateEnemyLevel(clockTimeSec: number, typicalLevel6TimeSec: number): EstimatedLevel {
  if (clockTimeSec <= 0) {
    return { value: 1, isEstimate: true }
  }
  const raw = Math.floor((LEVEL_AT_TYPICAL_TIME * clockTimeSec) / typicalLevel6TimeSec)
  const value = Math.min(MAX_ESTIMATED_LEVEL, Math.max(1, raw))
  return { value, isEstimate: true }
}

/**
 * Ближайшее наступление интервального расписания к `atSec` — в отличие от
 * engine/timings.nextOccurrence (ищет только вперёд), может вернуть момент
 * из прошлого: powerRuneWindow — непрерывный факт «сейчас рядом с руной»,
 * а не одноразовый триггер уведомления.
 */
function nearestIntervalOccurrence(startSec: number, intervalSec: number, atSec: number): number {
  const k = Math.round((atSec - startSec) / intervalSec)
  return startSec + k * intervalSec
}

/**
 * true, если текущее игровое время в пределах windowSec от ближайшего
 * наступления события 'power_runes' в timingEvents (timings.json, TASK-012).
 * Расписание руны силы не дублируется в engine — читается из schedule
 * события (INV4); при отсутствии events/события — false (нет данных).
 */
function computePowerRuneWindow(
  clockTimeSec: number,
  timingEvents: readonly TimingEvent[] | undefined,
  windowSec: number
): boolean {
  const event = timingEvents?.find((e) => e.id === 'power_runes')
  if (!event || event.schedule.kind !== 'interval') {
    return false
  }
  const occurrence = nearestIntervalOccurrence(
    event.schedule.startSec,
    event.schedule.intervalSec,
    clockTimeSec
  )
  return Math.abs(occurrence - clockTimeSec) <= windowSec
}
