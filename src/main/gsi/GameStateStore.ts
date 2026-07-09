/**
 * GameStateStore — in-memory источник правды для GameState в main-процессе (INV1).
 *
 * Держит последнее валидное состояние игры и уведомляет подписчиков (например,
 * IPC-мост gameState:update из TASK-007). Renderer этот стор напрямую не видит —
 * только проекцию через IPC.
 *
 * Стор синхронный и «глупый»: коалесцирование частоты обновлений (≤2 Гц) делает
 * GsiServer перед вызовом set(), чтобы стор оставался переиспользуемым.
 */
import type { GameState } from '@shared/schemas/gameState'

export type GameStateListener = (state: GameState) => void

export class GameStateStore {
  private latest: GameState | null = null
  private readonly listeners = new Set<GameStateListener>()

  /** Текущее состояние-правда (null, пока не пришёл ни один валидный пакет). */
  get(): GameState | null {
    return this.latest
  }

  /** Обновляет состояние и синхронно уведомляет всех подписчиков. */
  set(state: GameState): void {
    this.latest = state
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  /** Подписка на обновления. Возвращает функцию отписки. */
  subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
