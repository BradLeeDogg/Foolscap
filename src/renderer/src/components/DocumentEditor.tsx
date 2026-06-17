import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import type { JSONContent } from '@tiptap/core'
import type { ManuscriptDefaults } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'
import { useStore } from '../store/useStore'
import { Comment } from '../editor/comment'
import { Footnote } from '../editor/footnote'
import { listComments, listFootnotes } from '../editor/annotations'
import { playKeyClick } from '../lib/typewriter'
import AnnotationsPanel from './AnnotationsPanel'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

function countWords(text: string): number {
  const t = text.trim()
  return t ? (t.match(/\S+/g)?.length ?? 0) : 0
}

export function paperStyle(m: ManuscriptDefaults): React.CSSProperties {
  const pageWidthIn = m.pageSize === 'a4' ? 8.27 : 8.5
  return {
    ['--ms-font' as string]: `'${m.fontFamily}', Times, serif`,
    ['--ms-size' as string]: `${m.fontSizePt}pt`,
    ['--ms-line' as string]: String(m.lineSpacing),
    ['--ms-page-width' as string]: `${pageWidthIn}in`,
    ['--ms-margin' as string]: `${m.marginInches}in`
  }
}

interface Props {
  docId: string
  /** The active editor reports counts + save state to the global topbar. */
  active?: boolean
  /** Keep the caret line vertically centered (composition mode). */
  typewriter?: boolean
  /** Hide the in-pane Notes toggle (e.g. inside Scrivenings sections). */
  hideNotes?: boolean
  /** Render inline (no own scroll container) for stacking in Scrivenings. */
  embedded?: boolean
  /** Called with this document's word count on load and on every edit. */
  onWords?: (n: number) => void
}

/**
 * A self-contained manuscript editor bound to one document id. Owns its own
 * load + debounced atomic autosave + word counting, so it can be used singly,
 * in split view, stacked in Scrivenings, or full-screen in composition mode.
 */
export default function DocumentEditor({
  docId,
  active,
  typewriter,
  hideNotes,
  embedded,
  onWords
}: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const setSaveState = useStore((s) => s.setSaveState)
  const setDocWordCount = useStore((s) => s.setDocWordCount)
  const setSelectionWordCount = useStore((s) => s.setSelectionWordCount)
  const setItemWordCount = useStore((s) => s.setItemWordCount)

  const [showAnnot, setShowAnnot] = useState(false)
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const debounceMs = meta?.settings.autosaveDebounceMs ?? 800

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      CharacterCount,
      Comment,
      Footnote,
      Placeholder.configure({ placeholder: 'Begin writing…' })
    ],
    content: EMPTY_DOC,
    editorProps: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          // Subtle keystroke sound when enabled (typing characters only).
          if (event.key.length === 1 && useStore.getState().meta?.settings.typewriterSound) {
            playKeyClick()
          }
          return false
        }
      }
    },
    onUpdate: ({ editor }) => {
      dirtyRef.current = true
      const words = editor.storage.characterCount.words()
      onWords?.(words)
      if (active) {
        setDocWordCount(words)
        setSaveState('saving')
      }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void save(), debounceMs)
      centerCaret()
    },
    onSelectionUpdate: ({ editor }) => {
      if (active) {
        const { from, to } = editor.state.selection
        setSelectionWordCount(
          from === to ? 0 : countWords(editor.state.doc.textBetween(from, to, ' '))
        )
      }
      centerCaret()
    }
  })

  const centerCaret = (): void => {
    if (!typewriter || !editor || !scrollRef.current) return
    requestAnimationFrame(() => {
      const container = scrollRef.current
      if (!editor || !container) return
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = container.getBoundingClientRect()
      const caretY = coords.top - rect.top + container.scrollTop
      container.scrollTo({ top: caretY - rect.height / 2, behavior: 'auto' })
    })
  }

  const save = async (): Promise<void> => {
    if (!editor) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    try {
      const res = await window.api.document.write(docId, {
        version: DOCUMENT_CONTENT_VERSION,
        doc: editor.getJSON() as never
      })
      dirtyRef.current = false
      setItemWordCount(docId, res.wordCount) // keep project/session totals live
      if (active) {
        setSaveState('saved', res.savedAt)
        setDocWordCount(res.wordCount)
      }
    } catch {
      if (active) setSaveState('error')
    }
  }

  // Load on docId change; flush any pending save of the previous doc first.
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    window.api.document.read(docId).then((content) => {
      if (cancelled) return
      editor.commands.setContent((content?.doc as JSONContent) ?? EMPTY_DOC, false)
      dirtyRef.current = false
      const words = editor.storage.characterCount.words()
      onWords?.(words)
      if (active) {
        setDocWordCount(words)
        setSaveState('saved')
      }
      centerCaret()
    })
    return () => {
      cancelled = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (dirtyRef.current) void save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, editor])

  const addComment = (): void => {
    if (!editor || editor.state.selection.empty) return
    const text = window.prompt('Comment on the selected text:')
    if (text && text.trim()) editor.chain().focus().setComment(text.trim()).run()
  }
  const addFootnote = (): void => {
    if (!editor) return
    const to = editor.state.selection.to
    const text = window.prompt('Footnote text:')
    if (text == null) return
    editor.chain().focus().setTextSelection(to).insertFootnote(text.trim()).run()
  }

  const annotCount = editor ? listComments(editor).length + listFootnotes(editor).length : 0
  const style = meta ? paperStyle(meta.settings.manuscript) : undefined

  const bubble = editor && (
    <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="bubble">
      <button className={editor.isActive('bold') ? 'on' : ''} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </button>
      <button className={editor.isActive('italic') ? 'on' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </button>
      <button className={editor.isActive('underline') ? 'on' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <span className="bubble-sep" />
      <button onClick={addComment} title="Comment on selection">❝</button>
      <button onClick={addFootnote} title="Footnote">†</button>
    </BubbleMenu>
  )

  if (embedded) {
    return (
      <div className="editor-embedded">
        {bubble}
        <div className="paper paper-embedded" style={style}>
          <EditorContent editor={editor} className="manuscript" />
        </div>
      </div>
    )
  }

  return (
    <div className="editor-pane">
      {bubble}
      {!hideNotes && (
        <button className="annot-toggle" onClick={() => setShowAnnot((v) => !v)}>
          Notes{annotCount ? ` · ${annotCount}` : ''}
        </button>
      )}
      <div className="editor-stage">
        <div className={`editor-scroll ${typewriter ? 'typewriter' : ''}`} ref={scrollRef}>
          <div className="paper" style={style}>
            <EditorContent editor={editor} className="manuscript" />
          </div>
        </div>
        {showAnnot && editor && <AnnotationsPanel editor={editor} onClose={() => setShowAnnot(false)} />}
      </div>
    </div>
  )
}
