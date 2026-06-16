import { useEffect, useState } from 'react'
import type { Source, SourceKind } from '@shared/types'

interface Props {
  onClose: () => void
}

const MANUAL_KINDS: SourceKind[] = ['url', 'transcript', 'note']

/** The project's research library: captured pages, file assets, transcripts, notes. */
export default function SourcesPanel({ onClose }: Props): JSX.Element {
  const [sources, setSources] = useState<Source[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [kind, setKind] = useState<SourceKind>('url')
  const [title, setTitle] = useState('')
  const [ref, setRef] = useState('')

  const refresh = (): void => {
    void window.api.source.list().then(setSources)
  }
  useEffect(refresh, [])

  const capture = async (): Promise<void> => {
    if (!url.trim()) return
    setBusy(true)
    setMsg('Capturing…')
    try {
      const s = await window.api.source.capture(url.trim())
      setUrl('')
      setMsg(`Captured “${s.title}”`)
      refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Capture failed')
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (): Promise<void> => {
    const s = await window.api.source.importFile()
    if (s) {
      setMsg(`Imported “${s.title}”`)
      refresh()
    }
  }

  const addManual = async (): Promise<void> => {
    if (!title.trim()) return
    await window.api.source.createManual({
      kind,
      title: title.trim(),
      url: kind === 'url' ? ref.trim() || null : null,
      locator: kind === 'transcript' ? ref.trim() || null : null
    })
    setTitle('')
    setRef('')
    refresh()
  }

  const remove = async (id: string): Promise<void> => {
    setSources(await window.api.source.remove(id))
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Sources</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="src-section">
        <label className="insp-label">Capture web page</label>
        <div className="src-capture">
          <input
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && capture()}
          />
          <button className="primary" disabled={busy} onClick={capture}>
            Capture
          </button>
        </div>
        <button onClick={importFile}>Import file (PDF / image)…</button>
        {msg && <p className="src-msg muted">{msg}</p>}
      </div>

      <div className="src-section">
        <label className="insp-label">Add reference</label>
        <div className="src-manual">
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
            {MANUAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input value={title} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />
          {kind !== 'note' && (
            <input
              value={ref}
              placeholder={kind === 'url' ? 'URL' : 'Timestamp / locator'}
              onChange={(e) => setRef(e.target.value)}
            />
          )}
          <button onClick={addManual}>Add</button>
        </div>
      </div>

      <ul className="src-list">
        {sources.length === 0 && <li className="muted drawer-pad">No sources yet.</li>}
        {sources.map((s) => (
          <li key={s.id}>
            <div className="src-item">
              <span className={`src-kind src-kind-${s.kind}`}>{s.kind}</span>
              <span className="src-title">{s.title}</span>
              <button className="recent-remove" title="Delete" onClick={() => remove(s.id)}>
                ×
              </button>
            </div>
            {s.url && <span className="src-sub">{s.url}</span>}
            {s.locator && <span className="src-sub">@ {s.locator}</span>}
          </li>
        ))}
      </ul>
    </aside>
  )
}
