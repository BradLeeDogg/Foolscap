import { useEffect, useState } from 'react'
import type { Snapshot } from '@shared/types'
import { diffLines, type DiffOp } from '@shared/diff'
import { docLines } from '@shared/docops'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

export default function SnapshotsPanel({ onClose }: Props): JSX.Element {
  const selectedId = useStore((s) => s.selectedId)
  const tree = useStore((s) => s.tree)
  const select = useStore((s) => s.select)
  const item = tree.find((t) => t.id === selectedId) ?? null
  const isDocument = item?.type === 'document'

  const [list, setList] = useState<Snapshot[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [diff, setDiff] = useState<{ name: string; ops: DiffOp[] } | null>(null)

  const refresh = (): void => {
    if (selectedId && isDocument) window.api.snapshot.list(selectedId).then(setList)
    else setList([])
  }
  useEffect(refresh, [selectedId, isDocument])

  const create = async (): Promise<void> => {
    if (!selectedId) return
    setBusy(true)
    try {
      await window.api.snapshot.create(selectedId, name.trim() || new Date().toLocaleString())
      setName('')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const restore = async (snap: Snapshot): Promise<void> => {
    if (!window.confirm(`Roll “${item?.title}” back to “${snap.name}”? Current text is replaced.`))
      return
    await window.api.snapshot.restore(snap.id)
    // Force the editor to reload by re-selecting the document.
    select(null)
    setTimeout(() => select(snap.itemId), 0)
  }

  const remove = async (snap: Snapshot): Promise<void> => {
    setList(await window.api.snapshot.remove(snap.id))
  }

  const compare = async (snap: Snapshot): Promise<void> => {
    if (!selectedId) return
    const [snapC, curC] = await Promise.all([
      window.api.snapshot.read(snap.id),
      window.api.document.read(selectedId)
    ])
    if (!snapC || !curC) return
    setDiff({ name: snap.name, ops: diffLines(docLines(snapC.doc), docLines(curC.doc)) })
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Snapshots</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>
      {!isDocument ? (
        <p className="muted drawer-pad">Select a document to snapshot it.</p>
      ) : (
        <>
          <div className="snapshot-new drawer-pad">
            <input
              value={name}
              placeholder="Snapshot name (optional)"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button className="primary" disabled={busy} onClick={create}>
              Take snapshot
            </button>
          </div>
          <ul className="snapshot-list">
            {list.length === 0 && <li className="muted drawer-pad">No snapshots yet.</li>}
            {list.map((s) => (
              <li key={s.id}>
                <div className="snapshot-meta">
                  <span className="snapshot-name">{s.name}</span>
                  <span className="snapshot-sub">
                    {new Date(s.createdAt).toLocaleString()} · {s.wordCount} words
                  </span>
                </div>
                <div className="snapshot-actions">
                  <button onClick={() => compare(s)}>Compare</button>
                  <button onClick={() => restore(s)}>Restore</button>
                  <button className="danger" onClick={() => remove(s)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {diff && (
            <div className="snapshot-diff">
              <div className="drawer-head">
                <h4>vs. “{diff.name}”</h4>
                <button className="icon" onClick={() => setDiff(null)}>
                  ×
                </button>
              </div>
              <div className="diff-body">
                {diff.ops.map((op, i) => (
                  <p key={i} className={`diff-line diff-${op.type}`}>
                    {op.type === 'add' ? '+ ' : op.type === 'del' ? '− ' : '  '}
                    {op.text || ' '}
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  )
}
