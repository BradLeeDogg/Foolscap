import { ElectronAPI } from '@electron-toolkit/preload'
import type { FoolscapAPI } from '@shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: FoolscapAPI
  }
}
