import type { ProseMirrorNode } from './types'

/** Concatenate two documents' block content (used by "merge with previous"). */
export function mergeDocs(prev: ProseMirrorNode, cur: ProseMirrorNode): ProseMirrorNode {
  return { ...prev, type: 'doc', content: [...(prev.content ?? []), ...(cur.content ?? [])] }
}

function gatherText(n: ProseMirrorNode): string {
  return n.type === 'text' ? (n.text ?? '') : (n.content ?? []).map(gatherText).join('')
}

/** One text line per top-level block (for line-level diffing). */
export function docLines(doc: ProseMirrorNode): string[] {
  return (doc.content ?? []).map(gatherText)
}
