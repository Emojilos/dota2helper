/**
 * Envelope результата DataService-фасада (TASK-026, INV5): каждый метод фасада
 * возвращает DataResult<T> — либо 'ok' с данными и меткой источника/давности,
 * либо 'no-data', когда STRATZ/OpenDota/кэш все недоступны (фасад никогда не
 * бросает исключение потребителю). Дискриминированный union по `status`
 * заставляет потребителя (DraftService, LanePlanBuilder, UI) обработать обе
 * ветки явно, а не полагаться на null-check поля `data`.
 *
 * INV2: модуль чист (только относительный импорт MatchupRelation из stratzDto).
 * INV1: renderer читает этот тип напрямую (через IPC-payload), не импортируя
 * src/main/** — источник данных для UI остаётся только меткой `source`/`stale`.
 */
import type { MatchupRelation } from '../schemas/stratzDto'

export type DataSource = 'stratz' | 'opendota' | 'cache'

/** Какие relation реально покрыты результатом — напр. OpenDota отдаёт только 'vs', без синергии. */
export interface MatchupCoverage {
  relations: MatchupRelation[]
}

export interface DataOk<T> {
  status: 'ok'
  data: T
  source: DataSource
  fetchedAt: string
  stale: boolean
  coverage?: MatchupCoverage
}

export interface DataNone {
  status: 'no-data'
  source: 'none'
  fetchedAt: null
  stale: true
  reason: string
}

export type DataResult<T> = DataOk<T> | DataNone
