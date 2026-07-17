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
    draftRankingMode: 'meta',
    silentMode: false,
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
      draftRankingMode: 'meta',
      silentMode: false
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
})
