import type { DocumentContent, ProseMirrorNode } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'
import { documentFile } from './paths'
import { readJson, writeJsonAtomic } from './atomic'

/** A fresh, empty document (single empty paragraph). */
export function emptyDoc(): DocumentContent {
  return {
    version: DOCUMENT_CONTENT_VERSION,
    doc: { type: 'doc', content: [{ type: 'paragraph' }] }
  }
}

/** A seeded paragraph: plain text, or text with block formatting the writer
 *  types over (centered titles, flush-left header lines, a bold label). */
export interface BodyLine {
  text: string
  align?: 'center' | 'right'
  /** Drop the body first-line indent (header lines, citation entries). */
  noIndent?: boolean
  /** Render the text in bold (e.g. an APA title or section label). */
  bold?: boolean
  /** Hanging indent (bibliography entries). */
  hanging?: boolean
}

/** A document seeded with one or more paragraphs of placeholder/body text. */
export function docFromParagraphs(paragraphs: Array<string | BodyLine>): DocumentContent {
  const content: ProseMirrorNode[] = paragraphs.map((p) => {
    const line: BodyLine = typeof p === 'string' ? { text: p } : p
    const node: ProseMirrorNode = { type: 'paragraph' }
    const attrs: Record<string, unknown> = {}
    if (line.align) attrs.align = line.align
    if (line.noIndent) attrs.noIndent = true
    if (line.hanging) attrs.hanging = true
    if (Object.keys(attrs).length) node.attrs = attrs
    if (line.text) {
      node.content = [
        line.bold
          ? { type: 'text', marks: [{ type: 'bold' }], text: line.text }
          : { type: 'text', text: line.text }
      ]
    }
    return node
  })
  return { version: DOCUMENT_CONTENT_VERSION, doc: { type: 'doc', content } }
}

function gatherText(node: ProseMirrorNode, out: string[]): void {
  if (typeof node.text === 'string') out.push(node.text)
  if (node.content) for (const child of node.content) gatherText(child, out)
}

/** Flatten a document to plain text (for word counting and search). */
export function extractPlainText(content: DocumentContent): string {
  const parts: string[] = []
  gatherText(content.doc, parts)
  return parts.join(' ')
}

/** Count words across all text in a document (whitespace-delimited). */
export function countWords(content: DocumentContent): number {
  const text = extractPlainText(content).trim()
  if (!text) return 0
  return text.match(/\S+/g)?.length ?? 0
}

export async function readDocument(root: string, id: string): Promise<DocumentContent | null> {
  return readJson<DocumentContent>(documentFile(root, id))
}

export async function writeDocument(
  root: string,
  id: string,
  content: DocumentContent
): Promise<void> {
  await writeJsonAtomic(documentFile(root, id), content)
}
