import { useEffect, useState } from 'react'
import type { Transcript, TranscriptSegment, TranscriptWithSegments } from '@shared/types'

interface Props {
  onClose: () => void
}

type SegPatch = Partial<Pick<TranscriptSegment, 'speaker' | 'timestamp' | 'text'>>

/** Interview transcripts: paste & parse into speaker/timestamp segments, then
 *  push any line straight into the Sources library as a citeable quote. */
export default function TranscriptsPanel({ onClose }: Props): JSX.Element {
  const [list, setList] = useState<Transcript[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [current, setCurrent] = useState<TranscriptWithSegments | null>(null)
  const [raw, setRaw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refreshList = (): void => {
    void window.api.transcript.list().then(setList)
  }
  useEffect(refreshList, [])
  useEffect(() => {
    if (!currentId) {
      setCurrent(null)
      return
    }
    void window.api.transcript.get(currentId).then(setCurrent)
  }, [currentId])

  const flash = (m: string): void => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }

  const createNew = async (): Promise<void> => {
    const t = await window.api.transcript.create('Untitled transcript')
    refreshList()
    setCurrentId(t.id)
    setCurrent(t)
  }
  const rename = async (title: string): Promise<void> => {
    if (!currentId) return
    await window.api.transcript.rename(currentId, title)
    refreshList()
  }
  const removeTranscript = async (id: string): Promise<void> => {
    setList(await window.api.transcript.remove(id))
    if (currentId === id) setCurrentId(null)
  }
  const parse = async (): Promise<void> => {
    if (!currentId || !raw.trim()) return
    const t = await window.api.transcript.parse(currentId, raw)
    setCurrent(t)
    setRaw('')
    flash(`Parsed ${t.segments.length} segment${t.segments.length === 1 ? '' : 's'}`)
  }
  const addSegment = async (): Promise<void> => {
    if (!currentId) return
    setCurrent(await window.api.transcript.addSegment(currentId))
  }
  const editLocal = (segId: string, patch: SegPatch): void =>
    setCurrent((c) =>
      c ? { ...c, segments: c.segments.map((sg) => (sg.id === segId ? { ...sg, ...patch } : sg)) } : c
    )
  const persist = (segId: string, patch: SegPatch): void => {
    void window.api.transcript.updateSegment(segId, patch)
  }
  const removeSeg = async (segId: string): Promise<void> => {
    await window.api.transcript.removeSegment(segId)
    if (currentId) setCurrent(await window.api.transcript.get(currentId))
  }
  const toSource = async (seg: TranscriptSegment): Promise<void> => {
    if (!current) return
    await window.api.source.createManual({
      kind: 'transcript',
      title: seg.speaker ? `${seg.speaker} — ${current.title}` : current.title,
      locator: seg.timestamp || null,
      notes: seg.text
    })
    flash('Added to Sources')
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Transcripts</h3>
        <button className="icon" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="src-section">
        <div className="tr-pick">
          <select value={currentId ?? ''} onChange={(e) => setCurrentId(e.target.value || null)}>
            <option value="">— Select transcript —</option>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button onClick={createNew}>New</button>
        </div>
        {msg && <p className="src-msg muted">{msg}</p>}
      </div>

      {current && (
        <>
          <div className="src-section tr-titlebar">
            <input
              className="tr-title"
              value={current.title}
              onChange={(e) => setCurrent((c) => (c ? { ...c, title: e.target.value } : c))}
              onBlur={(e) => rename(e.target.value)}
            />
            <button
              className="recent-remove"
              title="Delete transcript"
              onClick={() => removeTranscript(current.id)}
            >
              Delete
            </button>
          </div>

          <div className="src-section">
            <label className="insp-label">Paste raw transcript</label>
            <textarea
              className="tr-raw"
              value={raw}
              placeholder={
                'Paste an interview — two common shapes work:\n\n' +
                '[00:12] Reporter: How did it start?\n' +
                'Subject: It began in March…\n\n' +
                '— or —\n\n' +
                'William B. Nichols   00:00\n' +
                'It began in March…'
              }
              onChange={(e) => setRaw(e.target.value)}
            />
            <button onClick={parse} disabled={!raw.trim()}>
              Parse into segments
            </button>
          </div>

          <ul className="tr-list">
            {current.segments.length === 0 && (
              <li className="muted drawer-pad">No segments yet — paste raw text above, or add one.</li>
            )}
            {current.segments.map((seg) => (
              <li key={seg.id} className="tr-seg">
                <div className="tr-seg-meta">
                  <input
                    className="tr-ts"
                    value={seg.timestamp}
                    placeholder="00:00"
                    onChange={(e) => editLocal(seg.id, { timestamp: e.target.value })}
                    onBlur={(e) => persist(seg.id, { timestamp: e.target.value })}
                  />
                  <input
                    className="tr-sp"
                    value={seg.speaker}
                    placeholder="Speaker"
                    onChange={(e) => editLocal(seg.id, { speaker: e.target.value })}
                    onBlur={(e) => persist(seg.id, { speaker: e.target.value })}
                  />
                  <button className="tr-tosrc" title="Save as a source quote" onClick={() => toSource(seg)}>
                    → Source
                  </button>
                  <button className="recent-remove" title="Delete segment" onClick={() => removeSeg(seg.id)}>
                    ×
                  </button>
                </div>
                <textarea
                  className="tr-text"
                  value={seg.text}
                  onChange={(e) => editLocal(seg.id, { text: e.target.value })}
                  onBlur={(e) => persist(seg.id, { text: e.target.value })}
                />
              </li>
            ))}
          </ul>
          <div className="src-section">
            <button onClick={addSegment}>+ Segment</button>
          </div>
        </>
      )}
    </aside>
  )
}
