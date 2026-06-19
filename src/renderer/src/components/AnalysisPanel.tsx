import { useEffect, useState } from 'react'
import { analyze, type AnalysisResult } from '@shared/analysis'
import { docLines } from '@shared/docops'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

/** On-demand, fully-local writing analysis for the current document. */
export default function AnalysisPanel({ onClose }: Props): JSX.Element {
  const getActiveText = useStore((s) => s.getActiveText)
  const selectedId = useStore((s) => s.selectedId)
  const tree = useStore((s) => s.tree)
  const isDoc = tree.find((t) => t.id === selectedId)?.type === 'document'
  const [res, setRes] = useState<AnalysisResult | null>(null)

  const run = async (): Promise<void> => {
    const live = getActiveText?.()
    if (live && live.trim()) {
      setRes(analyze(live))
      return
    }
    if (selectedId && isDoc) {
      const c = await window.api.document.read(selectedId)
      setRes(analyze(c ? docLines(c.doc).join('\n') : ''))
    } else {
      setRes(null)
    }
  }
  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const Stat = ({ label, value }: { label: string; value: string | number }): JSX.Element => (
    <div className="an-stat">
      <span className="an-num">{value}</span>
      <span className="an-label">{label}</span>
    </div>
  )

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Analysis</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      {!res ? (
        <p className="muted drawer-pad">Select a document to analyze it.</p>
      ) : (
        <div className="an-body">
          <div className="an-stats">
            <Stat label="words" value={res.words.toLocaleString()} />
            <Stat label="sentences" value={res.sentences.toLocaleString()} />
            <Stat label="paragraphs" value={res.paragraphs.toLocaleString()} />
            <Stat label="avg words/sentence" value={res.avgWordsPerSentence} />
            <Stat label="reading time" value={`${res.readingMinutes} min`} />
            <Stat label="grade level" value={res.gradeLevel} />
          </div>

          <h4 className="an-h">Watch for</h4>
          <ul className="an-issues">
            <li>
              <span>Long sentences (30+ words)</span>
              <span className="an-count">{res.longSentences}</span>
            </li>
            <li>
              <span>Passive voice</span>
              <span className="an-count">{res.passive}</span>
            </li>
            <li>
              <span>Adverbs (-ly)</span>
              <span className="an-count">{res.adverbs}</span>
            </li>
            <li>
              <span>Filler words</span>
              <span className="an-count">{res.fillers}</span>
            </li>
          </ul>

          <h4 className="an-h">Words you lean on</h4>
          {res.crutch.length ? (
            <div className="an-crutch">
              {res.crutch.map((c) => (
                <span key={c.word} className="an-chip">
                  {c.word} <em>{c.count}</em>
                </span>
              ))}
            </div>
          ) : (
            <p className="muted drawer-pad">No notably repeated words.</p>
          )}

          <div className="an-foot">
            <button onClick={() => void run()}>Refresh</button>
            <span className="muted an-note">Counts are guidance, not rules.</span>
          </div>
        </div>
      )}
    </aside>
  )
}
