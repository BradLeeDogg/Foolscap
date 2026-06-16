import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import DocumentEditor from './DocumentEditor'
import Scrivenings from './Scrivenings'

/** Chooses what to show for the current binder selection. */
export default function Editor(): JSX.Element {
  const selectedId = useStore((s) => s.selectedId)
  const tree = useStore((s) => s.tree)
  const selected = useMemo(() => tree.find((t) => t.id === selectedId) ?? null, [tree, selectedId])

  if (!selected) {
    return (
      <div className="editor-empty">
        <p>Select a document in the binder, or create one.</p>
      </div>
    )
  }
  if (selected.type === 'folder') {
    return <Scrivenings folderId={selected.id} />
  }
  return <DocumentEditor key={selected.id} docId={selected.id} active />
}
