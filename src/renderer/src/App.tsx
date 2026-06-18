import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Launcher from './components/Launcher'
import Workspace from './components/Workspace'

export default function App(): JSX.Element {
  const hasProject = useStore((s) => s.meta !== null)
  const theme = useStore((s) => s.meta?.settings.theme ?? 'paper')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return hasProject ? <Workspace /> : <Launcher />
}
