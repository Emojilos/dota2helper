/**
 * pickWidgetSnapshot (F5, TASK-016): проверяет, что срез содержит ТОЛЬКО
 * whitelisted секции (map/player/hero/abilities/items) и никогда не пропускает
 * auth/provider — auth.token не должен иметь пути в renderer.
 */
import { describe, expect, it } from 'vitest'
import { pickWidgetSnapshot } from '@shared/gsi/pickWidgetSnapshot'

describe('pickWidgetSnapshot', () => {
  it('оставляет только whitelisted секции', () => {
    const raw = {
      provider: { name: 'dota2' },
      auth: { token: 'secret' },
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      player: { gold: 500 },
      hero: { id: 1 },
      abilities: { ability0: { name: 'nevermore_shadowraze1' } },
      items: { slot0: { name: 'item_tango' } }
    }
    const snapshot = pickWidgetSnapshot(raw)
    expect(snapshot).toEqual({
      map: raw.map,
      player: raw.player,
      hero: raw.hero,
      abilities: raw.abilities,
      items: raw.items
    })
    expect(snapshot).not.toHaveProperty('auth')
    expect(snapshot).not.toHaveProperty('provider')
  })

  it('пропускает отсутствующие секции без ошибок', () => {
    expect(pickWidgetSnapshot({ hero: { id: 25 } })).toEqual({ hero: { id: 25 } })
  })

  it('не падает на не-объекте', () => {
    expect(pickWidgetSnapshot(null)).toEqual({})
    expect(pickWidgetSnapshot(undefined)).toEqual({})
    expect(pickWidgetSnapshot('string')).toEqual({})
  })
})
