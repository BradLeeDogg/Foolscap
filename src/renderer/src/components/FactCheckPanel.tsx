import { useEffect, useState } from 'react'
import type { ClaimStatus, ClaimWithSources, Source } from '@shared/types'
import { useStore } from '../store/useStore'
import SourcePicker from './SourcePicker'

interface Props {
  onClose: () => void
}

const STATUSES: ClaimStatus[] = ['needs-sourcing', 'verified', 'disputed']

/**
 * The live fact-check packet: every factual claim in the current document tied
 * to stored sources, with a status, a quote-vs-audio flag, and a project-wide
 * list of everything still outstanding so nothing ships unverified.
 */
export default function FactCheckPanel({ onClose }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const item = tree.find((t) => t.id === selectedId) ?? null
  const isDoc = item?.type === 'document'

  const [claims, setClaims] = useState<ClaimWithSources[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [outstanding, setOutstanding] = useState<ClaimWithSources[]>([])
  const [showOutstanding, setShowOutstanding] = useState(false)
  const [newText, setNewText] = useState('')

  const titleOf = (docId: string): string => tree.find((t) => t.id === docId)?.title ?? '—'

  const refreshClaims = (): void => {
    if (selectedId && isDoc) void window.api.factcheck.listClaims(selectedId).then(setClaims)
    else setClaims([])
  }
  const refreshOutstanding = (): void => {
    void window.api.factcheck.outstanding().then(setOutstanding)
  }
  useEffect(refreshClaims, [selectedId, isDoc])
  useEffect(() => {
    void window.api.source.list().then(setSources)
    refreshOutstanding()
  }, [])

  const afterChange = (): void => {
    refreshClaims()
    refreshOutstanding()
  }

  const addClaim = async (): Promise<void> => {
    if (!selectedId || !newText.trim()) return
    await window.api.factcheck.createClaim(selectedId, newText.trim())
    setNewText('')
    afterChange()
  }
  const setStatus = async (id: string, status: ClaimStatus): Promise<void> => {
    await window.api.factcheck.updateClaim(id, { status })
    afterChange()
  }
  const toggleQuote = async (c: ClaimWithSources): Promise<void> => {
    await window.api.factcheck.updateClaim(c.id, { needsQuoteCheck: !c.needsQuoteCheck })
    afterChange()
  }
  const removeClaim = async (id: string): Promise<void> => {
    await window.api.factcheck.removeClaim(id)
    afterChange()
  }
  const link = async (claimId: string, sourceId: string): Promise<void> => {
    if (!sourceId) return
    await window.api.factcheck.linkSource(claimId, sourceId)
    afterChange()
  }
  const unlink = async (claimId: string, sourceId: string): Promise<void> => {
    await window.api.factcheck.unlinkSource(claimId, sourceId)
    afterChange()
  }

  return (
    <aside className="drawer factcheck">
      <div className="drawer-head">
        <h3>Fact-check</h3>
        <button className="icon" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="fc-outstanding">
        <button className="fc-out-toggle" onClick={() => setShowOutstanding((v) => !v)}>
          {showOutstanding ? '▾' : '▸'} Outstanding · {outstanding.length}
        </button>
        {showOutstanding && (
          <ul className="fc-out-list">
            {outstanding.length === 0 && <li className="muted drawer-pad">Nothing outstanding. ✓</li>}
            {outstanding.map((c) => (
              <li key={c.id} onClick={() => select(c.docId)}>
                <span className={`fc-dot fc-${c.status}`} />
                <span className="fc-out-text">{c.text}</span>
                <span className="fc-out-doc">{titleOf(c.docId)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isDoc ? (
        <p className="muted drawer-pad">Select a document to log its claims.</p>
      ) : (
        <>
          <div className="fc-add drawer-pad">
            <input
              value={newText}
              placeholder="A factual claim to verify…"
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addClaim()}
            />
            <button className="primary" onClick={addClaim}>
              Add claim
            </button>
          </div>

          <ul className="fc-claims">
            {claims.length === 0 && <li className="muted drawer-pad">No claims logged yet.</li>}
            {claims.map((c) => (
              <li className="fc-claim" key={c.id}>
                <div className="fc-claim-text">{c.text}</div>
                <div className="fc-claim-controls">
                  <select
                    className={`fc-status fc-${c.status}`}
                    value={c.status}
                    onChange={(e) => setStatus(c.id, e.target.value as ClaimStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <label className="fc-quote">
                    <input
                      type="checkbox"
                      checked={c.needsQuoteCheck}
                      onChange={() => toggleQuote(c)}
                    />
                    check vs. audio
                  </label>
                  <button className="recent-remove" aria-label="Delete claim" onClick={() => removeClaim(c.id)}>
                    ×
                  </button>
                </div>
                <div className="fc-sources">
                  {c.sources.map((s) => (
                    <span className="fc-source-chip" key={s.id}>
                      {s.title}
                      <button onClick={() => unlink(c.id, s.id)}>×</button>
                    </span>
                  ))}
                  <SourcePicker
                    sources={sources}
                    exclude={c.sources.map((cs) => cs.id)}
                    onPick={(sourceId) => void link(c.id, sourceId)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
