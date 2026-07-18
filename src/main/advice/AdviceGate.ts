/**
 * AdviceGate — stateful advice-gate F4 (TASK-044), расширяет пайплайн
 * уведомлений AdviceScheduler (TASK-013).
 *
 * Стоит МЕЖДУ источниками Advice (rule-evaluator F4/TASK-043 и TimingScheduler
 * F3/TASK-012) и AdviceScheduler.enqueue(): решает, ЧТО из сработавшего вообще
 * дойдёт до очереди показа, и не даёт ситуативным подсказкам спамить.
 *
 * Две независимые обязанности:
 *
 * 1. F4-конвейер (onFacts): на каждый тик GSI прогоняет evaluateRules() (чистый
 *    engine/rules, TASK-043) над текущими Facts и текущим content/rules.json,
 *    затем гейтит результат:
 *      - per-rule cooldownSec — правило не повторяется чаще, чем раз в
 *        cooldownSec СЕКУНД РЕАЛЬНОГО (wall-clock) времени с последнего показа.
 *      - глобальный лимит ≤1 ситуативной подсказки/30 сек (globalCooldownMs) —
 *        тоже wall-clock. Среди нескольких кандидатов, прошедших suppression и
 *        cooldown в одном тике, побеждает наивысший priority.
 *    Прошедшие кандидаты становятся Advice (id/createdAtMs проставляет гейт —
 *    ЭТО его ответственность, AdviceCandidate из TASK-043 их намеренно не несёт)
 *    и уходят в emit (обычно adviceScheduler.enqueue).
 *
 * 2. Умное подавление (isSuppressed): единая проверка «эта Advice сейчас
 *    неуместна», которой пользуется И F4-конвейер выше, И F3 TimingScheduler
 *    (напрямую, до adviceScheduler.enqueue — см. main/index.ts) — раздел F3 PRD
 *    прямо требует подавлять напоминание о стаке кемпа, если герой мёртв или
 *    идёт активный файт, а это F3-событие (camp_stack, severity='opportunity'),
 *    не F4-правило. Единая политика по severity (раздел 6 PRD: opportunity —
 *    окно агрессии/farm-возможность, timing — нейтральный тайминг, danger —
 *    опасность):
 *      - 'danger'      — никогда не подавляется (предупреждение об опасности
 *                        актуально всегда, в т.ч. в файте/на респауне).
 *      - 'opportunity' — подавляется, если герой мёртв (нечем воспользоваться
 *                        окном агрессии/фармом) ИЛИ идёт активный файт (сейчас
 *                        не время думать о стаке/руне).
 *      - 'timing'      — подавляется только во время активного файта (мёртвому
 *                        герою тайминг-напоминание всё ещё полезно на будущее,
 *                        а во время файта — просто шум).
 *    Активный файт детектится по СВОЕЙ истории healthPercent за последние
 *    fightWindowMs (эвристика раздела F3/F4 PRD: «потеря >30% HP за 3 сек»).
 *
 * ОТКРЫТЫЙ ВОПРОС #2 (tasks.json) ЗАКРЫТ ЭТИМ КОНТРАКТОМ: и per-rule cooldown, и
 * глобальный лимит, и окно детекта файта считаются в WALL-CLOCK времени
 * (nowMs, инъецируемый `now`), НЕ в игровом clock_time. Причина: cooldown_sec —
 * это UX-пейсинг «не наседай на игрока слишком часто в реальном времени» (сам
 * игрок читает и реагирует в реальном времени, а не в масштабе игровых часов);
 * эвристика «−30% HP за 3 сек» тем более обязана быть wall-clock — она про
 * физическую скорость реакции игрока, а не про игровую симуляцию. Facts.clockTimeSec
 * (игровое время) при этом продолжает использоваться ТОЛЬКО для матчинга
 * condition внутри evaluateRules — гейт его не трогает.
 *
 * INV1: живёт в main (мутируемое состояние, Date.now по умолчанию). INV2 к нему
 * не относится, но само ядро (evaluateRules) остаётся чистым — гейт лишь
 * оборачивает его состоянием.
 */
import { evaluateRules, type AdviceCandidate } from '@engine/rules'
import type { Facts } from '@engine/facts'
import type { Advice, AdviceSeverity } from '@shared/schemas/advice'
import type { Rule } from '@shared/schemas/rules'

const DEFAULT_GLOBAL_COOLDOWN_MS = 30_000
const DEFAULT_FIGHT_WINDOW_MS = 3000
const DEFAULT_FIGHT_HP_DROP_PERCENT = 30

export interface AdviceGateOptions {
  /** Доставка прошедшего гейт F4-Advice (обычно adviceScheduler.enqueue). */
  emit: (advice: Advice) => void
  /** Источник wall-clock времени (по умолчанию Date.now; инъецируется в тестах). */
  now?: () => number
  /** Фабрика id уведомления (по умолчанию — случайный, как в TimingScheduler). */
  idFactory?: () => string
  /** Глобальный минимальный интервал между показанными F4-подсказками, мс (по умолчанию 30000 — раздел F4 PRD «не более 1/30 сек»). */
  globalCooldownMs?: number
  /** Окно детекта активного файта, мс (по умолчанию 3000 — раздел F3/F4 PRD). */
  fightWindowMs?: number
  /** Порог просадки healthPercent (в процентных пунктах) в пределах fightWindowMs, начиная с которого считаем файт активным (по умолчанию 30). */
  fightHpDropPercent?: number
}

