import { useEffect, useMemo, useRef, useState } from 'react'
import type { BinderItem } from '@shared/types'
import { useStore } from '../store/useStore'
import { descendantDocuments } from '../lib/tree'
import DocumentEditor from './DocumentEditor'

interface Props {
  folderId: string
}

/**
 * Stitched ("Scrivenings") view: every document under a folder as one continuous
 * stream. Each section is its own autosaving editor, but only sections near the
 * viewport are mounted (the rest are light placeholders) so the whole-manuscript
 * view stays fast at book length. The running word count is seeded from cached
 * per-document counts so it's correct even before a section mounts.
 */
export default function Scrivenings({ folderId }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const select = useStore((s) => s.select)
  const setDocWordCount = useStore((s) => s.setDocWordCount)

  const docs = useMemo(() => descendantDocuments(tree, folderId), [tree, folderId])
  const counts = useRef<Record<string, number>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Seed the aggregate from cached counts whenever the section set changes.
  useEffect(() => {
    counts.current = Object.fromEntries(docs.map((d) => [d.id, d.wordCount]))
    setDocWordCount(Object.values(counts.current).reduce((a, b) => a + b, 0))
  }, [docs, setDocWordCount])

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
    <div className="editor-scroll" ref={scrollRef}>
      <div className="scrivenings">
        {docs.map((d) => (
          <ScrivSection
            key={d.id}
            doc={d}
            root={scrollRef}
            onOpen={() => select(d.id)}
            onWords={(n) => report(d.id, n)}
          />
        ))}
      </div>
    </div>
  )
}

interface SectionProps {
  doc: BinderItem
  root: React.RefObject<HTMLDivElement>
  onOpen: () => void
  onWords: (n: number) => void
}

/** One stitched section, mounted only when scrolled near (IntersectionObserver). */
function ScrivSection({ doc, root, onOpen, onWords }: SectionProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const heightRef = useRef(180)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.isIntersecting)
      },
      { root: root.current ?? null, rootMargin: '800px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  // Remember the rendered body height so the placeholder preserves scroll position.
  useEffect(() => {
    if (visible && bodyRef.current) heightRef.current = Math.max(120, bodyRef.current.offsetHeight)
  })

  return (
    <section className="scriv-section" ref={ref}>
      <header className="scriv-head" onClick={onOpen} title="Open this section on its own">
        {doc.title}
      </header>
      <div ref={bodyRef}>
        {visible ? (
          <DocumentEditor docId={doc.id} embedded hideNotes onWords={onWords} />
        ) : (
          <div className="scriv-placeholder" style={{ minHeight: heightRef.current }} />
        )}
      </div>
    </section>
  )
}
