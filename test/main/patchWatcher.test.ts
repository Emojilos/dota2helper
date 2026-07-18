/**
 * Тесты PatchWatcher (TASK-047): смена патча определяется сравнением с
 * app_state.lastSeenPatch (AppStateStore), не с content/meta-mid-heroes.json
 * напрямую — тот же приём fake-источника, что dataService.test.ts (fake
 * StratzDataSource вместо реального StratzClient).
 */
import { describe, expect, it, vi } from 'vitest'
import { openDatabase, runMigrations, AppStateStore } from '@main/db'
import { PatchWatcher, type PatchSource } from '@main/patch/PatchWatcher'

function createStore(): AppStateStore {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return new AppStateStore(db)
}

function fakePatchSource(patch: string | null): PatchSource {
  return { getCurrentPatch: async () => patch }
}

describe('PatchWatcher', () => {
  it('returns null and does nothing when there is no STRATZ client (offline)', async () => {
    const store = createStore()
    const watcher = new PatchWatcher(null, store)

    const result = await watcher.check()

    expect(result).toBeNull()
    expect(store.get('lastSeenPatch')).toBeNull()
  })

  it('on first run (no stored patch), records the patch but does not report a change', async () => {
    const store = createStore()
    const watcher = new PatchWatcher(fakePatchSource('7.39'), store)

    const result = await watcher.check()

    expect(result).toEqual({ patch: '7.39', changed: false })
    expect(store.get('lastSeenPatch')).toBe('7.39')
  })

  it('reports changed=false when the patch is the same as last seen', async () => {
    const store = createStore()
    store.set('lastSeenPatch', '7.39')
    const watcher = new PatchWatcher(fakePatchSource('7.39'), store)

    const result = await watcher.check()

    expect(result).toEqual({ patch: '7.39', changed: false })
  })

  it('reports changed=true and updates the stored patch when it differs from last seen', async () => {
    const store = createStore()
    store.set('lastSeenPatch', '7.39')
    const watcher = new PatchWatcher(fakePatchSource('7.40'), store)

    const result = await watcher.check()

    expect(result).toEqual({ patch: '7.40', changed: true })
    expect(store.get('lastSeenPatch')).toBe('7.40')
  })

  it('returns null and leaves the stored patch untouched when STRATZ returns null', async () => {
    const store = createStore()
    store.set('lastSeenPatch', '7.39')
    const watcher = new PatchWatcher(fakePatchSource(null), store)

    const result = await watcher.check()

    expect(result).toBeNull()
    expect(store.get('lastSeenPatch')).toBe('7.39')
  })

  it('returns null and leaves the stored patch untouched when the STRATZ request throws (never propagates)', async () => {
    const store = createStore()
    store.set('lastSeenPatch', '7.39')
    const failingSource: PatchSource = {
      getCurrentPatch: async () => {
        throw new Error('STRATZ down')
      }
    }
    const logger = vi.fn()
    const watcher = new PatchWatcher(failingSource, store, { logger })

    const result = await watcher.check()

    expect(result).toBeNull()
    expect(store.get('lastSeenPatch')).toBe('7.39')
    expect(logger).toHaveBeenCalled()
  })
})
