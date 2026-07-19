/** Барель хоткей-подсистемы main (TASK-018; бэкенды — TASK-008). */
export { HotkeyManager, type HotkeyManagerOptions, type HotkeySettings } from './HotkeyManager'
export type { HotkeyBackend } from './HotkeyBackend'
export { createHotkeyBackends, type HotkeyBackends } from './createHotkeyBackends'
export { GlobalShortcutBackend } from './GlobalShortcutBackend'
export { UiohookBackend, type UiohookApi } from './UiohookBackend'
