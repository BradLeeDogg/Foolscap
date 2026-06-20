import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from '../lib/pdfjs'
import {
  emptyPdfAnnotations,
  HIGHLIGHT_COLORS,
  type PdfAnnotations,
  type PdfRect
} from '@shared/pdfannot'

type Tool = 'select' | 'highlight' | 'note'

interface Props {
  sourceId: string
  dataUrl: string
  /** Called if PDF.js can't render — the viewer falls back to the plain iframe. */
  onError: () => void
}

const uid = (): string => Math.random().toString(36).slice(2, 10)

function normRect(d: { x0: number; y0: number; x1: number; y1: number }): PdfRect {
  const x = Math.min(d.x0, d.x1)
  const y = Math.min(d.y0, d.y1)
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    w: Math.min(1, Math.abs(d.x1 - d.x0)),
    h: Math.min(1, Math.abs(d.y1 - d.y0))
  }
}

/** Renders a PDF with PDF.js and lets the writer highlight regions and drop
 *  notes on the page; annotations persist per source and can be exported. */
export default function PdfAnnotator({ sourceId, dataUrl, onError }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const annotRef = useRef<PdfAnnotations>(emptyPdfAnnotations())
  const loadedRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [numPages, setNumPages] = useState(0)
  const [sizes, setSizes] = useState<Array<{ w: number; h: number }>>([])
  const [annot, setAnnotState] = useState<PdfAnnotations>(emptyPdfAnnotations())
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>(HIGHLIGHT_COLORS[0])
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const flash = (m: string): void => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2200)
  }

  const persist = (next: PdfAnnotations): void => {
    annotRef.current = next
    setAnnotState(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void window.api.pdfAnnot.save(sourceId, next), 400)
  }

  // Load saved annotations for this source.
  useEffect(() => {
    loadedRef.current = false
    void window.api.pdfAnnot.get(sourceId).then((a) => {
      annotRef.current = a
      setAnnotState(a)
      loadedRef.current = true
    })
  }, [sourceId])

  // Flush any pending save when leaving / switching source.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        if (loadedRef.current) void window.api.pdfAnnot.save(sourceId, annotRef.current)
      }
    }
  }, [sourceId])

  // Load the PDF document.
  useEffect(() => {
    let cancelled = false
    setNumPages(0)
    setSizes([])
    let bytes: Uint8Array
    try {
      bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
    } catch {
      onError()
      return
    }
    pdfjs()
      .getDocument({ data: bytes })
      .promise.then((doc) => {
        if (cancelled) {
          void doc.destroy()
          return
        }
        docRef.current = doc
        setNumPages(doc.numPages)
      })
      .catch((e) => {
        console.error('PDF.js failed to open the document', e)
        onError()
      })
    return () => {
      cancelled = true
      const d = docRef.current
      docRef.current = null
      if (d) void d.destroy()
    }
  }, [dataUrl, onError])

  // Render every page to its canvas once the canvases mount.
  useEffect(() => {
    const doc = docRef.current
    const container = containerRef.current
    if (!doc || !numPages || !container) return
    let cancelled = false
    const run = async (): Promise<void> => {
      const cw = Math.max(240, container.clientWidth - 28)
      const dpr = window.devicePixelRatio || 1
      for (let i = 1; i <= numPages; i++) {
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: cw / base.width })
        const canvas = canvasRefs.current[i - 1]
        if (!canvas) continue
        canvas.width = Math.floor(vp.width * dpr)
        canvas.height = Math.floor(vp.height * dpr)
        canvas.style.width = `${vp.width}px`
        canvas.style.height = `${vp.height}px`
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        if (cancelled) return
        setSizes((prev) => {
          const copy = [...prev]
          copy[i - 1] = { w: vp.width, h: vp.height }
          return copy
        })
      }
    }
    run().catch((e) => {
      console.error('PDF.js render error', e)
      onError()
    })
    return () => {
      cancelled = true
    }
  }, [numPages, onError])

  const rel = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const onDown = (e: React.PointerEvent, page: number): void => {
    if (tool !== 'highlight') return
    const p = rel(e)
    setDrag({ page, x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent): void => {
    if (!drag) return
    const p = rel(e)
    setDrag({ ...drag, x1: p.x, y1: p.y })
  }
  const onUp = (): void => {
    if (!drag) return
    const rect = normRect(drag)
    if (rect.w > 0.006 && rect.h > 0.004) {
      persist({
        ...annotRef.current,
        highlights: [...annotRef.current.highlights, { id: uid(), page: drag.page, rect, color }]
      })
    }
    setDrag(null)
  }
  const onPageClick = (e: React.MouseEvent, page: number): void => {
    if (tool !== 'note') return
    const p = rel(e)
    const text = window.prompt('Note:')
    if (text && text.trim()) {
      persist({
        ...annotRef.current,
        notes: [...annotRef.current.notes, { id: uid(), page, x: p.x, y: p.y, text: text.trim() }]
      })
    }
  }
  const editNote = (id: string): void => {
    const note = annotRef.current.notes.find((n) => n.id === id)
    if (!note) return
    const text = window.prompt('Edit note (clear to delete):', note.text)
    if (text === null) return
    persist({
      ...annotRef.current,
      notes: text.trim()
        ? annotRef.current.notes.map((n) => (n.id === id ? { ...n, text: text.trim() } : n))
        : annotRef.current.notes.filter((n) => n.id !== id)
    })
  }
  const deleteHighlight = (id: string): void =>
    persist({ ...annotRef.current, highlights: annotRef.current.highlights.filter((h) => h.id !== id) })

  const exportPdf = async (): Promise<void> => {
    flash('Exporting…')
    const out = await window.api.pdfAnnot.export(sourceId, annotRef.current)
    flash(out ? 'Saved annotated PDF' : 'Export cancelled')
  }

  return (
    <div className="pdf-annot">
      <div className="pdf-tools">
        <button className={tool === 'select' ? 'on' : ''} title="Select / scroll" onClick={() => setTool('select')}>
          ↖
        </button>
        <button className={tool === 'highlight' ? 'on' : ''} title="Highlight (drag a box)" onClick={() => setTool('highlight')}>
          ▭
        </button>
        <button className={tool === 'note' ? 'on' : ''} title="Add note (click the page)" onClick={() => setTool('note')}>
          ✎
        </button>
        <span className="pdf-colors">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className={`pdf-swatch ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              title="Highlight color"
              onClick={() => {
                setColor(c)
                setTool('highlight')
              }}
            />
          ))}
        </span>
        <span className="fmt-spacer" />
        <button onClick={exportPdf} title="Export a copy with the annotations burned in">
          ⤓ Annotated PDF
        </button>
        {msg && <span className="pdf-msg muted">{msg}</span>}
      </div>

      <div className={`pdf-pages tool-${tool}`} ref={containerRef}>
        {numPages === 0 && <p className="muted drawer-pad">Rendering PDF…</p>}
        {Array.from({ length: numPages }, (_, i) => {
          const page = i + 1
          const size = sizes[i]
          const dragRect = drag && drag.page === page ? normRect(drag) : null
          return (
            <div className="pdf-page" key={page}>
              <canvas
                ref={(el) => {
                  canvasRefs.current[i] = el
                }}
              />
              {size && (
                <div
                  className="pdf-overlay"
                  style={{ width: size.w, height: size.h }}
                  onPointerDown={(e) => onDown(e, page)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onClick={(e) => onPageClick(e, page)}
                >
                  {annot.highlights
                    .filter((h) => h.page === page)
                    .map((h) => (
                      <div
                        key={h.id}
                        className="pdf-hl"
                        style={{
                          left: `${h.rect.x * 100}%`,
                          top: `${h.rect.y * 100}%`,
                          width: `${h.rect.w * 100}%`,
                          height: `${h.rect.h * 100}%`,
                          background: h.color
                        }}
                      >
                        <button className="pdf-hl-x" title="Delete highlight" onClick={() => deleteHighlight(h.id)}>
                          ×
                        </button>
                      </div>
                    ))}
                  {annot.notes
                    .filter((n) => n.page === page)
                    .map((n, idx) => (
                      <button
                        key={n.id}
                        className="pdf-note"
                        style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
                        title={n.text}
                        onClick={(e) => {
                          e.stopPropagation()
                          editNote(n.id)
                        }}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  {dragRect && (
                    <div
                      className="pdf-hl pdf-hl-drag"
                      style={{
                        left: `${dragRect.x * 100}%`,
                        top: `${dragRect.y * 100}%`,
                        width: `${dragRect.w * 100}%`,
                        height: `${dragRect.h * 100}%`,
                        background: color
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
