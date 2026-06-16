import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'
import {
  listComments,
  listFootnotes,
  removeComment,
  removeFootnote,
  selectComment,
  updateComment,
  updateFootnote
} from '../editor/annotations'

interface Props {
  editor: Editor
  onClose: () => void
}

export default function AnnotationsPanel({ editor, onClose }: Props): JSX.Element {
  const [, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    editor.on('update', bump)
    editor.on('selectionUpdate', bump)
    return () => {
      editor.off('update', bump)
      editor.off('selectionUpdate', bump)
    }
  }, [editor])

  const comments = listComments(editor)
  const footnotes = listFootnotes(editor)

  return (
    <aside className="drawer annotations">
      <div className="drawer-head">
        <h3>Notes &amp; Footnotes</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="annot-section">
        <h4>Comments ({comments.length})</h4>
        {comments.length === 0 && <p className="muted annot-hint">Select text, then “Comment”.</p>}
        {comments.map((c) => (
          <div className="annot-card" key={c.id}>
            <blockquote className="annot-quote" onClick={() => selectComment(editor, c.id)}>
              {c.quote || '(no text)'}
            </blockquote>
            <textarea
              defaultValue={c.text}
              onBlur={(e) => updateComment(editor, c.id, e.target.value)}
            />
            <div className="annot-actions">
              <button onClick={() => selectComment(editor, c.id)}>Go to</button>
              <button className="danger" onClick={() => removeComment(editor, c.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="annot-section">
        <div className="annot-head-row">
          <h4>Footnotes ({footnotes.length})</h4>
          <button onClick={() => editor.chain().focus().insertFootnote('').run()}>＋ at cursor</button>
        </div>
        {footnotes.length === 0 && <p className="muted annot-hint">Add one at the cursor, then type its text.</p>}
        {footnotes.map((f) => (
          <div className="annot-card" key={f.id}>
            <span className="annot-index">[{f.index}]</span>
            <textarea
              defaultValue={f.content}
              onBlur={(e) => updateFootnote(editor, f.id, e.target.value)}
            />
            <div className="annot-actions">
              <button className="danger" onClick={() => removeFootnote(editor, f.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
