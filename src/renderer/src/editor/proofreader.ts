import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { proofread, type DocIssue, type ProofOptions } from '@shared/proofreader'

export const proofreadKey = new PluginKey('proofread')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    proofread: {
      /** Set the dialect + Oxford-comma options and recompute. */
      setProofreadOptions: (opts: ProofOptions) => ReturnType
    }
  }
}

interface PState {
  opts: ProofOptions | null
  issues: DocIssue[]
  deco: DecorationSet
}

/** Run the pure checker over every text block and map issues to doc positions. */
function compute(doc: PMNode, opts: ProofOptions | null): { issues: DocIssue[]; deco: DecorationSet } {
  if (!opts) return { issues: [], deco: DecorationSet.empty }
  const issues: DocIssue[] = []
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const charPos: number[] = []
    node.forEach((child, offset) => {
      if (!child.isText) return
      const s = child.text ?? ''
      const base = pos + 1 + offset
      for (let i = 0; i < s.length; i++) {
        text += s[i]
        charPos.push(base + i)
      }
    })
    for (const is of proofread(text, opts)) {
      const from = charPos[is.start]
      const last = charPos[is.end - 1]
      if (from == null || last == null) continue
      const to = last + 1
      issues.push({ ...is, from, to })
      decos.push(Decoration.inline(from, to, { class: `pf pf-${is.rule}` }))
    }
    return false
  })
  return { issues, deco: DecorationSet.create(doc, decos) }
}

export function getProofIssues(state: EditorState): DocIssue[] {
  return (proofreadKey.getState(state) as PState | undefined)?.issues ?? []
}

/**
 * Wraps the pure proofreader as a live editor layer: wavy underlines per issue
 * type, plus the mapped issue list (read by the Proofreader panel for jump/fix).
 */
export const Proofreader = Extension.create({
  name: 'proofread',

  addCommands() {
    return {
      setProofreadOptions:
        (opts: ProofOptions) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(proofreadKey, opts))
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PState>({
        key: proofreadKey,
        state: {
          init: () => ({ opts: null, issues: [], deco: DecorationSet.empty }),
          apply(tr, prev) {
            const metaOpts = tr.getMeta(proofreadKey) as ProofOptions | undefined
            const opts = metaOpts ?? prev.opts
            if (metaOpts || tr.docChanged) return { opts, ...compute(tr.doc, opts) }
            return prev
          }
        },
        props: {
          decorations(state) {
            return (proofreadKey.getState(state) as PState | undefined)?.deco
          }
        }
      })
    ]
  }
})
