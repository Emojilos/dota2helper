/**
 * OverlayWindow (TASK-008): проверяет механику базового overlay-окна на
 * замоканном electron.BrowserWindow — прозрачность/always-on-top/click-through
 * задаются правильными вызовами, toggleInteractive() переключает
 * setIgnoreMouseEvents и возвращает новое состояние. Реальный рендер поверх
 * Dota 2 и замер FPS этим тестом не покрыты — см. CLAUDE.md/progress.txt.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const setIgnoreMouseEvents = vi.fn()
const setAlwaysOnTop = vi.fn()
const setVisibleOnAllWorkspaces = vi.fn()
const showInactive = vi.fn()
const loadURL = vi.fn()
const loadFile = vi.fn()
const on = vi.fn()
const getPosition = vi.fn(() => [24, 110])

let lastOptions: Record<string, unknown> | undefined

class MockBrowserWindow {
  setIgnoreMouseEvents = setIgnoreMouseEvents
  setAlwaysOnTop = setAlwaysOnTop
  setVisibleOnAllWorkspaces = setVisibleOnAllWorkspaces
  showInactive = showInactive
  loadURL = loadURL
  loadFile = loadFile
  on = on
  getPosition = getPosition

  constructor(options: Record<string, unknown>) {
    lastOptions = options
  }
}

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow
}))

describe('OverlayWindow', () => {
  beforeEach(() => {
    setIgnoreMouseEvents.mockClear()
    setAlwaysOnTop.mockClear()
    setVisibleOnAllWorkspaces.mockClear()
    showInactive.mockClear()
    loadURL.mockClear()
    loadFile.mockClear()
    on.mockClear()
    getPosition.mockClear()
    lastOptions = undefined
  })

  it('constructs a transparent, frameless, non-taskbar BrowserWindow and defaults to click-through', async () => {
    const { OverlayWindow } = await import('@main/windows/OverlayWindow')
    new OverlayWindow({ width: 320, height: 120 })

    expect(lastOptions).toMatchObject({
      transparent: true,
      frame: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      skipTaskbar: true
    })
    expect(setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
  })

  it('show() sets always-on-top at screen-saver level, all-workspaces visibility, and showInactive (no focus steal)', async () => {
    const { OverlayWindow } = await import('@main/windows/OverlayWindow')
    const overlay = new OverlayWindow({ width: 320, height: 120 })

    overlay.show()

    expect(setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    expect(showInactive).toHaveBeenCalled()
  })

  it('setInteractive(true) disables click-through; setInteractive(false) re-enables it', async () => {
    const { OverlayWindow } = await import('@main/windows/OverlayWindow')
    const overlay = new OverlayWindow({ width: 320, height: 120 })
    setIgnoreMouseEvents.mockClear()

    overlay.setInteractive(true)
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true })
    expect(overlay.isInteractive()).toBe(true)

    overlay.setInteractive(false)
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
    expect(overlay.isInteractive()).toBe(false)
  })

  it('toggleInteractive() flips state and returns the new value', async () => {
    const { OverlayWindow } = await import('@main/windows/OverlayWindow')
    const overlay = new OverlayWindow({ width: 320, height: 120 })

    expect(overlay.toggleInteractive()).toBe(true)
    expect(overlay.toggleInteractive()).toBe(false)
  })

  it('loadFile() forwards path+options to BrowserWindow.loadFile (TASK-014: ?window=compact-panel)', async () => {
    const { OverlayWindow } = await import('@main/windows/OverlayWindow')
    const overlay = new OverlayWindow({ width: 220, height: 100 })

    void overlay.loadFile('/app/renderer/index.html', { query: { window: 'compact-panel' } })

    expect(loadFile).toHaveBeenCalledWith('/app/renderer/index.html', { query: { window: 'compact-panel' } })
  })

  it('onMoved()/getPosition() forward to the underlying BrowserWindow (TASK-014: persist drag position)', async () => {
    const { OverlayWindow } = await import('@main/windows/OverlayWindow')
    const overlay = new OverlayWindow({ width: 220, height: 100 })
    const listener = vi.fn()

    overlay.onMoved(listener)
    expect(on).toHaveBeenCalledWith('moved', listener)
    expect(overlay.getPosition()).toEqual([24, 110])
  })
})
