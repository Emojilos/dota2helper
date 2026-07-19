import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import CompactPanel from './compactPanel/CompactPanel'
import NotificationsPanel from './notifications/NotificationsPanel'
import './assets/main.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root not found')
}

/**
 * Одна renderer-сборка обслуживает несколько окон (TASK-014): main-процесс
 * грузит один и тот же index.html в каждое окно, различая их query-параметром
 * ?window=... (см. main/index.ts: createWindow — без параметра → настройки,
 * loadCompactPanelContent → compact-panel, loadNotificationsContent →
 * notifications, TASK-015). Роутинг не через react-router — «маршрутов» мало
 * и они не вложены, полноценный роутер был бы лишней абстракцией.
 */
const windowKind = new URLSearchParams(window.location.search).get('window')
const RootComponent =
  windowKind === 'compact-panel' ? CompactPanel : windowKind === 'notifications' ? NotificationsPanel : App

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
)
