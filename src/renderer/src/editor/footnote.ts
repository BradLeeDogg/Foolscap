import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** Insert a footnote marker at the cursor carrying `content`. */
      insertFootnote: (content: string) => ReturnType
    }
  }
}

function uuid(): string {
  return window.crypto?.randomUUID?.() ?? `f-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Footnote/endnote as an inline atom. The note text lives in the node's attrs
 * (lossless in the document JSON). The visible marker is auto-numbered by a CSS
 * counter in document order, so reordering text renumbers automatically.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-footnote-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-footnote-id': attrs.id } : {})
      },
      content: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-footnote-content') ?? '',
        renderHTML: (attrs) => ({ 'data-footnote-content': attrs.content, title: attrs.content })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'footnote' })]
  },

  addCommands() {
    return {
      insertFootnote:
        (content: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { id: uuid(), content } })
    }
  }
})
