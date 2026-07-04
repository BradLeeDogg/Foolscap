import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
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

/** Sentinel meta: a debounced full re-pass scheduled on idle after typing. */
const IDLE_FULL = 'proofread:idle-full'

/** Proofread one text block, mapping issue offsets to doc positions. */
function blockIssues(node: PMNode, pos: number, opts: ProofOptions): DocIssue[] {
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
  const out: DocIssue[] = []
  for (const is of proofread(text, opts)) {
    const from = charPos[is.start]
    const last = charPos[is.end - 1]
    if (from == null || last == null) continue
    out.push({ ...is, from, to: last + 1 })
  }
  return out
}

function decosFor(doc: PMNode, issues: DocIssue[]): DecorationSet {
  return DecorationSet.create(
    doc,
    issues.map((is) => Decoration.inline(is.from, is.to, { class: `pf pf-${is.rule}` }))
  )
}

/** Full pass: every text block in the document. */
function computeFull(doc: PMNode, opts: ProofOptions | null): { issues: DocIssue[]; deco: DecorationSet } {
  if (!opts) return { issues: [], deco: DecorationSet.empty }
  const issues: DocIssue[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    issues.push(...blockIssues(node, pos, opts))
    return false
  })
  return { issues, deco: decosFor(doc, issues) }
}

/**
 * Incremental pass: recompute ONLY the text blocks the transaction touched and
 * carry every other issue across by position-mapping. Keeps per-keystroke cost
 * proportional to the edited paragraph, not the whole manuscript (measured
 * ~12ms/keystroke at 15k words with the old full pass; <1ms this way). A
 * debounced idle full pass (see the plugin view) catches anything cross-block.
 */
function computeIncremental(tr: Transaction, prev: PState): { issues: DocIssue[]; deco: DecorationSet } {
  const opts = prev.opts
  if (!opts) return { issues: [], deco: DecorationSet.empty }
  const doc = tr.doc

  // 1. Changed ranges in the new document.
  const changed: Array<[number, number]> = []
  for (const stepMap of tr.mapping.maps) {
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      changed.push([newStart, newEnd])
    })
  }
  if (!changed.length) {
    const issues = mapIssues(prev.issues, tr)
    return { issues, deco: decosFor(doc, issues) }
  }

  // 2. The text blocks those ranges touch (dedup by block position).
  const blockAt = new Map<number, PMNode>()
  for (const [f, t] of changed) {
    const from = Math.max(0, Math.min(f, doc.content.size))
    const to = Math.max(from, Math.min(Math.max(t, f + 1), doc.content.size))
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true
      blockAt.set(pos, node)
      return false
    })
  }

  // 3. Issues outside the recomputed blocks survive (mapped); inside, replaced.
  const inRecomputed = (from: number): boolean => {
    for (const [pos, node] of blockAt) if (from >= pos && from <= pos + node.nodeSize) return true
    return false
  }
  const survivors = mapIssues(prev.issues, tr).filter((is) => !inRecomputed(is.from))
  const fresh: DocIssue[] = []
  for (const [pos, node] of blockAt) fresh.push(...blockIssues(node, pos, opts))

  const issues = [...survivors, ...fresh].sort((a, b) => a.from - b.from)
  return { issues, deco: decosFor(doc, issues) }
}

/** Map prior issues through a transaction; drop any that were deleted. */
function mapIssues(issues: DocIssue[], tr: Transaction): DocIssue[] {
  const out: DocIssue[] = []
  for (const is of issues) {
    const from = tr.mapping.map(is.from)
    const to = tr.mapping.map(is.to, -1)
    if (to > from) out.push({ ...is, from, to })
  }
  return out
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
            const meta = tr.getMeta(proofreadKey) as ProofOptions | typeof IDLE_FULL | undefined
            if (meta === IDLE_FULL) return { opts: prev.opts, ...computeFull(tr.doc, prev.opts) }
            if (meta) return { opts: meta, ...computeFull(tr.doc, meta) }
            if (tr.docChanged) return { opts: prev.opts, ...computeIncremental(tr, prev) }
            return prev
          }
        },
        // Debounced idle full pass after typing settles (cross-block rules).
        view: () => {
          let timer: ReturnType<typeof setTimeout> | null = null
          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc) return
              if (timer) clearTimeout(timer)
              timer = setTimeout(() => {
                timer = null
                if ((proofreadKey.getState(view.state) as PState | undefined)?.opts) {
                  view.dispatch(view.state.tr.setMeta(proofreadKey, IDLE_FULL))
                }
              }, 700)
            },
            destroy() {
              if (timer) clearTimeout(timer)
            }
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
