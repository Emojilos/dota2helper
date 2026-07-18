import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// json-logic-js exports named functions (no default export) — see @types/json-logic-js.
import { apply } from 'json-logic-js'
import { RulesConfigSchema, type JsonLogicValue } from '@shared/schemas/rules'

// RulesLogic<AddOps> (json-logic-js types) is a strict discriminated union of known
// operations; our schema's JsonLogicValue is intentionally a permissive structural
// type (any JSON Logic shape, format is content not code — see rules.ts). Bridge with
// a small helper instead of loosening the schema's exported type.
function evaluate(condition: JsonLogicValue, facts: unknown): unknown {
  return apply(condition as never, facts)
}

describe('TASK-042: rules.json schema + JSON Logic condition format', () => {
  it('validates content/rules.json against the schema', () => {
    const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/rules.json'), 'utf-8'))
    const config = RulesConfigSchema.parse(raw)
    expect(config.rules.length).toBeGreaterThan(0)
    expect(config.rules.every((rule) => rule.ruleId.length > 0)).toBe(true)
  })

  it('rejects a rule missing required fields (condition, ruleId)', () => {
    const missingCondition = {
      patch: '7.39',
      rules: [{ ruleId: 'r1', messageRu: 'x', cooldownSec: 10 }]
    }
    expect(RulesConfigSchema.safeParse(missingCondition).success).toBe(false)

    const emptyRuleId = {
      patch: '7.39',
      rules: [{ ruleId: '', condition: { '==': [1, 1] }, messageRu: 'x', cooldownSec: 10 }]
    }
    expect(RulesConfigSchema.safeParse(emptyRuleId).success).toBe(false)
  })

  it('rejects duplicate rule_id within one config', () => {
    const dup = {
      patch: '7.39',
      rules: [
        { ruleId: 'same', condition: { '==': [1, 1] }, messageRu: 'a', cooldownSec: 10 },
        { ruleId: 'same', condition: { '==': [1, 1] }, messageRu: 'b', cooldownSec: 10 }
      ]
    }
    const result = RulesConfigSchema.safeParse(dup)
    expect(result.success).toBe(false)
  })

  it('fills defaults: priority=3, minVerbosity=minimal', () => {
    const parsed = RulesConfigSchema.parse({
      patch: '7.39',
      rules: [{ ruleId: 'r1', condition: { '==': [1, 1] }, messageRu: 'x', cooldownSec: 5 }]
    })
    expect(parsed.rules[0]?.priority).toBe(3)
    expect(parsed.rules[0]?.minVerbosity).toBe('minimal')
  })

  it('evaluates a rule condition from content/rules.json with json-logic-js on a facts object', () => {
    const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/rules.json'), 'utf-8'))
    const config = RulesConfigSchema.parse(raw)
    const lowHpRule = config.rules.find((rule) => rule.ruleId === 'low_hp_consider_recall')
    expect(lowHpRule).toBeDefined()

    // safe evaluator (json-logic-js), NOT eval() — condition is pure data. Rule condition uses
    // flat var paths matching the real engine/facts.Facts shape (TASK-041), not a nested `hero.*`
    // prefix — Facts is already player-scoped, there is no wrapping `hero` object.
    expect(evaluate(lowHpRule!.condition, { healthPercent: 25, manaPercent: 10 })).toBe(true)
    expect(evaluate(lowHpRule!.condition, { healthPercent: 80, manaPercent: 10 })).toBe(false)
  })

  it('evaluates a compound (and/or) JSON Logic condition over facts', () => {
    const condition: JsonLogicValue = {
      and: [{ '<': [{ var: 'hero.manaPercent' }, 20] }, { '>=': [{ var: 'hero.level' }, 6] }]
    }
    expect(evaluate(condition, { hero: { manaPercent: 10, level: 7 } })).toBe(true)
    expect(evaluate(condition, { hero: { manaPercent: 10, level: 3 } })).toBe(false)
  })
})
