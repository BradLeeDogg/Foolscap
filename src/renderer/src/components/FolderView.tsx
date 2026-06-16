import type { FolderView as FolderViewMode } from '../store/useStore'
import { useStore } from '../store/useStore'
import Scrivenings from './Scrivenings'
import Corkboard from './Corkboard'
import Outliner from './Outliner'

const MODES: Array<{ value: FolderViewMode; label: string }> = [
  { value: 'scrivenings', label: 'Stitched' },
  { value: 'corkboard', label: 'Corkboard' },
  { value: 'outliner', label: 'Outline' }
]

/** A folder shows as one of three views; the toggle is the only chrome. */
export default function FolderView({ folderId }: { folderId: string }): JSX.Element {
  const folderView = useStore((s) => s.folderView)
  const setFolderView = useStore((s) => s.setFolderView)

  return (
    <div className="folder-view">
      <div className="view-switch">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={folderView === m.value ? 'on' : ''}
            onClick={() => setFolderView(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="folder-view-body">
        {folderView === 'scrivenings' && <Scrivenings folderId={folderId} />}
        {folderView === 'corkboard' && <Corkboard folderId={folderId} />}
        {folderView === 'outliner' && <Outliner folderId={folderId} />}
      </div>
    </div>
  )
}
