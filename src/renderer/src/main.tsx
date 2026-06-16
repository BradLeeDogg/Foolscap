import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store/useStore'
import type { OpenProjectResult } from '@shared/api'
import './styles/global.css'

// Headless E2E/smoke hook: lets a driver load a project into the store without
// clicking. Renderer-only (writes to local state); exposes no new capability.
;(window as unknown as { __wpOpenResult?: (r: OpenProjectResult) => void }).__wpOpenResult = (r) =>
  useStore.getState().openResult(r)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
