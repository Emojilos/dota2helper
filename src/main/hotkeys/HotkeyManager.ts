/**
 * Регистрация глобальных хоткеев (TASK-018): F9 расширенная панель, тихий
 * режим. Toggle click-through (TASK-008) сюда не входит — у него нет
 * персист-состояния и нет окна-потребителя, свой хоткей заведёт TASK-008
 * (см. shared/schemas/settings.ts).
 *
 * reconcile(settings) вызывается при старте и при каждой мутации настроек
 * (SettingsController.apply → onApplied): точечно перерегистрирует только
 * те роли, чей акселератор реально изменился (не globalShortcut.unregisterAll()
 * — иначе будущие global-shortcut-подсистемы затопчут друг друга).
 *
 * Расширенная панель ещё не существует (TASK-014/037) — её handler пока не
 * управляет окном, а логирует срабатывание как честный шов для будущего
 * подписчика, а не мёртвый placeholder под несуществующее окно.
 *
 * INV1: живёт в main (зависит от electron.globalShortcut).
 */
import { globalShortcut } from 'electron'

type HotkeyRole = 'expandedPanel' | 'silentMode'

export interface HotkeyManagerOptions {
  onToggleExpandedPanel: () => void
  onToggleSilentMode: () => void
  logger?: (message: string) => void
}

export interface HotkeySettings {
  hotkeyExpandedPanel: string
  hotkeySilentMode: string
}

export class HotkeyManager {
  private readonly registered = new Map<HotkeyRole, string>()

  constructor(private readonly options: HotkeyManagerOptions) {}

  /** Приводит зарегистрированные акселераторы к текущим настройкам. Идемпотентно. */
  reconcile(settings: HotkeySettings): void {
    this.setAccelerator('expandedPanel', settings.hotkeyExpandedPanel, this.options.onToggleExpandedPanel)
    this.setAccelerator('silentMode', settings.hotkeySilentMode, this.options.onToggleSilentMode)
  }

  /** Снимает все зарегистрированные этим менеджером акселераторы (app 'will-quit'). */
  stop(): void {
    for (const accelerator of this.registered.values()) {
      globalShortcut.unregister(accelerator)
    }
    this.registered.clear()
  }

  private setAccelerator(role: HotkeyRole, accelerator: string, handler: () => void): void {
    const current = this.registered.get(role)
    if (current === accelerator) {
      return
    }
    if (current) {
      globalShortcut.unregister(current)
      this.registered.delete(role)
    }
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) {
      this.registered.set(role, accelerator)
    } else {
      this.options.logger?.(`failed to register hotkey '${accelerator}' for role '${role}' (in use or invalid)`)
    }
  }
}
