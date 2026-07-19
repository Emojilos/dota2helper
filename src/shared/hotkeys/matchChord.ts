/**
 * Чистый матчинг клавиатурного события низкоуровневого хука против
 * зарезолвленного аккорда (TASK-008/018, пара к parseAccelerator).
 *
 * Событие описано структурно (числа/були) — модуль тестируется без
 * uiohook-napi; реальный UiohookKeyboardEvent удовлетворяет форме
 * HookKeyboardEventLike структурно. Совпадение ТОЧНОЕ по маске модификаторов:
 * голый F8 не срабатывает при Ctrl+F8 и наоборот.
 *
 * INV2: чистый модуль.
 */

/** Структурная форма keydown-события LL-хука (см. UiohookKeyboardEvent). */
export interface HookKeyboardEventLike {
  keycode: number
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** ParsedChord с основной клавишей, уже зарезолвленной в keycode бэкенда. */
export interface ResolvedChord {
  keycode: number
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export function matchChord(event: HookKeyboardEventLike, chord: ResolvedChord): boolean {
  return (
    event.keycode === chord.keycode &&
    event.ctrlKey === chord.ctrl &&
    event.altKey === chord.alt &&
    event.shiftKey === chord.shift &&
    event.metaKey === chord.meta
  )
}
