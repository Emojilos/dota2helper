/**
 * Маленькое key-value хранилище app_state (TASK-047, миграция
 * 0004_build_cache_and_app_state) для служебного состояния main-процесса,
 * которое не является пользовательской настройкой и потому не живёт в
 * user_profile / не проходит через AppSettingsSchema и settings:get/set —
 * напр. последний увиденный патч STRATZ (PatchWatcher).
 */
import type { DatabaseInstance } from './openDatabase'

export class AppStateStore {
  constructor(private readonly db: DatabaseInstance) {}

  get(key: string): string | null {
    const row = this.db.prepare<[string], { value: string }>('SELECT value FROM app_state WHERE key = ?').get(key)
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value)
  }
}
