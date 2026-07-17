import { describe, expect, it, vi, beforeEach } from 'vitest'

const getAllWindows = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows }
}))

describe('broadcast', () => {
  beforeEach(() => {
    getAllWindows.mockReset()
  })

  it('sends the payload on the given channel to every non-destroyed window', async () => {
    const { broadcast } = await import('@main/ipc/broadcast')
    const send1 = vi.fn()
    const send2 = vi.fn()
    getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: send1 } },
      { isDestroyed: () => false, webContents: { send: send2 } }
    ])

    broadcast('config:reloaded', { name: 'timings', status: 'ok' })

    expect(send1).toHaveBeenCalledWith('config:reloaded', { name: 'timings', status: 'ok' })
    expect(send2).toHaveBeenCalledWith('config:reloaded', { name: 'timings', status: 'ok' })
  })

  it('skips destroyed windows', async () => {
    const { broadcast } = await import('@main/ipc/broadcast')
    const send = vi.fn()
    getAllWindows.mockReturnValue([{ isDestroyed: () => true, webContents: { send } }])

    broadcast('config:reloaded', { name: 'timings', status: 'ok' })

    expect(send).not.toHaveBeenCalled()
  })
})
