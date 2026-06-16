import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { allDocuments } from '../lib/tree'
import DocumentEditor from './DocumentEditor'

/** The second pane in split view — any document, picked independently. */
export default function SplitPane(): JSX.Element {
  const tree = useStore((s) => s.tree)
  const splitId = useStore((s) => s.splitId)
  const setSplit = useStore((s) => s.setSplit)
  const docs = useMemo(() => allDocuments(tree), [tree])

  return (
    <div className="split-pane">
      <div className="split-head">
        <select value={splitId ?? ''} onChange={(e) => setSplit(e.target.value || null)}>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        <button className="icon" title="Close split" onClick={() => setSplit(null)}>
          ×
        </button>
      </div>
      {splitId ? (
        <DocumentEditor key={splitId} docId={splitId} hideNotes />
      ) : (
        <div className="editor-empty">
          <p className="muted">Choose a document.</p>
        </div>
      )}
    </div>
  )
}
