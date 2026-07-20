import { useEffect, useState } from 'react'
import type { GsiFieldCatalogConfig } from '@shared/schemas/gsiFieldCatalog'

const EMPTY_CATALOG: GsiFieldCatalogConfig = { fields: [] }

/**
 * Каталог gsi-field-catalog.json (F5, TASK-016) — invoke, а не push (каталог
 * меняется редко, см. doc-комментарий IpcPushChannels в shared/types/ipc.ts).
 * Перезапрашивает актуальную версию при hot-reload конфига (config:reloaded,
 * name='gsi-field-catalog', TASK-011) — тот же приём, что useConfigHealthStore,
 * без отдельного push-канала специально под каталог.
 */
export function useGsiFieldCatalog(): GsiFieldCatalogConfig {
  const [catalog, setCatalog] = useState<GsiFieldCatalogConfig>(EMPTY_CATALOG)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void window.midmind.invoke('gsiFieldCatalog:get', undefined).then((result) => {
        if (!cancelled) {
          setCatalog(result)
        }
      })
    }
    load()
    const unsubscribe = window.midmind.on('config:reloaded', (payload) => {
      if (payload.name === 'gsi-field-catalog' && payload.status === 'ok') {
        load()
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return catalog
}
