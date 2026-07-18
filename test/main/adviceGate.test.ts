/**
 * Тесты AdviceGate (main, F4, TASK-044).
 *
 * Покрывают test_step'ы:
 *  - Шаг 1: поток срабатываний одного правила — на выходе не чаще 1/30 сек
 *    (глобальный лимит, wall-clock).
 *  - Шаг 2: резкая потеря >30% HP за 3с (активный файт) — F3-уведомление
 *    'opportunity' (напоминание о стаке) подавляется.
 *  - Шаг 3: смерть героя — F4-подсказка 'opportunity' (окно агрессии) не
 *    показывается.
 * Плюс: per-rule cooldown независим от глобального лимита, danger никогда не
 * подавляется, herо-зависимость эвейлюатора не ломается гейтом, reset().
 */
import { describe, expect, it } from 'vitest'
import { AdviceGate } from '@main/advice'
import type { Facts } from '@engine/facts'
import type { Rule } from '@shared/schemas/rules'
import type { Advice } from '@shared/schemas/advice'

function baseFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    clockTimeSec: 100,
    gameTimeSec: 100,
    daytime: true,
    matchState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
    heroAlive: true,
    respawnSeconds: 0,
    level: 6,
    healthPercent: 100,
    manaPercent: 100,
    healthLow: false,
    manaLow: false,
    gold: 1000,
    kills: 0,
    deaths: 0,
    assists: 0,
    lastHits: 20,
    denies: 2,
    gpm: 500,
    xpm: 500,
    buybackCooldownSec: 0,
    buybackAvailable: true,
    ultReady: true,
    hasTpScroll: true,
    powerRuneWindow: false,
    myHero: { ultIsKillWindow: true, powerSpikeLevels: [6], isPowerSpikeLevel: true },
    enemyHero: { heroId: null, ultIsKillWindow: null, estimatedLevel: null },
    matchup: { killWindowAtLevel: false },
    ...overrides
  }
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    ruleId: 'ult_ready_aggression_window',
    condition: { '==': [{ var: 'ultReady' }, true] },
    messageRu: 'Ульта готова — окно агрессии',
    priority: 3,
    cooldownSec: 10,
    minVerbosity: 'minimal',
    severity: 'opportunity',
    estimated: false,
    ...overrides
  }
}

function makeGate(nowRef: { value: number }, overrides: Partial<ConstructorParameters<typeof AdviceGate>[0]> = {}) {
  const emitted: Advice[] = []
  const gate = new AdviceGate({
    emit: (advice) => emitted.push(advice),
    now: () => nowRef.value,
    idFactory: (() => {
      let n = 0
      return () => `advice_${n++}`
    })(),
    ...overrides
  })
  return { gate, emitted }
}

