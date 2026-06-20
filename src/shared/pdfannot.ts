/**
 * PDF annotation model — shared by the renderer (annotator UI) and the main
 * process (persistence + annotated-PDF export). All geometry is normalized to
 * 0..1 of the page box, origin top-left, so it is independent of render scale.
 */

export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PdfHighlight {
  id: string
  page: number // 1-based
  rect: PdfRect
  color: string // CSS color
}

export interface PdfNote {
  id: string
  page: number // 1-based
  x: number // normalized point (top-left origin)
  y: number
  text: string
}

export interface PdfAnnotations {
  highlights: PdfHighlight[]
  notes: PdfNote[]
}

export const HIGHLIGHT_COLORS = ['#ffe066', '#9be7a3', '#9bd1ff', '#ffb3c1'] as const

export function emptyPdfAnnotations(): PdfAnnotations {
  return { highlights: [], notes: [] }
}

/** Total annotation count — used for badges / empty checks. */
export function annotationCount(a: PdfAnnotations): number {
  return a.highlights.length + a.notes.length
}
