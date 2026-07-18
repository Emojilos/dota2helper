/**
 * engine/rules — ЧИСТОЕ ядро rule-evaluator'а (F4, TASK-043).
 *
 * evaluateRules(): (Facts, Rule[]) → AdviceCandidate[] — прогоняет condition
 * (JSON Logic, TASK-042) каждого правила через json-logic-js.apply() над
 * плоским объектом фактов (TASK-041, engine/facts). json-logic-js — БЕЗОПАСНЫЙ
 * DSL-евалюатор данных, не eval(): condition — данные из content/rules.json
 * (INV4), а не исполняемый код.
 *
 * Намеренно НЕ содержит cooldown/лимиты/время — это ответственность
 * stateful advice-gate (TASK-044, расширяет AdviceScheduler TASK-013).
 * Здесь только чистая функция срабатывания: один и тот же вход всегда даёт
 * один и тот же результат, без Date.now/electron/fs/сети (INV2).
 *
 * Герой-зависимость: не свойство самого evaluator'а, а следствие того, что
 * facts.myHero/facts.enemyHero уже собраны buildFacts() из hero-profiles
 * (TASK-034) — одно и то же правило матчится или нет в зависимости от того,
 * какие профили попали в Facts (см. test: Storm Spirit vs TA на готовой ульте).
 */
import { apply } from 'json-logic-js'
import type { Facts } from '@engine/facts'
import type { AdviceSeverity } from '@shared/schemas/advice'
import type { Rule } from '@shared/schemas/rules'
import type { Verbosity } from '@shared/schemas/settings'

/**
 * Advice минус id/createdAtMs (проставляет stateful gate, TASK-044) и минус
 * cooldown-состояние (это ядро не хранит историю срабатываний).
 */
export interface AdviceCandidate {
  ruleId: string
  message: string
  priority: number
  severity: AdviceSeverity
  estimated: boolean
  minVerbosity: Verbosity
}

/**
 * Прогоняет все правила против одного снимка фактов. Правило срабатывает,
 * если apply(condition, facts) truthy (стандартная JSON Logic семантика).
 * Ошибка внутри одного условия (напр. неизвестный оператор в кривом
 * content/rules.json) не должна ронять остальные правила — некорректное
 * правило просто не матчится, а не валит evaluator целиком.
 */
export function evaluateRules(facts: Facts, rules: readonly Rule[]): AdviceCandidate[] {
  const candidates: AdviceCandidate[] = []
  for (const rule of rules) {
    if (ruleMatches(rule, facts)) {
      candidates.push({
        ruleId: rule.ruleId,
        message: rule.messageRu,
        priority: rule.priority,
        severity: rule.severity,
        estimated: rule.estimated,
        minVerbosity: rule.minVerbosity
      })
    }
  }
  return candidates
}

function ruleMatches(rule: Rule, facts: Facts): boolean {
  try {
    return Boolean(apply(rule.condition as never, facts as unknown as object))
  } catch {
    return false
  }
}
