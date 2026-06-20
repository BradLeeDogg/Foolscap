import { promises as fs } from 'fs'
import { basename, extname, join } from 'path'
import { JSDOM } from 'jsdom'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import type { DocumentContent, ProseMirrorNode } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'

const MARK_FOR: Record<string, string> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline'
}

function wrap(content: ProseMirrorNode[]): DocumentContent {
  return {
    version: DOCUMENT_CONTENT_VERSION,
    doc: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
  }
}

// --- HTML (DOCX via mammoth) -----------------------------------------------

function inlineFrom(node: Node, marks: string[], out: ProseMirrorNode[]): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = child.textContent ?? ''
      if (text) out.push({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => ({ type: m })) } : {}) })
    } else if (child.nodeType === 1) {
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') {
        out.push({ type: 'hardBreak' })
        return
      }
      const extra = MARK_FOR[tag]
      inlineFrom(el, extra && !marks.includes(extra) ? [...marks, extra] : marks, out)
    }
  })
}

function inline(el: Element): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = []
  inlineFrom(el, [], out)
  return out
}

function blocksFrom(container: Element): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = []
  Array.from(container.children).forEach((el) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      out.push({ type: 'heading', attrs: { level: Math.min(3, Number(tag[1])) }, content: inline(el) })
    } else if (tag === 'p') {
      const content = inline(el)
      out.push(content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
    } else if (tag === 'blockquote') {
      out.push({ type: 'blockquote', content: blocksFrom(el) })
    } else if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.children)
        .filter((li) => li.tagName.toLowerCase() === 'li')
        .map((li) => ({ type: 'listItem', content: [{ type: 'paragraph', content: inline(li) }] }))
      out.push({ type: tag === 'ol' ? 'orderedList' : 'bulletList', content: items })
    } else if (tag === 'div' || tag === 'section' || tag === 'article') {
      out.push(...blocksFrom(el))
    } else {
      const content = inline(el)
      if (content.length) out.push({ type: 'paragraph', content })
    }
  })
  return out
}

export function htmlToProseMirror(html: string): DocumentContent {
  const dom = new JSDOM(html)
  return wrap(blocksFrom(dom.window.document.body))
}

// --- Markdown ---------------------------------------------------------------

function inlineMarkdown(text: string): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = []
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[2] !== undefined) out.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] })
    else out.push({ type: 'text', text: (m[3] ?? m[4])!, marks: [{ type: 'italic' }] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

export function markdownToProseMirror(md: string): DocumentContent {
  const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const content: ProseMirrorNode[] = []
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: Math.min(3, heading[1]!.length) },
        content: inlineMarkdown(heading[2]!)
      })
    } else {
      const inlineNodes = inlineMarkdown(trimmed.replace(/\n/g, ' '))
      content.push(inlineNodes.length ? { type: 'paragraph', content: inlineNodes } : { type: 'paragraph' })
    }
  }
  return wrap(content)
}

// --- RTF / plain text -------------------------------------------------------

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .trim()
}

function textToProseMirror(text: string): DocumentContent {
  const content = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }) as ProseMirrorNode)
  return wrap(content)
}

// --- PDF --------------------------------------------------------------------

/**
 * Split text extracted from a PDF into clean, editable paragraphs: form-feeds
 * (page breaks) and blank lines separate paragraphs, while the soft line-wraps
 * within a paragraph are joined back into flowing text. (Fallback path.)
 */
export function pdfTextToParagraphs(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n\n')
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
}

/** One visual line of a PDF, with its page, vertical position, and font size. */
export interface PdfLine {
  page: number
  y: number
  size: number
  text: string
}

export type PdfBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }

/**
 * Turn positioned PDF lines into structured blocks: lines noticeably larger than
 * the body font (and short) become headings; the rest flow into paragraphs that
 * break on blank-line gaps and page boundaries. Keeps the import editable while
 * recovering the document's headings and paragraphing.
 */
export function classifyPdfBlocks(lines: PdfLine[]): PdfBlock[] {
  const clean = lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text)
  if (!clean.length) return []

  // Body size = the size covering the most characters (i.e. the running text).
  const weight = new Map<number, number>()
  for (const l of clean) {
    const s = Math.round(l.size)
    weight.set(s, (weight.get(s) ?? 0) + l.text.length)
  }
  let body = 12
  let best = -1
  for (const [s, n] of weight) if (n > best) [best, body] = [n, s]

  const level = (size: number): number => {
    const r = size / body
    if (r >= 1.7) return 1
    if (r >= 1.4) return 2
    if (r >= 1.2) return 3
    return 0
  }

  const blocks: PdfBlock[] = []
  let para: string[] = []
  const flush = (): void => {
    if (para.length) blocks.push({ type: 'para', text: para.join(' ') })
    para = []
  }
  let prev: PdfLine | null = null
  for (const l of clean) {
    const lvl = level(l.size)
    const isHeading = lvl > 0 && l.text.split(/\s+/).length <= 16
    const samePage = prev !== null && prev.page === l.page
    const blankGap = samePage ? prev!.y - l.y > l.size * 1.8 : true
    if (isHeading) {
      flush()
      blocks.push({ type: 'heading', level: lvl, text: l.text })
    } else {
      if (blankGap) flush()
      para.push(l.text)
    }
    prev = l
  }
  flush()
  return blocks
}

