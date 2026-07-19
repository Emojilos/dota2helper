/**
 * Платформенная фабрика бэкендов хоткеев (TASK-008/018): ровно один основной
 * бэкенд на платформу — win32: UiohookBackend (работает поверх игр) с
 * fallback'ом на GlobalShortcutBackend для акселераторов вне keymap;
 * darwin/linux (dev): GlobalShortcutBackend (uiohook на macOS требовал бы
 * Accessibility permission, а поверх игр там ловить нечего).
 *
 * Взаимоисключающие бэкенды на роль — защита от двойного срабатывания
 * одного нажатия (роль регистрируется либо в hook, либо в globalShortcut,
 * никогда в обоих; см. HotkeyManager.setAccelerator).
 *
 * Escape-hatch: MIDMIND_HOTKEY_BACKEND=global|uiohook форсирует бэкенд
 * (диагностика на живой машине без пересборки).
 *
 * Вынесена из HotkeyManager, чтобы тот не импортировал electron даже
 * транзитивно и тестировался с инжектированным фейковым бэкендом.
 */
import { GlobalShortcutBackend } from './GlobalShortcutBackend'
import { UiohookBackend } from './UiohookBackend'
import type { HotkeyBackend } from './HotkeyBackend'

export interface HotkeyBackends {
  backend: HotkeyBackend
  fallbackBackend?: HotkeyBackend
}

export function createHotkeyBackends(logger?: (message: string) => void): HotkeyBackends {
  const override = process.env['MIDMIND_HOTKEY_BACKEND']
  if (override === 'global') {
    logger?.('backend forced to globalShortcut via MIDMIND_HOTKEY_BACKEND')
    return { backend: new GlobalShortcutBackend() }
  }
  if (override === 'uiohook') {
    logger?.('backend forced to uiohook via MIDMIND_HOTKEY_BACKEND')
    return { backend: new UiohookBackend(logger) }
  }
  if (process.platform === 'win32') {
    return { backend: new UiohookBackend(logger), fallbackBackend: new GlobalShortcutBackend() }
  }
  return { backend: new GlobalShortcutBackend() }
}
