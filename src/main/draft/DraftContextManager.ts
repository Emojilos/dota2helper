/**
 * DraftContextManager (F1, TASK-027): держит текущий DraftContext в памяти
 * main-процесса между тиками GSI (onGameState) и ручными действиями
 * (applyManualAction, renderer -> main через invoke draftContext:applyManualAction —
 * GSI не отдаёт пики команд игроку, docs/gsi-fields.md/TASK-009). Сам не
 * содержит бизнес-логики — тонкая обёртка над чистым engine/draft, уведомляет
 * подписчика (onChange) ТОЛЬКО при реальном изменении контекста (engine/draft
 * возвращает тот же объект по reference, если тик/действие ничего не
 * изменили — иначе main рассылал бы draftContext:update на каждый GSI-тик
 * впустую, ~2 Гц).
 *
 * getEnemyMidHeroId() — геттер для MatchCompletionDetector (TASK-033) и
 * будущего LanePlanBuilder-триггера (TASK-037): реальный источник
 * enemyMidHeroId вместо захардкоженного null (см. main/index.ts).
 *
 * subscribe() (TASK-028) — второй, независимый от options.onChange канал
 * уведомлений: DraftContextManager конструируется рано (startDraftContext,
 * до dataService/configLoader), а DraftService (скоринг кандидатов) собирается
 * позже, когда данные готовы (startDraftService) — subscribe() позволяет
 * подписаться постфактум, не пересоздавая менеджер и не теряя options.onChange
 * (который остаётся первым подписчиком, зарегистрированным в конструкторе).
 *
 * INV1: живёт в main; сам класс не импортирует electron — тестируется
 * юнит-тестами как чистый класс (тот же приём, что MatchCompletionDetector/
 * SteamIdDetector).
 */
import { applyDraftManualAction, updateDraftContextFromGameState } from '@engine/draft'
import { EMPTY_DRAFT_CONTEXT, type DraftContext, type DraftManualAction } from '@shared/schemas/draft'
import type { GameState } from '@shared/schemas/gameState'

export interface DraftContextManagerOptions {
  onChange?: (context: DraftContext) => void
  now?: () => number
}

export class DraftContextManager {
  private context: DraftContext = EMPTY_DRAFT_CONTEXT
  private readonly listeners = new Set<(context: DraftContext) => void>()
  private readonly now: () => number

  constructor(options: DraftContextManagerOptions = {}) {
    if (options.onChange) {
      this.listeners.add(options.onChange)
    }
    this.now = options.now ?? Date.now
  }

  /** Подписывает дополнительного слушателя изменений контекста. Возвращает функцию отписки. */
  subscribe(listener: (context: DraftContext) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get(): DraftContext {
    return this.context
  }

  /** null, если вражеский мидер ещё не задан ручным вводом. */
  getEnemyMidHeroId(): number | null {
    return this.context.enemyMidHeroId
  }

  /** Вызывать на каждое обновление GameState. */
  onGameState(state: GameState): void {
    const gameState = state.map?.gameState ?? null
    const ownHeroId = state.hero?.id ?? null
    this.setContext(updateDraftContextFromGameState(this.context, gameState, ownHeroId, this.now()))
  }

  /** Вызывать на ручной ввод пиков (invoke draftContext:applyManualAction). Возвращает актуальный контекст. */
  applyManualAction(action: DraftManualAction): DraftContext {
    this.setContext(applyDraftManualAction(this.context, action, this.now()))
    return this.context
  }

  private setContext(next: DraftContext): void {
    if (next === this.context) {
      return
    }
    this.context = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}
