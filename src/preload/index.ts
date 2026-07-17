/**
 * Preload-мост renderer <-> main (TASK-007). contextIsolation:true +
 * nodeIntegration:false (main/index.ts) означают, что renderer не видит
 * require/ipcRenderer напрямую — только то, что явно экспонировано здесь через
 * contextBridge. Единственный публикуемый объект — window.midmind, типизированный
 * по IpcContract (@shared/types/ipc), см. index.d.ts.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcInvokeChannel,
  IpcInvokeRequest,
  IpcInvokeResponse,
  IpcPushChannel,
  IpcPushPayload,
  MidMindBridge
} from '@shared/types/ipc'

const bridge: MidMindBridge = {
  on<C extends IpcPushChannel>(channel: C, listener: (payload: IpcPushPayload<C>) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcPushPayload<C>): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },
  invoke<C extends IpcInvokeChannel>(channel: C, request: IpcInvokeRequest<C>): Promise<IpcInvokeResponse<C>> {
    return ipcRenderer.invoke(channel, request)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('midmind', bridge)
  } catch (error) {
    console.error(error)
  }
}
