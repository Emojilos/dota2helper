import { useEffect, useState, type JSX } from 'react'
import { APP_NAME } from '@shared/index'
import type { GameState } from '@shared/schemas/gameState'
import { useSettingsStore } from './store/settingsStore'

/**
 * TASK-007/018: минимальная проверка IPC-моста window.midmind — подписка на
 * push gameState:update и settings:update (через Zustand-стор настроек).
 * Полноценный UI оверлея (компактная панель/уведомления) — TASK-014/015.
 */
function App(): JSX.Element {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const init = useSettingsStore((state) => state.init)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const unsubscribe = window.midmind.on('gameState:update', setGameState)
    return unsubscribe
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-transparent">
      <div className="rounded-lg border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-100">
        <p>{APP_NAME} overlay ready</p>
        <p>
          clock={gameState?.map?.clockTime ?? '—'} hero={gameState?.hero?.name ?? '—'}
        </p>
        <p>hotkey_expanded_panel={settings?.hotkeyExpandedPanel ?? '—'}</p>
        <p>hotkey_silent_mode={settings?.hotkeySilentMode ?? '—'}</p>
        <p>silent_mode={String(settings?.silentMode ?? false)}</p>
        <button
          type="button"
          className="mt-1 rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={() => void setSettings({ silentMode: !settings?.silentMode })}
        >
          Toggle silent mode
        </button>
      </div>
    </div>
  )
}

export default App
