/**
 * Регрессия на порядок подписки AdviceGate/TimingScheduler на GameStateStore
 * (main/index.ts): GameStateStore.set() уведомляет подписчиков синхронно в
 * порядке подписки. AdviceGate.isSuppressed() (F4, TASK-044) опирается на
 * healthHistory, обновляемый только внутри onFacts — поэтому AdviceGate
 * ДОЛЖНА подписаться на стор раньше TimingScheduler (F3, TASK-012), иначе
 * TimingScheduler.onAlert читает состояние подавления с ПРЕДЫДУЩЕГО тика,
 * а не текущего (см. правку порядка вызовов startAdviceGate/startTimingScheduler
 * в main/index.ts).
 */
import { describe, expect, it } from 'vitest'
import { GameStateStore } from '@main/gsi'
import { AdviceGate } from '@main/advice'
import { TimingScheduler } from '@main/timings'
import type { GameState } from '@shared/schemas/gameState'
import type { TimingsConfig } from '@shared/schemas/timings'
import type { Rule } from '@shared/schemas/rules'

function tickState(clockTimeSec: number, healthPercent: number): GameState {
  return {
    map: { clockTime: clockTimeSec, gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
    hero: { alive: true, healthPercent, buybackCooldown: 0 }
  } as unknown as GameState
}

// Никогда не срабатывает — нужен только чтобы onFacts прошёл дальше recordHealthSample.
const neverMatchingRule: Rule = {
  ruleId: 'never',
  condition: { '==': [1, 2] },
  messageRu: 'unused',
  priority: 3,
  cooldownSec: 0,
  minVerbosity: 'minimal',
  severity: 'timing',
  estimated: false
}

const waterRunes: TimingsConfig['events'][number] = {
  id: 'water_runes',
  labelRu: 'Руны воды',
  severity: 'timing',
  priority: 3,
  schedule: { kind: 'fixed', timesSec: [120] },
  warnBeforeSec: 20,
  enabledByDefault: true
}

/** Воспроизводит подписки main/index.ts (startAdviceGate/startTimingScheduler) в заданном порядке. */
function wire(order: 'advice-first' | 'timing-first') {
  const store = new GameStateStore()
  const suppressionAtAlert: boolean[] = []
  let nowMs = 0
  const adviceGate = new AdviceGate({ emit: () => {}, now: () => nowMs })

  const subscribeAdviceGate = (): void => {
    store.subscribe((state) => {
      const facts = {
        clockTimeSec: state.map?.clockTime ?? 0,
        gameTimeSec: 0,
        daytime: true,
        matchState: state.map?.gameState ?? 'DOTA_GAMERULES_STATE_INIT',
        heroAlive: state.hero?.alive ?? true,
        respawnSeconds: 0,
        level: 1,
        healthPercent: state.hero?.healthPercent ?? 100,
        manaPercent: 100,
        healthLow: false,
        manaLow: false,
        gold: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        lastHits: 0,
        denies: 0,
        gpm: 0,
        xpm: 0,
        buybackCooldownSec: 0,
        buybackAvailable: true,
        ultReady: false,
        hasTpScroll: false,
        powerRuneWindow: false,
        myHero: { ultIsKillWindow: null, powerSpikeLevels: [], isPowerSpikeLevel: false },
        enemyHero: { heroId: null, ultIsKillWindow: null, estimatedLevel: null },
        matchup: { killWindowAtLevel: false }
      }
      adviceGate.onFacts(facts, [neverMatchingRule])
    })
  }
  const subscribeTiming = (): void => {
    const scheduler = new TimingScheduler({
      store,
      getEvents: () => ({ patch: 'test', events: [waterRunes] }),
      onAlert: () => {
        suppressionAtAlert.push(adviceGate.isSuppressed('timing'))
      }
    })
    scheduler.start()
  }

  if (order === 'advice-first') {
    subscribeAdviceGate()
    subscribeTiming()
  } else {
    subscribeTiming()
    subscribeAdviceGate()
  }

  return {
    tick: (clockTimeSec: number, healthPercent: number, atMs: number) => {
      nowMs = atMs
      store.set(tickState(clockTimeSec, healthPercent))
    },
    suppressionAtAlert
  }
}

describe('AdviceGate/TimingScheduler subscription order (main/index.ts wiring)', () => {
  it('AdviceGate подписана раньше: активный файт этого же тика подавляет тайминговый алерт немедленно', () => {
    const { tick, suppressionAtAlert } = wire('advice-first')
    tick(90, 100, 0) // прогрев истории здоровья, алертов ещё нет (occurrence 120-20=100 не пересечено)
    tick(99, 100, 500)
    // окно (99,100] пересекает триггер руны воды; резкий обвал HP в этом же тике = активный файт
    tick(100, 60, 1000)

    expect(suppressionAtAlert).toEqual([true])
  })

  it('TimingScheduler подписан раньше (регрессия бага): тот же обвал HP не виден — алерт ошибочно проходит', () => {
    const { tick, suppressionAtAlert } = wire('timing-first')
    tick(90, 100, 0)
    tick(99, 100, 500)
    tick(100, 60, 1000)

    // Баг: TimingScheduler.onAlert читает isSuppressed ДО того, как AdviceGate
    // на этом же тике записал обвал HP — видит ещё не обновлённую (стабильную)
    // историю здоровья и не считает это файтом.
    expect(suppressionAtAlert).toEqual([false])
  })
})
