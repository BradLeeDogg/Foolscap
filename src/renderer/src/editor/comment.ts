import { Mark, mergeAttributes } from '@tiptap/core'

export interface CommentOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Wrap the current selection in a new comment carrying `text`. */
      setComment: (text: string) => ReturnType
    }
  }
}

function uuid(): string {
  return window.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Inline comment as a mark. The note text rides along inside the document JSON
 * (so it autosaves and round-trips losslessly) and surfaces on hover via title.
 */
export const Comment = Mark.create<CommentOptions>({
  name: 'comment',
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-comment-id': attrs.id } : {})
      },
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-comment-text') ?? '',
        renderHTML: (attrs) => ({ 'data-comment-text': attrs.text, title: attrs.text })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'comment' }), 0]
  },

  addCommands() {
    return {
      setComment:
        (text: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { id: uuid(), text })
    }
  }
})
