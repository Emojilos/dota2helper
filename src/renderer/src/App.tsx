import type { JSX } from 'react'
import { APP_NAME } from '@shared/index'

function App(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-transparent">
      <span className="rounded-lg border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-100">
        {APP_NAME} overlay ready
      </span>
    </div>
  )
}

export default App
