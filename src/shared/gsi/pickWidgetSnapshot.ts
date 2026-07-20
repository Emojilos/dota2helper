/**
 * pickWidgetSnapshot — санитизирует сырой GSI-пакет до WidgetGsiSnapshot (F5,
 * TASK-016): оставляет ТОЛЬКО whitelisted верхнеуровневые секции
 * (WIDGET_SNAPSHOT_SECTIONS), отбрасывая всё остальное — в первую очередь
 * `auth` (там лежит auth-токен, TASK-005) и `provider`, которым нет причин
 * покидать main. Не валидирует форму содержимого секций (это уже сделал
 * GsiRawPacketSchema на пути в GameStateStore) — только копирует ссылки на
 * уже провалидированные значения.
 *
 * INV2: модуль чист (без electron/react/fs/сети).
 */
import { WIDGET_SNAPSHOT_SECTIONS, type WidgetGsiSnapshot } from '../schemas/gsiRawSnapshot'

export function pickWidgetSnapshot(raw: unknown): WidgetGsiSnapshot {
  const snapshot: WidgetGsiSnapshot = {}
  if (typeof raw !== 'object' || raw === null) {
    return snapshot
  }
  const source = raw as Record<string, unknown>
  for (const section of WIDGET_SNAPSHOT_SECTIONS) {
    if (section in source) {
      snapshot[section] = source[section]
    }
  }
  return snapshot
}
