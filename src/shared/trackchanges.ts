/**
 * Track-changes resolution — pure functions over document JSON, shared by the
 * editor's accept/reject commands, the compile exporters, and the self-test.
 * Keeping the integrity-critical logic here (rather than in live ProseMirror
 * transactions) means it can be unit-tested exhaustively.
 *
 * Two inline marks model a suggestion: `insertion` (text added) and `deletion`
 * (text struck out but not yet removed).
 */
import type { ProseMirrorNode } from './types'

function hasMark(n: ProseMirrorNode, name: string): boolean {
  return !!n.marks?.some((m) => m.type === name)
}

function resolve(
  node: ProseMirrorNode,
  drop: 'insertion' | 'deletion',
  strip: 'insertion' | 'deletion'
): ProseMirrorNode {
  if (!node.content) return node
  const content: ProseMirrorNode[] = []
  for (const child of node.content) {
    if (child.type === 'text') {
      if (hasMark(child, drop)) continue // resolved away
      if (child.marks?.some((m) => m.type === strip)) {
        content.push({ ...child, marks: child.marks.filter((m) => m.type !== strip) })
      } else {
        content.push(child)
      }
    } else {
      content.push(resolve(child, drop, strip))
    }
  }
  return { ...node, content }
}

/** Accept all tracked changes: keep insertions (drop their mark), remove deletions. */
export function acceptAllChanges(doc: ProseMirrorNode): ProseMirrorNode {
  return resolve(doc, 'deletion', 'insertion')
}

/** Reject all tracked changes: remove insertions, keep originals (drop deletion marks). */
export function rejectAllChanges(doc: ProseMirrorNode): ProseMirrorNode {
  return resolve(doc, 'insertion', 'deletion')
}

/** True if the document contains any insertion or deletion marks. */
export function hasTrackedChanges(node: ProseMirrorNode): boolean {
  if (node.type === 'text' && (hasMark(node, 'insertion') || hasMark(node, 'deletion'))) return true
  return !!node.content?.some(hasTrackedChanges)
}
