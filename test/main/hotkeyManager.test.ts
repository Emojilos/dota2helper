import { describe, expect, it, vi, beforeEach } from 'vitest'

const register = vi.fn(() => true)
const unregister = vi.fn()

vi.mock('electron', () => ({
  globalShortcut: { register, unregister }
}))

describe('HotkeyManager', () => {
  beforeEach(() => {
    register.mockClear()
    register.mockReturnValue(true)
    unregister.mockClear()
  })

  it('registers expandedPanel and silentMode accelerators on first reconcile', async () => {
    const { HotkeyManager } = await import('@main/hotkeys/HotkeyManager')
    const onToggleExpandedPanel = vi.fn()
    const onToggleSilentMode = vi.fn()
    const manager = new HotkeyManager({ onToggleExpandedPanel, onToggleSilentMode })

    manager.reconcile({ hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10' })

    expect(register).toHaveBeenCalledWith('F9', onToggleExpandedPanel)
    expect(register).toHaveBeenCalledWith('F10', onToggleSilentMode)
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('re-registering with the same accelerators is a no-op (no unregister/register churn)', async () => {
    const { HotkeyManager } = await import('@main/hotkeys/HotkeyManager')
    const manager = new HotkeyManager({ onToggleExpandedPanel: vi.fn(), onToggleSilentMode: vi.fn() })

    manager.reconcile({ hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10' })
    register.mockClear()
    manager.reconcile({ hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10' })

    expect(register).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()
  })

  it('changing an accelerator unregisters the old one and registers the new one — old key stops working', async () => {
    const { HotkeyManager } = await import('@main/hotkeys/HotkeyManager')
    const onToggleExpandedPanel = vi.fn()
    const manager = new HotkeyManager({ onToggleExpandedPanel, onToggleSilentMode: vi.fn() })

    manager.reconcile({ hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10' })
    register.mockClear()
    manager.reconcile({ hotkeyExpandedPanel: 'F11', hotkeySilentMode: 'F10' })

    expect(unregister).toHaveBeenCalledWith('F9')
    expect(unregister).not.toHaveBeenCalledWith('F10')
    expect(register).toHaveBeenCalledWith('F11', onToggleExpandedPanel)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('logs and does not track the role when globalShortcut.register fails', async () => {
    register.mockReturnValueOnce(false)
    const { HotkeyManager } = await import('@main/hotkeys/HotkeyManager')
    const logger = vi.fn()
    const manager = new HotkeyManager({ onToggleExpandedPanel: vi.fn(), onToggleSilentMode: vi.fn(), logger })

    manager.reconcile({ hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10' })

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('F9'))
  })

  it('stop() unregisters every currently-registered accelerator', async () => {
    const { HotkeyManager } = await import('@main/hotkeys/HotkeyManager')
    const manager = new HotkeyManager({ onToggleExpandedPanel: vi.fn(), onToggleSilentMode: vi.fn() })
    manager.reconcile({ hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10' })

    manager.stop()

    expect(unregister).toHaveBeenCalledWith('F9')
    expect(unregister).toHaveBeenCalledWith('F10')
  })
})
