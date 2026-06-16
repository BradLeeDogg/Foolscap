import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import DocumentEditor from './DocumentEditor'

/**
 * Distraction-free full-screen composition. A borderless full-screen window with
 * a solid dark backdrop — nothing on screen but the words. Optional typewriter
 * scrolling keeps the current line vertically centered.
 */
export default function CompositionMode(): JSX.Element {
  const selectedId = useStore((s) => s.selectedId)
  const tree = useStore((s) => s.tree)
  const docWordCount = useStore((s) => s.docWordCount)
  const setComposition = useStore((s) => s.setComposition)
  const typewriterDefault = useStore((s) => s.meta?.settings.typewriterSound ?? false)

  const selected = tree.find((t) => t.id === selectedId) ?? null
  const isDoc = selected?.type === 'document'
  const [typewriter, setTypewriter] = useState(true)

  useEffect(() => {
    void window.api.window.setFullScreen(true)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setComposition(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      void window.api.window.setFullScreen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Touch the default so the (currently sound-only) setting can later seed this.
  void typewriterDefault

  return (
    <div className="composition">
      <div className="composition-bar">
        <span className="composition-title">{selected?.title ?? 'Composition'}</span>
        <span className="spacer" />
        <span className="muted">{docWordCount.toLocaleString()} words</span>
        <button className={typewriter ? 'on' : ''} onClick={() => setTypewriter((v) => !v)}>
          Typewriter
        </button>
        <button onClick={() => setComposition(false)}>Exit · Esc</button>
      </div>
      <div className="composition-stage">
        {isDoc ? (
          <DocumentEditor key={selected!.id} docId={selected!.id} active typewriter={typewriter} hideNotes />
        ) : (
          <div className="editor-empty">
            <p>Select a document to compose.</p>
          </div>
        )}
      </div>
    </div>
  )
}
