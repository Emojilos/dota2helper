import { describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@shared/schemas/userProfile'
import type { UserProfileRepository } from '@main/db/UserProfileRepository'
import { createSettingsController } from '@main/ipc/SettingsController'

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    steamId: null,
    verbosity: 'experienced',
    hotkeyExpandedPanel: 'F9',
    hotkeySilentMode: 'F10',
    hotkeyClickThroughToggle: 'F8',
    draftRankingMode: 'meta',
    silentMode: false,
    autoLaunch: false,
    overlayPositions: {},
    notificationsConfig: {},
    widgetsConfig: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('SettingsController', () => {
  it('get() projects UserProfile down to AppSettings without calling onApplied', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile({ steamId: '123', hotkeyExpandedPanel: 'F11' })),
      update: vi.fn()
    } as unknown as UserProfileRepository
    const onApplied = vi.fn()
    const controller = createSettingsController(repo, onApplied)

    const result = controller.get()

    expect(result).toEqual({
      steamId: '123',
      verbosity: 'experienced',
      hotkeyExpandedPanel: 'F11',
      hotkeySilentMode: 'F10',
      hotkeyClickThroughToggle: 'F8',
      draftRankingMode: 'meta',
      silentMode: false,
      autoLaunch: false
    })
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('apply() forwards the patch to the repository, projects the result and calls onApplied', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile()),
      update: vi.fn((patch) => makeProfile(patch))
    } as unknown as UserProfileRepository
    const onApplied = vi.fn()
    const controller = createSettingsController(repo, onApplied)

    const result = controller.apply({ silentMode: true })

    expect(repo.update).toHaveBeenCalledWith({ silentMode: true })
    expect(result).toMatchObject({ silentMode: true })
    expect(onApplied).toHaveBeenCalledWith(result)
  })

  it('apply() normalizes a steamId profile URL to the bare 64-bit ID before persisting', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile()),
      update: vi.fn((patch) => makeProfile(patch))
    } as unknown as UserProfileRepository
    const controller = createSettingsController(repo, vi.fn())

    const result = controller.apply({ steamId: 'https://steamcommunity.com/profiles/76561198012345678/' })

    expect(repo.update).toHaveBeenCalledWith({ steamId: '76561198012345678' })
    expect(result.steamId).toBe('76561198012345678')
  })

  it('apply() passes steamId: null through untouched (unbinding)', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile({ steamId: '76561198012345678' })),
      update: vi.fn((patch) => makeProfile(patch))
    } as unknown as UserProfileRepository
    const controller = createSettingsController(repo, vi.fn())

    controller.apply({ steamId: null })

    expect(repo.update).toHaveBeenCalledWith({ steamId: null })
  })

  it('apply() rejects an invalid steamId without touching the repository', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile()),
      update: vi.fn()
    } as unknown as UserProfileRepository
    const controller = createSettingsController(repo, vi.fn())

    expect(() => controller.apply({ steamId: 'not-a-steam-id' })).toThrow(/invalid steamId/)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('apply() rejects an unparseable hotkey accelerator without touching the repository (TASK-008)', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile()),
      update: vi.fn()
    } as unknown as UserProfileRepository
    const controller = createSettingsController(repo, vi.fn())

    expect(() => controller.apply({ hotkeyClickThroughToggle: 'Ctrl+' })).toThrow(/invalid hotkey/)
    expect(() => controller.apply({ hotkeySilentMode: 'Space' })).toThrow(/invalid hotkey/)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('apply() accepts a parseable hotkey accelerator', () => {
    const repo = {
      getOrCreate: vi.fn(() => makeProfile()),
      update: vi.fn((patch) => makeProfile(patch))
    } as unknown as UserProfileRepository
    const controller = createSettingsController(repo, vi.fn())

    const result = controller.apply({ hotkeyClickThroughToggle: 'Ctrl+Shift+F8' })

    expect(repo.update).toHaveBeenCalledWith({ hotkeyClickThroughToggle: 'Ctrl+Shift+F8' })
    expect(result.hotkeyClickThroughToggle).toBe('Ctrl+Shift+F8')
  })
})
