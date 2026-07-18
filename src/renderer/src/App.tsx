import { useEffect, useState, type JSX } from 'react'
import { APP_NAME } from '@shared/index'
import type { GameState } from '@shared/schemas/gameState'
import { parseSteamId64Input } from '@shared/steam/parseSteamId64'
import { useSettingsStore } from './store/settingsStore'
import { useSteamIdDetectionStore } from './store/steamIdStore'
import { usePatchStore } from './store/patchStore'

/**
 * TASK-030 (F6): баннер подтверждения автообнаруженного Steam ID + ручной
 * ввод (ID или ссылка на профиль). Валидация здесь — только для мгновенной
 * обратной связи по вводу; итог всё равно перепроверяет SettingsController
 * (main) перед персистом, так что renderer не может записать некорректный
 * steamId, даже если эта проверка разойдётся.
 */
function SteamIdSection(): JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const detectedSteamId = useSteamIdDetectionStore((state) => state.detectedSteamId)
  const dismissDetection = useSteamIdDetectionStore((state) => state.dismiss)
  const initDetection = useSteamIdDetectionStore((state) => state.init)
  const [manualInput, setManualInput] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  useEffect(() => {
    initDetection()
  }, [initDetection])

  const confirmDetected = (): void => {
    if (!detectedSteamId) {
      return
    }
    void setSettings({ steamId: detectedSteamId }).then(dismissDetection)
  }

  const submitManual = (): void => {
    const parsed = parseSteamId64Input(manualInput)
    if (!parsed.ok) {
      setManualError(parsed.error)
      return
    }
    setManualError(null)
    void setSettings({ steamId: parsed.steamId })
  }

  return (
    <div className="mt-2 border-t border-white/10 pt-2 text-xs">
      <p>steam_id={settings?.steamId ?? 'не привязан'}</p>
      <p>personal features: {settings?.steamId ? 'доступны' : 'привяжи Steam ID'}</p>

      {detectedSteamId && !settings?.steamId && (
        <div className="mt-1 rounded border border-amber-400/40 bg-amber-400/10 p-1">
          <p>Обнаружен Steam ID {detectedSteamId} — подтвердить?</p>
          <button type="button" className="mr-1 rounded border border-white/20 px-2 py-0.5 hover:bg-white/10" onClick={confirmDetected}>
            Подтвердить
          </button>
          <button type="button" className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10" onClick={dismissDetection}>
            Отклонить
          </button>
        </div>
      )}

      <div className="mt-1 flex items-center gap-1">
        <input
          type="text"
          value={manualInput}
          onChange={(event) => setManualInput(event.target.value)}
          placeholder="Steam ID или ссылка на профиль"
          className="rounded border border-white/20 bg-transparent px-1 py-0.5"
        />
        <button type="button" className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10" onClick={submitManual}>
          Привязать
        </button>
      </div>
      {manualError && <p className="text-red-400">Некорректный Steam ID: {manualError}</p>}
    </div>
  )
}

/**
 * TASK-047 (M6): баннер "данные обновляются" на реальную смену патча
 * (PatchWatcher в main решает, когда пушить patch:changed — см. patchStore).
 */
function PatchBanner(): JSX.Element | null {
  const changedToPatch = usePatchStore((state) => state.changedToPatch)
  const dismiss = usePatchStore((state) => state.dismiss)
  const init = usePatchStore((state) => state.init)

  useEffect(() => {
    init()
  }, [init])

  if (!changedToPatch) {
    return null
  }

  return (
    <div className="mt-2 rounded border border-sky-400/40 bg-sky-400/10 p-1 text-xs">
      <p>Патч обновился до {changedToPatch} — данные обновляются</p>
      <button type="button" className="mt-1 rounded border border-white/20 px-2 py-0.5 hover:bg-white/10" onClick={dismiss}>
        Понятно
      </button>
    </div>
  )
}

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
        <SteamIdSection />
        <PatchBanner />
      </div>
    </div>
  )
}

export default App
