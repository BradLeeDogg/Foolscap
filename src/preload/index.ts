import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// The single, typed surface between renderer and main. The renderer never
// touches the filesystem, the database, or Node directly — only this bridge.
// M0 ships a health check; M1 grows the project/binder/document API on top.
const api = {
  health(): Promise<{ ok: true; pid: number }> {
    return ipcRenderer.invoke('app:health')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback when contextIsolation is off — not used in production)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

export type WProcessorAPI = typeof api
