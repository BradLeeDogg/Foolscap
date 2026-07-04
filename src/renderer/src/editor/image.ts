import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /** Insert a block image (data URL or path) at the cursor. */
      setImage: (attrs: { src: string; alt?: string }) => ReturnType
    }
  }
}

/**
 * Block image as an atom node. The src (a data URL) rides inside the document
 * JSON so figures travel with the draft and export without external files.
 */
export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute('src'),
        renderHTML: (attrs) => (attrs.src ? { src: attrs.src } : {})
      },
      alt: {
        default: '',
        parseHTML: (el) => el.getAttribute('alt') ?? '',
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'ms-image' })]
  },

  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs })
    }
  }
})
