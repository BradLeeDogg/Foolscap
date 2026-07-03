import { useEffect, useState } from 'react'
import type { BackupInfo, Snapshot } from '@shared/types'
import { diffLines, type DiffOp } from '@shared/diff'
import { docLines } from '@shared/docops'
import { flushAllDirty, useStore } from '../store/useStore'

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
        <button className="icon" aria-label="Close" onClick={onClose}>
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
                <button className="icon" aria-label="Close" onClick={() => setDiff(null)}>
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
      <BackupsSection />
    </aside>
  )
}

/** Whole-project time travel: list the automatic/manual backup zips and
 *  restore any of them into a fresh sibling folder (never in place). */
function BackupsSection(): JSX.Element {
  const openResult = useStore((s) => s.openResult)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.backup.list().then(setBackups)
  }, [])

  const restore = async (b: BackupInfo): Promise<void> => {
    if (
      !window.confirm(
        `Restore “${b.fileName}” as a new copy of the project?\n\nThe current project is left untouched; the restored copy opens in a new folder beside it.`
      )
    )
      return
    setBusy(true)
    try {
      await flushAllDirty()
      openResult(await window.api.backup.restore(b.fileName))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not restore that backup.')
    } finally {
      setBusy(false)
    }
  }

  const size = (n: number): string => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

  return (
    <div className="backups-section">
      <div className="drawer-head">
        <h4>Project backups</h4>
      </div>
      {backups.length === 0 && (
        <p className="muted drawer-pad">No backups yet — they run automatically while you write.</p>
      )}
      <ul className="backup-list">
        {backups.slice(0, 12).map((b) => (
          <li key={b.fileName}>
            <div className="snapshot-meta">
              <span className="snapshot-name">{new Date(b.createdAt).toLocaleString()}</span>
              <span className="snapshot-sub">{size(b.sizeBytes)}</span>
            </div>
            <div className="snapshot-actions">
              <button disabled={busy} onClick={() => restore(b)}>
                Restore…
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
