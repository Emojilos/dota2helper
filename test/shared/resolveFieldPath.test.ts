/**
 * resolveFieldPath (F5, TASK-016): читает значение по dot-path каталога
 * (content/gsi-field-catalog.json, TASK-009) из WidgetGsiSnapshot.
 */
import { describe, expect, it } from 'vitest'
import { resolveFieldPath } from '@shared/gsi/resolveFieldPath'

describe('resolveFieldPath', () => {
  const snapshot = {
    hero: { health_percent: 87, aghanims_scepter: true },
    abilities: { ability0: { cooldown: 4.5 } }
  }

  it('читает вложенное поле по dot-path', () => {
    expect(resolveFieldPath(snapshot, 'hero.health_percent')).toBe(87)
    expect(resolveFieldPath(snapshot, 'abilities.ability0.cooldown')).toBe(4.5)
  })

  it('возвращает undefined для отсутствующего пути', () => {
    expect(resolveFieldPath(snapshot, 'hero.unknown_field')).toBeUndefined()
    expect(resolveFieldPath(snapshot, 'player.gold')).toBeUndefined()
  })

  it('не падает, если путь проходит через примитив/null', () => {
    expect(resolveFieldPath(snapshot, 'hero.health_percent.nested')).toBeUndefined()
    expect(resolveFieldPath(null, 'hero.health_percent')).toBeUndefined()
  })
})
