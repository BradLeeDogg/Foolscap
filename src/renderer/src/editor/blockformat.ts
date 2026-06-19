import { Extension } from '@tiptap/core'

export type BlockAlign = 'left' | 'center' | 'right' | 'justify'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockFormat: {
      /** Align the current paragraph/heading (left clears the attribute). */
      setBlockAlign: (align: BlockAlign) => ReturnType
    }
  }
}

/**
 * Block-level formatting: per-paragraph alignment and a first-line-indent
 * opt-out, on paragraphs and headings. Powers centered titles and flush-left
 * heading blocks (the MLA/APA/Chicago examples) and the toolbar alignment
 * controls. Both attributes ride inside the document JSON, so they autosave,
 * round-trip losslessly, and carry through to Compile.
 */
export const BlockFormat = Extension.create({
  name: 'blockFormat',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          align: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.textAlign || null,
            renderHTML: (attrs) =>
              attrs.align ? { style: `text-align: ${attrs.align}` } : {}
          },
          noIndent: {
            default: false,
            parseHTML: (el) => (el as HTMLElement).getAttribute('data-no-indent') === 'true',
            renderHTML: (attrs) => (attrs.noIndent ? { 'data-no-indent': 'true' } : {})
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setBlockAlign:
        (align: BlockAlign) =>
        ({ chain }) => {
          const value = align === 'left' ? null : align
          return chain()
            .updateAttributes('paragraph', { align: value })
            .updateAttributes('heading', { align: value })
            .run()
        }
    }
  }
})
