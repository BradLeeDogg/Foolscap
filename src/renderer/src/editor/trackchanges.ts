import { Extension, Mark } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { ProseMirrorNode } from '@shared/types'
import { acceptAllChanges, hasTrackedChanges, rejectAllChanges } from '@shared/trackchanges'

/** Text added while suggesting. Rendered underlined/green. */
export const Insertion = Mark.create({
  name: 'insertion',
  inclusive: true,
  parseHTML() {
    return [{ tag: 'ins[data-tc]' }]
  },
  renderHTML() {
    return ['ins', { 'data-tc': 'ins', class: 'tc-ins' }, 0]
  }
})

/** Text struck out while suggesting (not yet removed). Rendered struck/red. */
export const Deletion = Mark.create({
  name: 'deletion',
  inclusive: true,
  parseHTML() {
    return [{ tag: 'del[data-tc]' }]
  },
  renderHTML() {
    return ['del', { 'data-tc': 'del', class: 'tc-del' }, 0]
  }
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    trackChanges: {
      /** Turn suggesting on/off (records edits as insertion/deletion marks). */
      setSuggesting: (on: boolean) => ReturnType
      acceptAllChanges: () => ReturnType
      rejectAllChanges: () => ReturnType
    }
  }
}

export interface TrackChangesStorage {
  enabled: boolean
}

/**
 * Suggesting mode. While enabled, typed/pasted text is wrapped in an `insertion`
 * mark and deletions strike text out with a `deletion` mark instead of removing
 * it — so nothing is lost until a change is explicitly accepted or rejected. All
 * interception is gated on `storage.enabled`, so ordinary editing is untouched
 * when suggesting is off. Accept/reject reuse the shared, tested transforms.
 */
export const TrackChanges = Extension.create<Record<string, never>, TrackChangesStorage>({
  name: 'trackChanges',

  addStorage() {
    return { enabled: false }
  },

  addCommands() {
    return {
      setSuggesting:
        (on: boolean) =>
        () => {
          this.storage.enabled = on
          return true
        },
      acceptAllChanges:
        () =>
        ({ editor, commands }) =>
          commands.setContent(
            acceptAllChanges(editor.getJSON() as unknown as ProseMirrorNode) as never,
            true
          ),
      rejectAllChanges:
        () =>
        ({ editor, commands }) =>
          commands.setContent(
            rejectAllChanges(editor.getJSON() as unknown as ProseMirrorNode) as never,
            true
          )
    }
  },

  addProseMirrorPlugins() {
    const ext = this
    return [
      new Plugin({
        key: new PluginKey('trackChanges'),
        props: {
          handleTextInput(view, from, to, text) {
            if (!ext.storage.enabled) return false
            const { state } = view
            const ins = state.schema.marks.insertion
            const del = state.schema.marks.deletion
            if (!ins || !del) return false
            const tr = state.tr
            if (from !== to) tr.addMark(from, to, del.create()) // strike what was selected
            const at = to
            tr.insertText(text, at, at)
            tr.addMark(at, at + text.length, ins.create())
            tr.setSelection(TextSelection.create(tr.doc, at + text.length))
            tr.setMeta('trackChanges', true)
            view.dispatch(tr)
            return true
          },
          handleKeyDown(view, event) {
            if (!ext.storage.enabled) return false
            if (event.key !== 'Backspace' && event.key !== 'Delete') return false
            const { state } = view
            const del = state.schema.marks.deletion
            if (!del) return false
            const sel = state.selection
            const tr = state.tr
            if (!sel.empty) {
              tr.addMark(sel.from, sel.to, del.create())
              tr.setSelection(TextSelection.create(tr.doc, sel.to))
            } else if (event.key === 'Backspace') {
              if (sel.$from.parentOffset === 0) return false // let blocks merge normally
              tr.addMark(sel.from - 1, sel.from, del.create())
              tr.setSelection(TextSelection.create(tr.doc, sel.from - 1))
            } else {
              if (sel.$from.parentOffset === sel.$from.parent.content.size) return false
              tr.addMark(sel.from, sel.from + 1, del.create())
            }
            tr.setMeta('trackChanges', true)
            view.dispatch(tr)
            return true
          },
          handlePaste(view, _event, slice) {
            if (!ext.storage.enabled) return false
            const { state } = view
            const ins = state.schema.marks.insertion
            const del = state.schema.marks.deletion
            if (!ins) return false
            const sel = state.selection
            const tr = state.tr
            if (!sel.empty && del) tr.addMark(sel.from, sel.to, del.create())
            const at = sel.to
            tr.replaceWith(at, at, slice.content)
            tr.addMark(at, at + slice.content.size, ins.create())
            tr.setSelection(TextSelection.create(tr.doc, at + slice.content.size))
            tr.setMeta('trackChanges', true)
            view.dispatch(tr)
            return true
          }
        }
      })
    ]
  }
})

export { hasTrackedChanges }
