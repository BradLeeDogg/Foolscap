/**
 * Screenplay element model — shared by the editor extension, the compile
 * exporters, and the self-test. No editor/DOM dependencies live here so the
 * cycling/“what comes next” logic and the export style table can be reused and
 * unit-tested in the main process.
 */
export type ScreenplayElement =
  | 'scene'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'

export const SCREENPLAY_ELEMENTS: ScreenplayElement[] = [
  'scene',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition'
]

export const SCREENPLAY_LABELS: Record<ScreenplayElement, string> = {
  scene: 'Scene',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Paren.',
  transition: 'Transition'
}

/** Tab cycles forward through the element types; Shift-Tab backward. */
export function cycleElement(current: ScreenplayElement | null, dir: 1 | -1 = 1): ScreenplayElement {
  const i = current ? SCREENPLAY_ELEMENTS.indexOf(current) : -1
  const n = SCREENPLAY_ELEMENTS.length
  return SCREENPLAY_ELEMENTS[(i + dir + n) % n]!
}

/** Pressing Enter from one element begins the element that conventionally follows. */
export function enterElement(current: ScreenplayElement | null): ScreenplayElement {
  switch (current) {
    case 'scene':
      return 'action'
    case 'character':
      return 'dialogue'
    case 'parenthetical':
      return 'dialogue'
    case 'dialogue':
      return 'action'
    case 'transition':
      return 'scene'
    default:
      return 'action'
  }
}

export interface ScreenplayStyle {
  leftIn: number
  rightIn: number
  align: 'left' | 'right'
  upper: boolean
  bold: boolean
  italic: boolean
}

/** Single source of truth for element layout — drives the editor CSS and every
 *  export format, so the screen and the page agree. (Approx. US spec margins.) */
export const SCREENPLAY_STYLES: Record<ScreenplayElement, ScreenplayStyle> = {
  scene: { leftIn: 0, rightIn: 0, align: 'left', upper: true, bold: true, italic: false },
  action: { leftIn: 0, rightIn: 0, align: 'left', upper: false, bold: false, italic: false },
  character: { leftIn: 2.0, rightIn: 0, align: 'left', upper: true, bold: false, italic: false },
  dialogue: { leftIn: 1.0, rightIn: 1.5, align: 'left', upper: false, bold: false, italic: false },
  parenthetical: { leftIn: 1.5, rightIn: 2.0, align: 'left', upper: false, bold: false, italic: true },
  transition: { leftIn: 0, rightIn: 0, align: 'right', upper: true, bold: false, italic: false }
}

export function isScreenplayElement(x: unknown): x is ScreenplayElement {
  return typeof x === 'string' && x in SCREENPLAY_STYLES
}
