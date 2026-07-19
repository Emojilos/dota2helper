/**
 * Шов между HotkeyManager и механизмом регистрации глобальных хоткеев
 * (TASK-008/018). Появился из живой находки гейта TASK-008:
 * electron.globalShortcut (RegisterHotKey) не срабатывает, когда в фокусе
 * игра с raw-input-обработкой клавиатуры (Dota 2) — известное ограничение
 * (electron#27240). Поэтому на win32 работает UiohookBackend (низкоуровневый
 * observe-only хук), на darwin-dev — GlobalShortcutBackend; выбор — в
 * createHotkeyBackends.
 *
 * Сигнатура register зеркалит globalShortcut.register (boolean об успехе),
 * чтобы дедуп-логика HotkeyManager осталась backend-agnostic.
 */
export interface HotkeyBackend {
  /** true — акселератор зарегистрирован; false — не смог (невалиден/занят). */
  register(accelerator: string, handler: () => void): boolean
  unregister(accelerator: string): void
  /** Полная остановка бэкенда (app will-quit). Идемпотентна. */
  stop(): void
}