describe('AdviceGate', () => {
  it('глобальный лимит — не чаще 1 F4-подсказки в 30 сек, даже если правило матчится каждый тик (шаг 1)', () => {
    const nowRef = { value: 0 }
    const { gate, emitted } = makeGate(nowRef)
    const rules = [rule({ cooldownSec: 0 })] // cooldown правила не мешает — проверяем именно глобальный лимит

    for (let tickMs = 0; tickMs <= 60_000; tickMs += 500) {
      nowRef.value = tickMs
      gate.onFacts(baseFacts(), rules)
    }

    // 60 секунд потока при глобальном лимите 30с → максимум 3 показа (t=0, 30000, 60000).
    expect(emitted.length).toBe(3)
    expect(emitted.map((a) => a.createdAtMs)).toEqual([0, 30_000, 60_000])
  })

  it('активный файт (потеря >30% HP за 3с) подавляет F3-уведомление opportunity — напоминание о стаке (шаг 2)', () => {
    const nowRef = { value: 0 }
    const { gate } = makeGate(nowRef)

    // Тик до файта: полное HP, герой жив — не подавлено.
    gate.onFacts(baseFacts({ healthPercent: 100 }), [])
    expect(gate.isSuppressed('opportunity')).toBe(false)

    // Резкая просадка HP: 100 -> 60 за 1.5 секунды (> 30 п.п. за окно 3с).
    nowRef.value = 1500
    gate.onFacts(baseFacts({ healthPercent: 60 }), [])

    expect(gate.isSuppressed('opportunity')).toBe(true) // напоминание о стаке (opportunity) подавлено
    expect(gate.isSuppressed('danger')).toBe(false) // опасность никогда не подавляется
  })

  it('смерть героя подавляет F4-подсказку-окно агрессии (severity=opportunity) (шаг 3)', () => {
    const nowRef = { value: 0 }
    const { gate, emitted } = makeGate(nowRef)
    const rules = [rule()]

    gate.onFacts(baseFacts({ heroAlive: false }), rules)

    expect(emitted).toEqual([])
    expect(gate.isSuppressed('opportunity')).toBe(true)
  })

  it('живой герой вне файта — F4-подсказка проходит и получает id/createdAtMs от гейта', () => {
    const nowRef = { value: 1234 }
    const { gate, emitted } = makeGate(nowRef)

    gate.onFacts(baseFacts(), [rule()])

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
      ruleId: 'ult_ready_aggression_window',
      message: 'Ульта готова — окно агрессии',
      severity: 'opportunity',
      priority: 3,
      estimated: false,
      createdAtMs: 1234
    })
    expect(emitted[0]!.id).toBeTruthy()
  })

  it('per-rule cooldown блокирует повтор ДО истечения cooldownSec независимо от глобального лимита', () => {
    const nowRef = { value: 0 }
    const { gate, emitted } = makeGate(nowRef, { globalCooldownMs: 0 }) // глобальный лимит отключен — изолируем per-rule cooldown
    const rules = [rule({ cooldownSec: 5 })]

    gate.onFacts(baseFacts(), rules)
    nowRef.value = 4999
    gate.onFacts(baseFacts(), rules) // ещё не прошло 5с — не должно повториться
    nowRef.value = 5000
    gate.onFacts(baseFacts(), rules) // ровно 5с — повтор разрешён

    expect(emitted.map((a) => a.createdAtMs)).toEqual([0, 5000])
  })

  it('danger никогда не подавляется — проходит даже мёртвому герою в файте', () => {
    const nowRef = { value: 0 }
    const { gate, emitted } = makeGate(nowRef)
    const dangerRule = rule({ ruleId: 'low_hp', severity: 'danger', cooldownSec: 0 })

    gate.onFacts(baseFacts({ heroAlive: false, healthPercent: 10 }), [dangerRule])

    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.severity).toBe('danger')
  })

  it('герой-зависимость evaluateRules сохраняется через гейт: TA (ultIsKillWindow=false) не матчит то же правило-условие, что Storm', () => {
    const nowRef = { value: 0 }
    const { gate, emitted } = makeGate(nowRef)
    const heroAwareRule = rule({
      condition: { '==': [{ var: 'myHero.ultIsKillWindow' }, true] }
    })

    gate.onFacts(baseFacts({ myHero: { ultIsKillWindow: false, powerSpikeLevels: [], isPowerSpikeLevel: false } }), [
      heroAwareRule
    ])
    expect(emitted).toEqual([])

    nowRef.value = 1000
    gate.onFacts(baseFacts({ myHero: { ultIsKillWindow: true, powerSpikeLevels: [], isPowerSpikeLevel: false } }), [
      heroAwareRule
    ])
    expect(emitted).toHaveLength(1)
  })

  it('reset() сбрасывает историю HP/кулдауны — герой снова считается живым и вне файта', () => {
    const nowRef = { value: 0 }
    const { gate } = makeGate(nowRef)

    gate.onFacts(baseFacts({ heroAlive: false, healthPercent: 5 }), [])
    expect(gate.isSuppressed('opportunity')).toBe(true)

    gate.reset()
    expect(gate.isSuppressed('opportunity')).toBe(false)
  })
})
