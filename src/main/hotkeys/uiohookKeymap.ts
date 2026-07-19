/**
 * Маппинг токенов основной клавиши parseAccelerator ('F8', 'A', '7') в
 * keycode'ы uiohook (TASK-008/018). Чистый строитель: константы UiohookKey
 * передаются аргументом (их достаёт UiohookBackend из лениво загруженного
 * uiohook-napi) — сам модуль native не импортирует и тестируется без него,
 * в т.ч. drift-guard полноты покрытия токенов парсера.
 */

/** Токены, которые может вернуть parseAccelerator основной клавишей. */
export function mainKeyTokens(): string[] {
  const tokens: string[] = []
  for (let i = 1; i <= 24; i++) {
    tokens.push(`F${i}`)
  }
  for (let code = 65; code <= 90; code++) {
    tokens.push(String.fromCharCode(code))
  }
  for (let digit = 0; digit <= 9; digit++) {
    tokens.push(String(digit))
  }
  return tokens
}

/** Токен → keycode. Токены без константы в переданном наборе опускаются. */
export function buildUiohookKeymap(uiohookKey: Record<string, number | undefined>): Map<string, number> {
  const map = new Map<string, number>()
  for (const token of mainKeyTokens()) {
    const keycode = uiohookKey[token]
    if (typeof keycode === 'number') {
      map.set(token, keycode)
    }
  }
  return map
}