interface HealthSample {
  atMs: number
  healthPercent: number
}

export class AdviceGate {
  private readonly emit: (advice: Advice) => void
  private readonly now: () => number
  private readonly idFactory: () => string
  private readonly globalCooldownMs: number
  private readonly fightWindowMs: number
  private readonly fightHpDropPercent: number

  private readonly lastFiredAtMsByRule = new Map<string, number>()
  private lastGlobalFireAtMs: number | null = null
  private healthHistory: HealthSample[] = []
  private heroAlive = true

  constructor(options: AdviceGateOptions) {
    this.emit = options.emit
    this.now = options.now ?? Date.now
    this.idFactory = options.idFactory ?? defaultIdFactory
    this.globalCooldownMs = options.globalCooldownMs ?? DEFAULT_GLOBAL_COOLDOWN_MS
    this.fightWindowMs = options.fightWindowMs ?? DEFAULT_FIGHT_WINDOW_MS
    this.fightHpDropPercent = options.fightHpDropPercent ?? DEFAULT_FIGHT_HP_DROP_PERCENT
  }

  /**
   * Один тик GSI для F4: обновляет состояние подавления (здоровье/жизнь героя
   * из тех же facts), прогоняет правила и эмиттит прошедшие suppression +
   * cooldown + глобальный лимит кандидаты как Advice.
   */
  onFacts(facts: Facts, rules: readonly Rule[]): void {
    const nowMs = this.now()
    this.recordHealthSample(nowMs, facts.heroAlive, facts.healthPercent)

    const candidates = evaluateRules(facts, rules)
    if (candidates.length === 0) {
      return
    }
    const cooldownByRuleId = new Map(rules.map((rule) => [rule.ruleId, rule.cooldownSec]))

    const eligible = candidates.filter(
      (candidate) =>
        !this.isSuppressed(candidate.severity) && this.passesRuleCooldown(candidate, nowMs, cooldownByRuleId)
    )
    if (eligible.length === 0) {
      return
    }

    if (!this.passesGlobalCooldown(nowMs)) {
      return
    }

    const winner = pickHighestPriority(eligible)
    this.lastFiredAtMsByRule.set(winner.ruleId, nowMs)
    this.lastGlobalFireAtMs = nowMs
    this.emit(this.toAdvice(winner, nowMs))
  }

  /**
   * true, если Advice данной severity сейчас должна быть подавлена умным
   * гейтом (герой мёртв и/или активный файт — см. таблицу политики в
   * документации класса). Используется F4-конвейером выше и напрямую
   * TimingScheduler'ом (F3) перед adviceScheduler.enqueue.
   */
  isSuppressed(severity: AdviceSeverity): boolean {
    if (severity === 'danger') {
      return false
    }
    const fighting = this.isActiveFight()
    if (severity === 'opportunity') {
      return !this.heroAlive || fighting
    }
    // severity === 'timing'
    return fighting
  }

  /** Сбрасывает всё накопленное состояние (напр. новый матч/реплей). */
  reset(): void {
    this.lastFiredAtMsByRule.clear()
    this.lastGlobalFireAtMs = null
    this.healthHistory = []
    this.heroAlive = true
  }

  private recordHealthSample(nowMs: number, heroAlive: boolean, healthPercent: number): void {
    this.heroAlive = heroAlive
    this.healthHistory.push({ atMs: nowMs, healthPercent })
    const cutoffMs = nowMs - this.fightWindowMs
    while (this.healthHistory.length > 0 && this.healthHistory[0]!.atMs < cutoffMs) {
      this.healthHistory.shift()
    }
  }

  private isActiveFight(): boolean {
    if (this.healthHistory.length === 0) {
      return false
    }
    const maxInWindow = Math.max(...this.healthHistory.map((sample) => sample.healthPercent))
    const current = this.healthHistory[this.healthHistory.length - 1]!.healthPercent
    return maxInWindow - current > this.fightHpDropPercent
  }

  private passesRuleCooldown(
    candidate: AdviceCandidate,
    nowMs: number,
    cooldownByRuleId: ReadonlyMap<string, number>
  ): boolean {
    const lastFiredAtMs = this.lastFiredAtMsByRule.get(candidate.ruleId)
    if (lastFiredAtMs === undefined) {
      return true
    }
    const cooldownSec = cooldownByRuleId.get(candidate.ruleId) ?? 0
    return nowMs - lastFiredAtMs >= cooldownSec * 1000
  }

  private passesGlobalCooldown(nowMs: number): boolean {
    if (this.lastGlobalFireAtMs === null) {
      return true
    }
    return nowMs - this.lastGlobalFireAtMs >= this.globalCooldownMs
  }

  private toAdvice(candidate: AdviceCandidate, nowMs: number): Advice {
    return {
      id: this.idFactory(),
      ruleId: candidate.ruleId,
      message: candidate.message,
      severity: candidate.severity,
      priority: candidate.priority,
      estimated: candidate.estimated,
      createdAtMs: nowMs
    }
  }
}

function pickHighestPriority(candidates: readonly AdviceCandidate[]): AdviceCandidate {
  return candidates.reduce((best, candidate) => (candidate.priority > best.priority ? candidate : best))
}

function defaultIdFactory(): string {
  return `advice_${Math.random().toString(36).slice(2, 10)}`
}
