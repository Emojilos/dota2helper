/**
 * HotkeyBackend поверх electron.globalShortcut (RegisterHotKey) — прежний
 * механизм TASK-018, извлечённый из HotkeyManager за шов HotkeyBackend.
 * Достаточен на darwin (dev-петля) и как fallback на win32 для акселераторов,
 * которые UiohookBackend не смог зарегистрировать. Поверх сфокусированной
 * игры может не срабатывать (находка гейта TASK-008) — потому и не основной
 * бэкенд на win32.
 *
 * INV1: живёт в main (зависит от electron.globalShortcut).
 */
import { globalShortcut } from 'electron'
import type { HotkeyBackend } from './HotkeyBackend'

export class GlobalShortcutBackend implements HotkeyBackend {
  register(accelerator: string, handler: () => void): boolean {
    return globalShortcut.register(accelerator, handler)
  }

  unregister(accelerator: string): void {
    globalShortcut.unregister(accelerator)
  }

  stop(): void {
    // Роли снимает поимённо HotkeyManager.stop() через unregister —
    // глобального состояния у этого бэкенда нет.
  }
}
