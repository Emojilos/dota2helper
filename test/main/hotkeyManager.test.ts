import { describe, expect, it, vi } from 'vitest'
import { HotkeyManager } from '@main/hotkeys/HotkeyManager'
import type { HotkeyBackend } from '@main/hotkeys/HotkeyBackend'

/** Фейковый HotkeyBackend: менеджер тестируется без electron/native (шов TASK-008). */
function makeBackend(registerResult = true) {
  return {
    register: vi.fn(() => registerResult),
    unregister: vi.fn(),
    stop: vi.fn()
  } satisfies HotkeyBackend & { register: ReturnType<typeof vi.fn> }
}

function makeOptions(overrides: Partial<{
  backend: ReturnType<typeof makeBackend>
  fallbackBackend: ReturnType<typeof makeBackend>
  onToggleExpandedPanel: () => void
  onToggleSilentMode: () => void
  onToggleClickThrough: () => void
  logger: (message: string) => void
}> = {}) {
  return {
    backend: makeBackend(),
    onToggleExpandedPanel: vi.fn(),
    onToggleSilentMode: vi.fn(),
    onToggleClickThrough: vi.fn(),
    ...overrides
  }
}

const SETTINGS = { hotkeyExpandedPanel: 'F9', hotkeySilentMode: 'F10', hotkeyClickThroughToggle: 'F8' }

describe('HotkeyManager', () => {
  it('registers expandedPanel, silentMode and clickThrough accelerators on first reconcile', () => {
    const options = makeOptions()
    const manager = new HotkeyManager(options)

    manager.reconcile(SETTINGS)

    expect(options.backend.register).toHaveBeenCalledWith('F9', options.onToggleExpandedPanel)
    expect(options.backend.register).toHaveBeenCalledWith('F10', options.onToggleSilentMode)
    expect(options.backend.register).toHaveBeenCalledWith('F8', options.onToggleClickThrough)
    expect(options.backend.register).toHaveBeenCalledTimes(3)
  })

  it('re-registering with the same accelerators is a no-op (no unregister/register churn)', () => {
    const options = makeOptions()
    const manager = new HotkeyManager(options)

    manager.reconcile(SETTINGS)
    options.backend.register.mockClear()
    manager.reconcile(SETTINGS)

    expect(options.backend.register).not.toHaveBeenCalled()
    expect(options.backend.unregister).not.toHaveBeenCalled()
  })

  it('changing an accelerator unregisters the old one and registers the new one — old key stops working', () => {
    const options = makeOptions()
    const manager = new HotkeyManager(options)

    manager.reconcile(SETTINGS)
    options.backend.register.mockClear()
    manager.reconcile({ ...SETTINGS, hotkeyExpandedPanel: 'F11' })

    expect(options.backend.unregister).toHaveBeenCalledWith('F9')
    expect(options.backend.unregister).not.toHaveBeenCalledWith('F10')
    expect(options.backend.register).toHaveBeenCalledWith('F11', options.onToggleExpandedPanel)
    expect(options.backend.register).toHaveBeenCalledTimes(1)
  })

  it('changing the click-through accelerator unregisters the old one and registers the new one', () => {
    const options = makeOptions()
    const manager = new HotkeyManager(options)

    manager.reconcile(SETTINGS)
    options.backend.register.mockClear()
    manager.reconcile({ ...SETTINGS, hotkeyClickThroughToggle: 'F7' })

    expect(options.backend.unregister).toHaveBeenCalledWith('F8')
    expect(options.backend.register).toHaveBeenCalledWith('F7', options.onToggleClickThrough)
    expect(options.backend.register).toHaveBeenCalledTimes(1)
  })

  it('falls back to fallbackBackend when the primary backend rejects the accelerator', () => {
    const backend = makeBackend()
    backend.register.mockReturnValueOnce(false)
    const fallbackBackend = makeBackend()
    const logger = vi.fn()
    const manager = new HotkeyManager(makeOptions({ backend, fallbackBackend, logger }))

    manager.reconcile(SETTINGS)

    // F9 упал в основном → ушёл в fallback; остальные — в основном
    expect(fallbackBackend.register).toHaveBeenCalledWith('F9', expect.any(Function))
    expect(fallbackBackend.register).toHaveBeenCalledTimes(1)
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('fallback'))

    // роль, живущая в fallback, оттуда же и снимается при смене акселератора
    manager.reconcile({ ...SETTINGS, hotkeyExpandedPanel: 'F11' })
    expect(fallbackBackend.unregister).toHaveBeenCalledWith('F9')
    expect(backend.unregister).not.toHaveBeenCalledWith('F9')
  })

  it('logs and does not track the role when both backends reject', () => {
    const backend = makeBackend()
    backend.register.mockReturnValueOnce(false)
    const fallbackBackend = makeBackend(false)
    const logger = vi.fn()
    const manager = new HotkeyManager(makeOptions({ backend, fallbackBackend, logger }))

    manager.reconcile(SETTINGS)

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('F9'))
    manager.stop()
    expect(backend.unregister).not.toHaveBeenCalledWith('F9')
    expect(fallbackBackend.unregister).not.toHaveBeenCalledWith('F9')
  })

  it('stop() unregisters every currently-registered accelerator and stops both backends', () => {
    const backend = makeBackend()
    const fallbackBackend = makeBackend()
    const manager = new HotkeyManager(makeOptions({ backend, fallbackBackend }))
    manager.reconcile(SETTINGS)

    manager.stop()

    expect(backend.unregister).toHaveBeenCalledWith('F9')
    expect(backend.unregister).toHaveBeenCalledWith('F10')
    expect(backend.unregister).toHaveBeenCalledWith('F8')
    expect(backend.stop).toHaveBeenCalledTimes(1)
    expect(fallbackBackend.stop).toHaveBeenCalledTimes(1)
  })
})
