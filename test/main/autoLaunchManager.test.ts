import { describe, expect, it, vi, beforeEach } from 'vitest'

const getLoginItemSettings = vi.fn(() => ({ openAtLogin: false }))
const setLoginItemSettings = vi.fn()

vi.mock('electron', () => ({
  app: { getLoginItemSettings, setLoginItemSettings }
}))

describe('AutoLaunchManager', () => {
  beforeEach(() => {
    getLoginItemSettings.mockClear()
    getLoginItemSettings.mockReturnValue({ openAtLogin: false })
    setLoginItemSettings.mockClear()
  })

  it('enables OS auto-launch when reconciling true while OS state is off', async () => {
    const { AutoLaunchManager } = await import('@main/autolaunch/AutoLaunchManager')
    const manager = new AutoLaunchManager()

    manager.reconcile(true)

    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })

  it('disables OS auto-launch when reconciling false while OS state is on', async () => {
    getLoginItemSettings.mockReturnValue({ openAtLogin: true })
    const { AutoLaunchManager } = await import('@main/autolaunch/AutoLaunchManager')
    const manager = new AutoLaunchManager()

    manager.reconcile(false)

    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
  })

  it('is a no-op when OS state already matches the desired state', async () => {
    getLoginItemSettings.mockReturnValue({ openAtLogin: true })
    const { AutoLaunchManager } = await import('@main/autolaunch/AutoLaunchManager')
    const manager = new AutoLaunchManager()

    manager.reconcile(true)

    expect(setLoginItemSettings).not.toHaveBeenCalled()
  })

  it('logs the transition when state changes', async () => {
    const { AutoLaunchManager } = await import('@main/autolaunch/AutoLaunchManager')
    const logger = vi.fn()
    const manager = new AutoLaunchManager({ logger })

    manager.reconcile(true)

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('enabled'))
  })
})
