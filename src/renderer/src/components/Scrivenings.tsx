import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store/useStore'
import { descendantDocuments } from '../lib/tree'
import DocumentEditor from './DocumentEditor'

interface Props {
  folderId: string
}

/**
 * Stitched ("Scrivenings") view: every document under a folder, concatenated
 * into one continuous, editable stream. Each section is its own autosaving
 * editor, so editing here writes straight back to that document's file —
 * collapsing to a single section is just selecting it in the binder.
 */
export default function Scrivenings({ folderId }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const select = useStore((s) => s.select)
  const setDocWordCount = useStore((s) => s.setDocWordCount)

  const docs = useMemo(() => descendantDocuments(tree, folderId), [tree, folderId])
  const counts = useRef<Record<string, number>>({})

  // Reset the aggregate when the folder changes.
  useEffect(() => {
    counts.current = {}
  }, [folderId])

  const report = (id: string, n: number): void => {
    counts.current[id] = n
    setDocWordCount(Object.values(counts.current).reduce((a, b) => a + b, 0))
  }

  if (docs.length === 0) {
    return (
      <div className="editor-empty">
        <p>This folder has no documents yet.</p>
        <p className="muted">Add documents in the binder to see them stitched together here.</p>
      </div>
    )
  }

  return (
    <div className="editor-scroll">
      <div className="scrivenings">
        {docs.map((d) => (
          <section className="scriv-section" key={d.id}>
            <header
              className="scriv-head"
              onClick={() => select(d.id)}
              title="Open this section on its own"
            >
              {d.title}
            </header>
            <DocumentEditor docId={d.id} embedded hideNotes onWords={(n) => report(d.id, n)} />
          </section>
        ))}
      </div>
    </div>
  )
}
