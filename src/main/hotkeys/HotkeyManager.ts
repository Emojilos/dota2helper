/**
 * Регистрация глобальных хоткеев (TASK-018): F9 расширенная панель, тихий
 * режим, F8 toggle click-through базового overlay-окна (TASK-008).
 *
 * Механизм регистрации — за швом HotkeyBackend (живая находка гейта
 * TASK-008: RegisterHotKey/globalShortcut не срабатывает поверх
 * сфокусированной Dota; на win32 работает UiohookBackend, см.
 * createHotkeyBackends). Бэкенды инжектируются опциями — сам менеджер не
 * зависит от electron и тестируется с фейками.
 *
 * reconcile(settings) вызывается при старте и при каждой мутации настроек
 * (SettingsController.apply → onApplied): точечно перерегистрирует только
 * те роли, чей акселератор реально изменился. Каждая роль запоминает, в
 * каком бэкенде зарегистрирована (основной или fallback), — unregister
 * уходит именно туда; одна роль никогда не живёт в двух бэкендах сразу
 * (защита от двойного срабатывания).
 *
 * Расширенная панель ещё не существует (TASK-014/037) — её handler пока не
 * управляет окном, а логирует срабатывание как честный шов для будущего
 * подписчика, а не мёртвый placeholder под несуществующее окно.
 *
 * INV1: живёт в main.
 */
import type { HotkeyBackend } from './HotkeyBackend'

type HotkeyRole = 'expandedPanel' | 'silentMode' | 'clickThrough'

export interface HotkeyManagerOptions {
  backend: HotkeyBackend
  /** Куда деградировать роль, если основной бэкенд не смог (win32: globalShortcut). */
  fallbackBackend?: HotkeyBackend
  onToggleExpandedPanel: () => void
  onToggleSilentMode: () => void
  onToggleClickThrough: () => void
  logger?: (message: string) => void
}

export interface HotkeySettings {
  hotkeyExpandedPanel: string
  hotkeySilentMode: string
  hotkeyClickThroughToggle: string
}

export class HotkeyManager {
  private readonly registered = new Map<HotkeyRole, { accelerator: string; backend: HotkeyBackend }>()

  constructor(private readonly options: HotkeyManagerOptions) {}

  /** Приводит зарегистрированные акселераторы к текущим настройкам. Идемпотентно. */
  reconcile(settings: HotkeySettings): void {
    this.setAccelerator('expandedPanel', settings.hotkeyExpandedPanel, this.options.onToggleExpandedPanel)
    this.setAccelerator('silentMode', settings.hotkeySilentMode, this.options.onToggleSilentMode)
    this.setAccelerator('clickThrough', settings.hotkeyClickThroughToggle, this.options.onToggleClickThrough)
  }

  /** Снимает все роли и останавливает бэкенды (app 'will-quit'). */
  stop(): void {
    for (const { accelerator, backend } of this.registered.values()) {
      backend.unregister(accelerator)
    }
    this.registered.clear()
    this.options.backend.stop()
    this.options.fallbackBackend?.stop()
  }

  private setAccelerator(role: HotkeyRole, accelerator: string, handler: () => void): void {
    const current = this.registered.get(role)
    if (current?.accelerator === accelerator) {
      return
    }
    if (current) {
      current.backend.unregister(current.accelerator)
      this.registered.delete(role)
    }
    if (this.options.backend.register(accelerator, handler)) {
      this.registered.set(role, { accelerator, backend: this.options.backend })
      return
    }
    const fallback = this.options.fallbackBackend
    if (fallback?.register(accelerator, handler)) {
      this.registered.set(role, { accelerator, backend: fallback })
      this.options.logger?.(
        `hotkey '${accelerator}' (${role}) registered via fallback backend — may not fire over the game`
      )
      return
    }
    this.options.logger?.(`failed to register hotkey '${accelerator}' for role '${role}' (in use or invalid)`)
  }
}
