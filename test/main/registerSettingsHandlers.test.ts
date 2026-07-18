import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AppSettings } from '@shared/schemas/settings'
import type { SettingsController } from '@main/ipc/SettingsController'

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const handle = vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
  handlers.set(channel, listener)
})

vi.mock('electron', () => ({
  ipcMain: { handle }
}))

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    steamId: null,
    verbosity: 'experienced',
    hotkeyExpandedPanel: 'F9',
    hotkeySilentMode: 'F10',
    hotkeyClickThroughToggle: 'F8',
    draftRankingMode: 'meta',
    silentMode: false,
    autoLaunch: false,
    ...overrides
  }
}

describe('registerSettingsHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    handle.mockClear()
  })

  it('settings:get delegates to controller.get()', async () => {
    const { registerSettingsHandlers } = await import('@main/ipc/registerSettingsHandlers')
    const controller = {
      get: vi.fn(() => makeSettings({ steamId: '123', hotkeyExpandedPanel: 'F11' })),
      apply: vi.fn()
    } as unknown as SettingsController
    registerSettingsHandlers(controller)

    const result = await handlers.get('settings:get')?.({})

    expect(controller.get).toHaveBeenCalled()
    expect(result).toEqual(makeSettings({ steamId: '123', hotkeyExpandedPanel: 'F11' }))
  })

  it('settings:set delegates the patch to controller.apply()', async () => {
    const { registerSettingsHandlers } = await import('@main/ipc/registerSettingsHandlers')
    const controller = {
      get: vi.fn(),
      apply: vi.fn((patch) => makeSettings(patch))
    } as unknown as SettingsController
    registerSettingsHandlers(controller)

    const result = await handlers.get('settings:set')?.({}, { silentMode: true })

    expect(controller.apply).toHaveBeenCalledWith({ silentMode: true })
    expect(result).toMatchObject({ silentMode: true })
  })
})
