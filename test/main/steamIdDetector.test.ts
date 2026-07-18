import { describe, expect, it, vi } from 'vitest'
import { SteamIdDetector } from '@main/steam/SteamIdDetector'

describe('SteamIdDetector', () => {
  it('notifies once when a steamId arrives from GSI and no steamId is bound yet', () => {
    const onDetected = vi.fn()
    const detector = new SteamIdDetector({ getBoundSteamId: () => null, onDetected })

    detector.onGameState('76561198012345678')

    expect(onDetected).toHaveBeenCalledWith('76561198012345678')
  })

  it('does not notify twice for repeated GSI updates in the same session', () => {
    const onDetected = vi.fn()
    const detector = new SteamIdDetector({ getBoundSteamId: () => null, onDetected })

    detector.onGameState('76561198012345678')
    detector.onGameState('76561198012345678')
    detector.onGameState('76561198012345678')

    expect(onDetected).toHaveBeenCalledTimes(1)
  })

  it('does not notify when a steamId is already bound', () => {
    const onDetected = vi.fn()
    const detector = new SteamIdDetector({ getBoundSteamId: () => '76561198000000000', onDetected })

    detector.onGameState('76561198012345678')

    expect(onDetected).not.toHaveBeenCalled()
  })

  it('ignores updates without a player steamId', () => {
    const onDetected = vi.fn()
    const detector = new SteamIdDetector({ getBoundSteamId: () => null, onDetected })

    detector.onGameState(null)
    detector.onGameState(undefined)

    expect(onDetected).not.toHaveBeenCalled()
  })

  it('reset() allows detection to fire again', () => {
    const onDetected = vi.fn()
    const detector = new SteamIdDetector({ getBoundSteamId: () => null, onDetected })

    detector.onGameState('76561198012345678')
    detector.reset()
    detector.onGameState('76561198012345678')

    expect(onDetected).toHaveBeenCalledTimes(2)
  })
})
