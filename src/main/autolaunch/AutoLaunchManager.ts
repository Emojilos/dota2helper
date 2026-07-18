/**
 * Автозапуск приложения вместе с системой (M6, TASK-046). Тонкая обёртка над
 * app.setLoginItemSettings/getLoginItemSettings — единственная точка, которая
 * трогает эту OS-регистрацию, чтобы состояние ОС не расходилось с
 * персистентным AppSettings.autoLaunch (settings.ts).
 *
 * reconcile(enabled) вызывается при старте (с текущим значением из профиля) и
 * при каждой мутации настроек (SettingsController.apply → onApplied) — тот же
 * приём, что HotkeyManager.reconcile для акселераторов: идемпотентно, не
 * трогает ОС, если состояние уже совпадает.
 *
 * INV1: живёт в main (зависит от electron.app).
 */
import { app } from 'electron'

export interface AutoLaunchManagerOptions {
  logger?: (message: string) => void
}

export class AutoLaunchManager {
  constructor(private readonly options: AutoLaunchManagerOptions = {}) {}

  /** Приводит регистрацию автозапуска ОС к желаемому состоянию. Идемпотентно. */
  reconcile(enabled: boolean): void {
    const current = app.getLoginItemSettings()
    if (current.openAtLogin === enabled) {
      return
    }
    app.setLoginItemSettings({ openAtLogin: enabled })
    this.options.logger?.(`auto-launch ${enabled ? 'enabled' : 'disabled'}`)
  }
}
