/**
 * RawGsiSnapshotStore — in-memory источник правды для WidgetGsiSnapshot (F5,
 * TASK-016). Зеркало GameStateStore (см. её doc-комментарий), но для
 * санитизированного среза сырого GSI-пакета (pickWidgetSnapshot) — конструктору
 * виджетов нужны поля шире типизированного GameState (aghanims_scepter,
 * talent_N, gold_from_*, debuff-флаги и т.п., см.
 * src/shared/schemas/gsiFieldCatalog.ts).
 *
 * Стор синхронный и «глупый», как GameStateStore: GsiServer сам решает, когда
 * вызывать set() (в lockstep с GameStateStore.set(), тем же flush()), чтобы оба
 * стора обновлялись из одного и того же пакета и с одной частотой (≤2 Гц).
 */
import type { WidgetGsiSnapshot } from '@shared/schemas/gsiRawSnapshot'

export type RawGsiSnapshotListener = (snapshot: WidgetGsiSnapshot) => void

export class RawGsiSnapshotStore {
  private latest: WidgetGsiSnapshot | null = null
  private readonly listeners = new Set<RawGsiSnapshotListener>()

  /** Последний санитизированный срез (null, пока не пришёл ни один валидный пакет). */
  get(): WidgetGsiSnapshot | null {
    return this.latest
  }

  /** Обновляет срез и синхронно уведомляет всех подписчиков. */
  set(snapshot: WidgetGsiSnapshot): void {
    this.latest = snapshot
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  /** Подписка на обновления. Возвращает функцию отписки. */
  subscribe(listener: RawGsiSnapshotListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
