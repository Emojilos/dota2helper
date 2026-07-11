/**
 * Zod-схема контентного конфига timings.json (F3, TASK-012, INV4).
 *
 * Отражает раздел 5.2 PRD (`{ event_type, interval_sec | fixed_times[],
 * warn_before_sec, patch }`), расширенный минимумом полей, нужных для показа
 * уведомления: label_ru (текст), severity (цветовое кодирование раздела 6),
 * priority (очередь AdviceScheduler, TASK-013), enabledByDefault (F3: каждый тип
 * отключается отдельно). Тайминги вынесены в конфиг, т.к. Valve меняет их патчами.
 *
 * INV2: модуль чист (zod + переиспользование AdviceSeveritySchema).
 */
import { z } from 'zod'
import { AdviceSeveritySchema } from './advice'

/**
 * Расписание наступления события в ИГРОВОМ времени (clock_time, сек):
 *  - fixed    — фиксированные моменты (руны воды 2:00/4:00; Tormentor 20:00);
 *  - interval — периодически: первое наступление в startSec, далее каждые
 *               intervalSec (руны силы с 6:00 каждые 6:00; стак кемпа xx:53);
 *  - buyback  — не по clock_time, а «по факту» из hero.buyback_cooldown: событие
 *               наступает, когда байбек снова доступен (кулдаун дошёл до нуля).
 */
export const TimingScheduleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    timesSec: z.array(z.number()).min(1)
  }),
  z.object({
    kind: z.literal('interval'),
    intervalSec: z.number().positive(),
    startSec: z.number()
  }),
  z.object({
    kind: z.literal('buyback')
  })
])
export type TimingSchedule = z.infer<typeof TimingScheduleSchema>

export const TimingEventSchema = z.object({
  /** стабильный идентификатор события (ruleId уведомления = `timing:<id>`). */
  id: z.string().min(1),
  /** текст уведомления (с позиции игрока). */
  labelRu: z.string().min(1),
  /** цветовое кодирование (opportunity/timing/danger); по умолчанию 'timing'. */
  severity: AdviceSeveritySchema.default('timing'),
  /** приоритет в очереди уведомлений 1..5 (5 — важнее). */
  priority: z.number().int().min(1).max(5).default(3),
  schedule: TimingScheduleSchema,
  /** за сколько секунд до события предупреждать (0 — «по факту»). */
  warnBeforeSec: z.number().min(0),
  /** включён ли тип уведомления по умолчанию (отключается в настройках). */
  enabledByDefault: z.boolean().default(true)
})
export type TimingEvent = z.infer<typeof TimingEventSchema>

export const TimingsConfigSchema = z
  .object({
    /** патч Dota, под который выверены тайминги (справочно). */
    patch: z.string(),
    events: z.array(TimingEventSchema)
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>()
    for (const [index, event] of config.events.entries()) {
      if (seen.has(event.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate timing event id '${event.id}'`,
          path: ['events', index, 'id']
        })
      }
      seen.add(event.id)
    }
  })
export type TimingsConfig = z.infer<typeof TimingsConfigSchema>
