import { Extension } from '@tiptap/core'
import { cycleElement, enterElement, type ScreenplayElement } from '@shared/screenplay'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    screenplay: {
      /** Turn screenplay keymap/behavior on or off for this editor. */
      setScreenplayEnabled: (on: boolean) => ReturnType
      /** Tag the current paragraph as a screenplay element. */
      setScreenplayElement: (kind: ScreenplayElement) => ReturnType
      /** Cycle the current paragraph's element (Tab / Shift-Tab). */
      cycleScreenplayElement: (dir?: 1 | -1) => ReturnType
    }
  }
}

export interface ScreenplayStorage {
  enabled: boolean
}

/**
 * Screenplay support. Adds an `sp` attribute to paragraphs (the element kind),
 * commands to set/cycle it, and — only while enabled — a Tab/Enter keymap so the
 * script flows the way screenwriters expect (Tab cycles the element, Enter starts
 * the element that conventionally follows). The attribute rides inside the
 * document JSON, so it autosaves and round-trips losslessly.
 */
export const Screenplay = Extension.create<Record<string, never>, ScreenplayStorage>({
  name: 'screenplay',

  addStorage() {
    return { enabled: false }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          sp: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-sp'),
            renderHTML: (attrs) =>
              attrs.sp ? { 'data-sp': attrs.sp, class: `sp sp-${attrs.sp}` } : {}
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setScreenplayEnabled:
        (on: boolean) =>
        () => {
          this.storage.enabled = on
          return true
        },
      setScreenplayElement:
        (kind: ScreenplayElement) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { sp: kind }),
      cycleScreenplayElement:
        (dir: 1 | -1 = 1) =>
        ({ editor, commands }) => {
          const current = (editor.getAttributes('paragraph').sp as ScreenplayElement | null) ?? null
          return commands.updateAttributes('paragraph', { sp: cycleElement(current, dir) })
        }
    }
  },

  addKeyboardShortcuts() {
    const guard =
      (fn: () => boolean) =>
      (): boolean =>
        this.storage.enabled ? fn() : false
    return {
      Tab: guard(() => this.editor.commands.cycleScreenplayElement(1)),
      'Shift-Tab': guard(() => this.editor.commands.cycleScreenplayElement(-1)),
      Enter: guard(() => {
        const current =
          (this.editor.getAttributes('paragraph').sp as ScreenplayElement | null) ?? null
        const next = enterElement(current)
        return this.editor.chain().splitBlock().updateAttributes('paragraph', { sp: next }).run()
      })
    }
  }
})
