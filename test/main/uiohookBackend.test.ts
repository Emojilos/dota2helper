import { describe, expect, it, vi } from 'vitest'
import { UiohookBackend, type UiohookApi } from '@main/hotkeys/UiohookBackend'
import type { HookKeyboardEventLike } from '@shared/hotkeys/matchChord'

const F8 = 66
const F9 = 67

/** Фейковый uiohook-napi: хранит слушателей и позволяет эмитить события руками. */
function makeFakeUiohook() {
  const listeners = new Map<'keydown' | 'keyup', Set<(e: HookKeyboardEventLike) => void>>([
    ['keydown', new Set()],
    ['keyup', new Set()]
  ])
  const start = vi.fn()
  const stop = vi.fn()
  const api: UiohookApi = {
    uIOhook: {
      on: (event, listener) => listeners.get(event)?.add(listener),
      off: (event, listener) => listeners.get(event)?.delete(listener),
      start,
      stop
    },
    UiohookKey: { F8, F9 }
  }
  const emit = (event: 'keydown' | 'keyup', payload: Partial<HookKeyboardEventLike> & { keycode: number }) => {
    const full: HookKeyboardEventLike = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...payload }
    for (const listener of listeners.get(event) ?? []) {
      listener(full)
    }
  }
  return { api, emit, start, stop, listeners }
}

function makeBackend() {
  const fake = makeFakeUiohook()
  const logger = vi.fn()
  const backend = new UiohookBackend(logger, () => fake.api)
  return { backend, fake, logger }
}

describe('UiohookBackend', () => {
  it('starts the hook once on first successful register and fires the handler on a matching keydown', () => {
    const { backend, fake } = makeBackend()
    const handler = vi.fn()

    expect(backend.register('F8', handler)).toBe(true)
    expect(backend.register('F9', vi.fn())).toBe(true)
    expect(fake.start).toHaveBeenCalledTimes(1)

    fake.emit('keydown', { keycode: F8 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire on a keydown with extra modifiers held (exact chord match)', () => {
    const { backend, fake } = makeBackend()
    const handler = vi.fn()
    backend.register('F8', handler)

    fake.emit('keydown', { keycode: F8, ctrlKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('suppresses key auto-repeat: held key fires once until keyup', () => {
    const { backend, fake } = makeBackend()
    const handler = vi.fn()
    backend.register('F8', handler)

    fake.emit('keydown', { keycode: F8 })
    fake.emit('keydown', { keycode: F8 }) // автоповтор удержания
    fake.emit('keydown', { keycode: F8 })
    expect(handler).toHaveBeenCalledTimes(1)

    fake.emit('keyup', { keycode: F8 })
    fake.emit('keydown', { keycode: F8 })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('unregister stops firing that accelerator but keeps the hook for others', () => {
    const { backend, fake } = makeBackend()
    const f8Handler = vi.fn()
    const f9Handler = vi.fn()
    backend.register('F8', f8Handler)
    backend.register('F9', f9Handler)

    backend.unregister('F8')
    fake.emit('keydown', { keycode: F8 })
    fake.emit('keydown', { keycode: F9 })

    expect(f8Handler).not.toHaveBeenCalled()
    expect(f9Handler).toHaveBeenCalledTimes(1)
  })

  it('returns false and logs for an accelerator the parser rejects', () => {
    const { backend, logger } = makeBackend()

    expect(backend.register('Space', vi.fn())).toBe(false)
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Space'))
  })

  it('returns false and logs for a parseable key missing from the keymap', () => {
    const { backend, logger } = makeBackend()

    expect(backend.register('F13', vi.fn())).toBe(false)
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('F13'))
  })

  it('returns false and logs when the native module fails to load', () => {
    const logger = vi.fn()
    const backend = new UiohookBackend(logger, () => {
      throw new Error('no prebuild for this platform')
    })

    expect(backend.register('F8', vi.fn())).toBe(false)
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('failed to load'))
  })

  it('stop() detaches listeners, stops the hook and is idempotent', () => {
    const { backend, fake } = makeBackend()
    backend.register('F8', vi.fn())

    backend.stop()
    backend.stop()

    expect(fake.stop).toHaveBeenCalledTimes(1)
    expect(fake.listeners.get('keydown')?.size).toBe(0)
    expect(fake.listeners.get('keyup')?.size).toBe(0)
  })
})
