import { promises as fs } from 'fs'
import { join } from 'path'
import { PDFDocument, StandardFonts, rgb, type RGB } from 'pdf-lib'
import type { PdfAnnotations, PdfNote } from '@shared/pdfannot'
import { emptyPdfAnnotations } from '@shared/pdfannot'
import { pdfAnnotationsFile } from './paths'
import { readJson, writeJsonAtomic } from './atomic'

/** Read a PDF source's saved highlights + notes (empty if none yet). */
export async function getAnnotations(root: string, id: string): Promise<PdfAnnotations> {
  const data = await readJson<PdfAnnotations>(pdfAnnotationsFile(root, id))
  if (!data) return emptyPdfAnnotations()
  return { highlights: data.highlights ?? [], notes: data.notes ?? [] }
}

/** Persist a PDF source's annotations (atomic write). */
export async function saveAnnotations(
  root: string,
  id: string,
  annotations: PdfAnnotations
): Promise<void> {
  await writeJsonAtomic(pdfAnnotationsFile(root, id), annotations)
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return rgb(1, 0.88, 0.4)
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255)
}

function wrapText(text: string, max: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      if (line) lines.push(line)
      line = w
    } else {
      line = (line ? line + ' ' : '') + w
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/**
 * Burn the highlights and note pins into a copy of the PDF and write it to
 * `outPath`. Notes also get a numbered pin plus an appended "Notes" page so the
 * text is legible without covering the original content.
 */
export async function exportAnnotatedPdf(
  root: string,
  relPdfPath: string,
  annotations: PdfAnnotations,
  outPath: string
): Promise<void> {
  const bytes = await fs.readFile(join(root, relPdfPath))
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pages = pdf.getPages()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  for (const h of annotations.highlights) {
    const page = pages[h.page - 1]
    if (!page) continue
    const { width: W, height: H } = page.getSize()
    page.drawRectangle({
      x: h.rect.x * W,
      y: H - (h.rect.y + h.rect.h) * H,
      width: h.rect.w * W,
      height: h.rect.h * H,
      color: hexToRgb(h.color),
      opacity: 0.35
    })
  }

  annotations.notes.forEach((n: PdfNote, i) => {
    const page = pages[n.page - 1]
    if (!page) return
    const { width: W, height: H } = page.getSize()
    const x = n.x * W
    const y = H - n.y * H
    page.drawCircle({ x, y, size: 8, color: rgb(1, 0.85, 0.2), borderColor: rgb(0.45, 0.32, 0), borderWidth: 1 })
    page.drawText(String(i + 1), { x: x - (i + 1 >= 10 ? 6 : 3), y: y - 4, size: 9, font, color: rgb(0.2, 0.15, 0) })
  })

  if (annotations.notes.length) {
    let page = pdf.addPage()
    let y = page.getSize().height - 56
    const left = 56
    const writeLine = (text: string, size: number): void => {
      if (y < 56) {
        page = pdf.addPage()
        y = page.getSize().height - 56
      }
      page.drawText(text, { x: left, y, size, font, color: rgb(0.1, 0.09, 0.07) })
      y -= size + 6
    }
    writeLine('Notes', 18)
    y -= 8
    annotations.notes.forEach((n, i) => {
      const lines = wrapText(`${i + 1}.  (p.${n.page})  ${n.text}`, 92)
      for (const l of lines) writeLine(l, 11)
      y -= 6
    })
  }

  await fs.writeFile(outPath, await pdf.save())
}
