import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    claim: {
      /** Anchor the current selection to a fact-check claim by id. */
      setClaim: (claimId: string) => ReturnType
    }
  }
}

/**
 * Fact-check claim anchor as an inline mark. The claimId rides inside the
 * document JSON, so it autosaves, round-trips, and — crucially — moves with the
 * text as the writer edits (ProseMirror remaps marks automatically). This is
 * what lets a back-checker click a claim and land on the exact sentence.
 */
export const Claim = Mark.create({
  name: 'claim',
  inclusive: false,

  addAttributes() {
    return {
      claimId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-claim-id'),
        renderHTML: (attrs) => (attrs.claimId ? { 'data-claim-id': attrs.claimId } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-claim-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'claim-anchor' }), 0]
  },

  addCommands() {
    return {
      setClaim:
        (claimId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { claimId })
    }
  }
})

/** The full [from,to) span of a claim mark by id (contiguous text nodes). */
export function findClaimRange(doc: PMNode, claimId: string): { from: number; to: number } | null {
  let from: number | null = null
  let to: number | null = null
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    if (node.marks.some((m) => m.type.name === 'claim' && m.attrs.claimId === claimId)) {
      if (from === null) from = pos
      to = pos + node.nodeSize
    }
    return true
  })
  return from !== null && to !== null ? { from, to } : null
}
