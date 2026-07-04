import type { Editor } from '@tiptap/react'

export interface CommentEntry {
  id: string
  text: string
  quote: string
}

export interface FootnoteEntry {
  id: string
  content: string
  index: number
}

/** All comments in the document, with the text they annotate. */
export function listComments(editor: Editor): CommentEntry[] {
  const map = new Map<string, CommentEntry>()
  editor.state.doc.descendants((node) => {
    if (!node.isText) return
    const mark = node.marks.find((m) => m.type.name === 'comment')
    if (!mark) return
    const id = mark.attrs.id as string
    const entry = map.get(id)
    if (entry) entry.quote += node.text ?? ''
    else map.set(id, { id, text: (mark.attrs.text as string) ?? '', quote: node.text ?? '' })
  })
  return [...map.values()]
}

export function updateComment(editor: Editor, id: string, text: string): void {
  const { state, view } = editor
  const markType = state.schema.marks.comment
  if (!markType) return
  const tr = state.tr
  // Mark edits are length-preserving, so old-doc positions stay valid in this tr.
  state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = node.marks.find((m) => m.type.name === 'comment' && m.attrs.id === id)
    if (!mark) return
    const from = pos
    const to = pos + node.nodeSize
    tr.removeMark(from, to, markType)
    tr.addMark(from, to, markType.create({ id, text }))
  })
  if (tr.docChanged) view.dispatch(tr)
}

export function removeComment(editor: Editor, id: string): void {
  const { state, view } = editor
  const markType = state.schema.marks.comment
  if (!markType) return
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = node.marks.find((m) => m.type.name === 'comment' && m.attrs.id === id)
    if (mark) tr.removeMark(pos, pos + node.nodeSize, markType)
  })
  if (tr.docChanged) view.dispatch(tr)
}

/** Select the first range/node carrying the given comment/footnote id. */
export function selectComment(editor: Editor, id: string): void {
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, pos) => {
    if (from !== -1 || !node.isText) return
    if (node.marks.some((m) => m.type.name === 'comment' && m.attrs.id === id)) {
      from = pos
      to = pos + node.nodeSize
    }
  })
  if (from !== -1) editor.chain().focus().setTextSelection({ from, to }).run()
}

export function listFootnotes(editor: Editor): FootnoteEntry[] {
  const out: FootnoteEntry[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnote') {
      out.push({ id: node.attrs.id as string, content: (node.attrs.content as string) ?? '', index: out.length + 1 })
    }
  })
  return out
}

export function updateFootnote(editor: Editor, id: string, content: string): void {
  const { state, view } = editor
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnote' && node.attrs.id === id) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, content })
    }
  })
  if (tr.docChanged) view.dispatch(tr)
}

export function removeFootnote(editor: Editor, id: string): void {
  const { state, view } = editor
  const targets: Array<[number, number]> = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnote' && node.attrs.id === id) targets.push([pos, pos + node.nodeSize])
  })
  if (!targets.length) return
  const tr = state.tr
  // Delete back-to-front so earlier positions remain valid.
  for (const [from, to] of targets.reverse()) tr.delete(from, to)
  if (tr.docChanged) view.dispatch(tr)
}
