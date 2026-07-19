/**
 * Чистый парсер строк-акселераторов Electron ('F8', 'Ctrl+Shift+A',
 * 'CommandOrControl+X') в структурный аккорд (TASK-008/018).
 *
 * Появился из живой находки гейта TASK-008: electron.globalShortcut
 * (RegisterHotKey) не срабатывает поверх сфокусированной Dota, и win32-бэкенд
 * хоткеев (main/hotkeys/UiohookBackend) матчит нажатия сам — ему нужен
 * разобранный аккорд, а не строка. Парсер также используется
 * SettingsController'ом для отклонения непарсибельного хоткея ДО персиста
 * (по образцу parseSteamId64Input).
 *
 * Поддерживаемый синтаксис (осознанно минимальный): модификаторы
 * Control/Ctrl, Alt/Option, Shift, Command/Cmd/Super/Meta,
 * CommandOrControl/CmdOrCtrl (резолвится по platform-аргументу) + одна
 * основная клавиша F1–F24, A–Z или 0–9. Именованные клавиши (Space, Esc,
 * стрелки…) — при необходимости отдельной задачей: каждая — строка в
 * uiohookKeymap + токен здесь.
 *
 * INV2: чистый модуль — платформа передаётся аргументом, никаких импортов
 * electron/native.
 */

export type HotkeyPlatform = 'win32' | 'darwin' | 'linux'

/** Нормализованный аккорд: key — токен основной клавиши ('F8', 'A', '7'). */
export interface ParsedChord {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export type ParseAcceleratorResult =
  | { ok: true; chord: ParsedChord }
  | { ok: false; error: string }

const MAIN_KEY_PATTERN = /^(F([1-9]|1[0-9]|2[0-4])|[A-Z]|[0-9])$/

export function parseAccelerator(accelerator: string, platform: HotkeyPlatform): ParseAcceleratorResult {
  const tokens = accelerator
    .split('+')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
  if (tokens.length === 0) {
    return { ok: false, error: 'empty accelerator' }
  }

  const chord: ParsedChord = { key: '', ctrl: false, alt: false, shift: false, meta: false }
  for (const token of tokens) {
    switch (token.toLowerCase()) {
      case 'control':
      case 'ctrl':
        chord.ctrl = true
        continue
      case 'alt':
      case 'option':
        chord.alt = true
        continue
      case 'shift':
        chord.shift = true
        continue
      case 'command':
      case 'cmd':
      case 'super':
      case 'meta':
        chord.meta = true
        continue
      case 'commandorcontrol':
      case 'cmdorctrl':
        if (platform === 'darwin') {
          chord.meta = true
        } else {
          chord.ctrl = true
        }
        continue
    }
    const key = token.toUpperCase()
    if (!MAIN_KEY_PATTERN.test(key)) {
      return { ok: false, error: `unsupported key token "${token}"` }
    }
    if (chord.key !== '') {
      return { ok: false, error: `multiple main keys ("${chord.key}" and "${key}")` }
    }
    chord.key = key
  }

  if (chord.key === '') {
    return { ok: false, error: 'no main key (modifiers only)' }
  }
  return { ok: true, chord }
}
