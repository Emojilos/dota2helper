import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UserProfile } from '@shared/schemas/userProfile'
import type { UserProfileRepository } from '@main/db/UserProfileRepository'

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const handle = vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
  handlers.set(channel, listener)
})

vi.mock('electron', () => ({
  ipcMain: { handle }
}))

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    steamId: null,
    verbosity: 'experienced',
    hotkeyExpandedPanel: 'F9',
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

describe('registerSettingsHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    handle.mockClear()
  })

  it('settings:get projects UserProfile down to AppSettings', async () => {
    const { registerSettingsHandlers } = await import('@main/ipc/registerSettingsHandlers')
    const repo = {
      getOrCreate: vi.fn(() => makeProfile({ steamId: '123', hotkeyExpandedPanel: 'F10' })),
      update: vi.fn()
    } as unknown as UserProfileRepository
    registerSettingsHandlers(repo)

    const result = await handlers.get('settings:get')?.({})

    expect(result).toEqual({
      steamId: '123',
      verbosity: 'experienced',
      hotkeyExpandedPanel: 'F10',
      draftRankingMode: 'meta',
      silentMode: false
    })
  })

  it('settings:set forwards the patch to the repository and projects the result', async () => {
    const { registerSettingsHandlers } = await import('@main/ipc/registerSettingsHandlers')
    const repo = {
      getOrCreate: vi.fn(() => makeProfile()),
      update: vi.fn((patch) => makeProfile(patch))
    } as unknown as UserProfileRepository
    registerSettingsHandlers(repo)

    const result = await handlers.get('settings:set')?.({}, { silentMode: true })

    expect(repo.update).toHaveBeenCalledWith({ silentMode: true })
    expect(result).toMatchObject({ silentMode: true })
  })
})