/** Extract positioned lines from a PDF (text grouped by row, with font size). */
async function extractPdfLines(buffer: Buffer): Promise<PdfLine[]> {
  const lines: PdfLine[] = []
  let pageNum = 0
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      pageNum++
      const page = pageNum
      const tc = await pageData.getTextContent({ disableCombineTextItems: false })
      let cur: { y: number; size: number; text: string } | null = null
      for (const it of tc.items) {
        const y = it.transform[5] ?? 0
        const size = Math.hypot(it.transform[2] ?? 0, it.transform[3] ?? 0) || it.height || 12
        if (cur && Math.abs(cur.y - y) <= 1.5) {
          cur.text += it.str
          cur.size = Math.max(cur.size, size)
        } else {
          if (cur) lines.push({ page, ...cur })
          cur = { y, size, text: it.str }
        }
      }
      if (cur) lines.push({ page, ...cur })
      return ''
    }
  })
  return lines
}

function blocksToProseMirror(blocks: PdfBlock[]): DocumentContent {
  return wrap(
    blocks.map((b) =>
      b.type === 'heading'
        ? ({ type: 'heading', attrs: { level: b.level }, content: [{ type: 'text', text: b.text }] } as ProseMirrorNode)
        : ({ type: 'paragraph', content: [{ type: 'text', text: b.text }] } as ProseMirrorNode)
    )
  )
}

// --- Scrivener .scriv (best-effort) -----------------------------------------

export interface ScrivNode {
  title: string
  type: 'folder' | 'document'
  synopsis?: string
  content?: DocumentContent
  children?: ScrivNode[]
}

async function readFirst(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      return await fs.readFile(p, 'utf8')
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * Parse a Scrivener project folder into a binder subtree. Best-effort:
 * structure + titles + synopses + document *text* are imported; rich
 * formatting, labels/keywords, snapshots, and images are not (see docs).
 */
export async function parseScrivener(scrivDir: string): Promise<ScrivNode[]> {
  const entries = await fs.readdir(scrivDir)
  const scrivx = entries.find((e) => e.endsWith('.scrivx'))
  if (!scrivx) throw new Error('No .scrivx file found — is this a Scrivener project folder?')
  const xml = await fs.readFile(join(scrivDir, scrivx), 'utf8')
  const { window } = new JSDOM()
  const doc = new window.DOMParser().parseFromString(xml, 'application/xml')
  const binder = doc.querySelector('Binder')
  if (!binder) return []

  const contentFor = async (id: string): Promise<DocumentContent> => {
    const rtf = await readFirst([
      join(scrivDir, 'Files', 'Data', id, 'content.rtf'),
      join(scrivDir, 'Files', 'Docs', `${id}.rtf`)
    ])
    return rtf ? textToProseMirror(rtfToText(rtf)) : wrap([])
  }
  const synopsisFor = async (id: string): Promise<string> => {
    const txt = await readFirst([join(scrivDir, 'Files', 'Data', id, 'synopsis.txt')])
    return (txt ?? '').trim()
  }

  const walk = async (parent: Element): Promise<ScrivNode[]> => {
    const out: ScrivNode[] = []
    for (const item of Array.from(parent.children)) {
      if (item.tagName !== 'BinderItem') continue
      const type = item.getAttribute('Type') ?? ''
      if (/Trash/i.test(type)) continue
      const id = item.getAttribute('UUID') ?? item.getAttribute('ID') ?? ''
      const title = item.querySelector(':scope > Title')?.textContent?.trim() || 'Untitled'
      const childrenEl = item.querySelector(':scope > Children')
      const isFolder = /Folder/i.test(type) || !!childrenEl
      const node: ScrivNode = { title, type: isFolder ? 'folder' : 'document' }
      if (!isFolder && id) {
        node.content = await contentFor(id)
        node.synopsis = await synopsisFor(id)
      }
      if (childrenEl) node.children = await walk(childrenEl)
      out.push(node)
    }
    return out
  }

  return walk(binder)
}

// --- dispatch ---------------------------------------------------------------

export interface ImportResult {
  title: string
  content: DocumentContent
}

/** Convert a supported file into canonical document content + a title. */
export async function importFromFile(path: string): Promise<ImportResult> {
  const ext = extname(path).toLowerCase()
  const title = basename(path, ext)
  if (ext === '.docx') {
    const { value } = await mammoth.convertToHtml({ path })
    return { title, content: htmlToProseMirror(value) }
  }
  if (ext === '.md' || ext === '.markdown') {
    return { title, content: markdownToProseMirror(await fs.readFile(path, 'utf8')) }
  }
  if (ext === '.rtf') {
    return { title, content: textToProseMirror(rtfToText(await fs.readFile(path, 'utf8'))) }
  }
  if (ext === '.txt') {
    return { title, content: textToProseMirror(await fs.readFile(path, 'utf8')) }
  }
  if (ext === '.pdf') {
    const blocks = classifyPdfBlocks(await extractPdfLines(await fs.readFile(path)))
    if (!blocks.length) {
      throw new Error('No selectable text found in this PDF — it may be scanned images.')
    }
    return { title, content: blocksToProseMirror(blocks) }
  }
  throw new Error(`Unsupported file type: ${ext}`)
}
