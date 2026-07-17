/**
 * Zod-схема контентного конфига rules.json (F4, TASK-042, INV4).
 *
 * Отражает раздел 5.2 PRD: `{ rule_id, condition (JSON Logic), message_ru,
 * priority (1–5), cooldown_sec, min_verbosity }`. `condition` — JSON Logic
 * (см. https://jsonlogic.com/), безопасный DSL над плоским объектом фактов
 * (TASK-041), НЕ eval(). Правила герой-зависимы через сами факты (напр.
 * `hero.profile.ultIsKillWindow`, TASK-034) — схема этого не форсирует, это
 * вопрос содержимого condition, а не формата.
 *
 * Наполнение реальными правилами — TASK-045. Вычисление (json-logic apply +
 * cooldown/лимиты) — TASK-043/044 (src/engine/rules, AdviceScheduler-gate);
 * здесь только формат и валидация содержимого.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'
import { VerbositySchema } from './settings'

/**
 * Значение JSON Logic: примитив, вложенный массив операндов или объект вида
 * `{ "<operator>": <операнды> }` (может быть вложен произвольно глубоко —
 * `{"and": [{"==": [...]}, {">": [...]}]}`). Схема принимает любую валидную
 * JSON Logic структуру, не ограничиваясь конкретным набором операторов —
 * список поддерживаемых операторов задаёт библиотека-евалюатор (TASK-043),
 * а не эта схема.
 */
export type JsonLogicValue =
  | string
  | number
  | boolean
  | null
  | JsonLogicValue[]
  | { [operator: string]: JsonLogicValue }

export const JsonLogicValueSchema: z.ZodType<JsonLogicValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonLogicValueSchema),
    z.record(z.string(), JsonLogicValueSchema)
  ])
)

export const RuleSchema = z.object({
  /** стабильный идентификатор правила (используется как ruleId подсказки и ключ cooldown). */
  ruleId: z.string().min(1),
  /** условие срабатывания — JSON Logic над плоским объектом фактов (TASK-041). */
  condition: JsonLogicValueSchema,
  /** текст подсказки (с позиции игрока), ≤60 символов на мысль (раздел 6 PRD). */
  messageRu: z.string().min(1),
  /** приоритет в очереди уведомлений 1..5 (5 — важнее). */
  priority: z.number().int().min(1).max(5).default(3),
  /** минимальный интервал между повторными срабатываниями ЭТОГО правила, сек. */
  cooldownSec: z.number().min(0),
  /** минимальный уровень многословности пользователя, при котором правило показывается. */
  minVerbosity: VerbositySchema.default('minimal')
})
export type Rule = z.infer<typeof RuleSchema>

export const RulesConfigSchema = z
  .object({
    /** патч Dota, под который выверены правила (справочно). */
    patch: z.string(),
    rules: z.array(RuleSchema)
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>()
    for (const [index, rule] of config.rules.entries()) {
      if (seen.has(rule.ruleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate rule id '${rule.ruleId}'`,
          path: ['rules', index, 'ruleId']
        })
      }
      seen.add(rule.ruleId)
    }
  })
export type RulesConfig = z.infer<typeof RulesConfigSchema>
