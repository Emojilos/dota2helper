import { useEffect, useState, type JSX } from 'react'
import { APP_NAME } from '@shared/index'
import type { GameState } from '@shared/schemas/gameState'
import type { AppSettings } from '@shared/schemas/settings'

/**
 * TASK-007: минимальная проверка IPC-моста window.midmind — подписка на push
 * gameState:update и invoke settings:get. Полноценный UI оверлея (компактная
 * панель/уведомления) — TASK-014/015.
 */
function App(): JSX.Element {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    const unsubscribe = window.midmind.on('gameState:update', setGameState)
    window.midmind.invoke('settings:get', undefined).then(setSettings).catch(console.error)
    return unsubscribe
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-transparent">
      <div className="rounded-lg border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-100">
        <p>{APP_NAME} overlay ready</p>
        <p>
          clock={gameState?.map?.clockTime ?? '—'} hero={gameState?.hero?.name ?? '—'}
        </p>
        <p>hotkey={settings?.hotkeyExpandedPanel ?? '—'}</p>
      </div>
    </div>
  )
}

export default App
