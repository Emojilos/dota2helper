/**
 * PatchWatcher (TASK-047): при старте сверяет текущий патч STRATZ
 * (StratzClient.getCurrentPatch) с последним увиденным (app_state.lastSeenPatch,
 * AppStateStore) — если патч сменился с прошлого запуска, main/index.ts пушит
 * баннер 'данные обновляются' (IPC 'patch:changed'). Первый запуск (нет
 * сохранённого значения) НЕ считается сменой — иначе баннер показывался бы
 * всегда на чистом профиле.
 *
 * Не бросает исключений: офлайн/недоступный STRATZ/ошибка запроса — check()
 * тихо возвращает null (тот же приём деградации, что DataService, INV5) —
 * старое значение lastSeenPatch остаётся нетронутым до следующей успешной
 * проверки.
 */
import type { AppStateStore } from '../db/AppStateStore'

const LAST_SEEN_PATCH_KEY = 'lastSeenPatch'

/** Узкий срез StratzClient, нужный вотчеру — легко подменяется фейком в тестах. */
export interface PatchSource {
  getCurrentPatch(): Promise<string | null>
}

export interface PatchCheckResult {
  patch: string
  changed: boolean
}

export interface PatchWatcherOptions {
  logger?: (message: string) => void
}

export class PatchWatcher {
  private readonly logger: (message: string) => void

  constructor(
    private readonly stratzClient: PatchSource | null,
    private readonly appStateStore: AppStateStore,
    options: PatchWatcherOptions = {}
  ) {
    this.logger = options.logger ?? ((): void => {})
  }

  async check(): Promise<PatchCheckResult | null> {
    if (!this.stratzClient) {
      return null
    }

    let patch: string | null
    try {
      patch = await this.stratzClient.getCurrentPatch()
    } catch (error) {
      this.logger(`[patch] STRATZ patch check failed: ${String(error)}`)
      return null
    }
    if (!patch) {
      return null
    }

    const previous = this.appStateStore.get(LAST_SEEN_PATCH_KEY)
    const changed = previous !== null && previous !== patch
    this.appStateStore.set(LAST_SEEN_PATCH_KEY, patch)

    if (changed) {
      this.logger(`[patch] patch changed: ${previous} -> ${patch}`)
    }

    return { patch, changed }
  }
}
