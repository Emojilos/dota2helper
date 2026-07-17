import { describe, expect, it, vi, beforeEach } from 'vitest'

const exposeInMainWorld = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { on, removeListener, invoke }
}))

describe('preload bridge (window.midmind)', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    on.mockClear()
    removeListener.mockClear()
    invoke.mockClear()
    vi.stubGlobal('process', { ...process, contextIsolated: true })
  })

  it('exposes midmind on the main world when context-isolated', async () => {
    await import('../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledWith('midmind', expect.any(Object))
  })

  it('on() subscribes via ipcRenderer.on and unwraps the event before calling the listener', async () => {
    await import('../../src/preload/index')
    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as {
      on: (channel: string, listener: (payload: unknown) => void) => () => void
    }

    const listener = vi.fn()
    const unsubscribe = bridge.on('gameState:update', listener)

    expect(on).toHaveBeenCalledWith('gameState:update', expect.any(Function))
    const wrapped = on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void
    wrapped({ fake: 'event' }, { hero: null })
    expect(listener).toHaveBeenCalledWith({ hero: null })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('gameState:update', wrapped)
  })

  it('invoke() forwards to ipcRenderer.invoke', async () => {
    await import('../../src/preload/index')
    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as {
      invoke: (channel: string, request: unknown) => Promise<unknown>
    }
    invoke.mockResolvedValue({ verbosity: 'experienced' })

    const result = await bridge.invoke('settings:get', undefined)

    expect(invoke).toHaveBeenCalledWith('settings:get', undefined)
    expect(result).toEqual({ verbosity: 'experienced' })
  })
})
