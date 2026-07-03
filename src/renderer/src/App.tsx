import { useEffect } from 'react'
import { flushAllDirty, useStore } from './store/useStore'
import Launcher from './components/Launcher'
import Workspace from './components/Workspace'
import Sheets from './components/Sheets'

export default function App(): JSX.Element {
  const hasProject = useStore((s) => s.meta !== null)
  const theme = useStore((s) => s.meta?.settings.theme ?? 'paper')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  // Quit handshake: main holds the window open until pending autosaves land.
  useEffect(() => {
    window.api.onFlushRequest(() => flushAllDirty())
  }, [])
  // A synonym chosen from the right-click thesaurus menu replaces the current
  // selection in the last-focused editor (same path as side-panel inserts).
  useEffect(() => {
    return window.api.onThesaurusReplace((synonym) => {
      // inserter parses its argument as HTML; escape so a synonym with &/<>
      // (rare WordNet entries) inserts as literal text.
      const text = synonym.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      useStore.getState().inserter?.(text)
    })
  }, [])
  return (
    <>
      {hasProject ? <Workspace /> : <Launcher />}
      <Sheets />
    </>
  )
}
