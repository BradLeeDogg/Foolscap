/**
 * Structural undo — a small command stack for operations ProseMirror can't
 * cover: binder moves/renames/trash, synopsis/notes/label/status/metadata
 * edits, corkboard ordering. Each mutation pushes its inverse; Ctrl+Z (outside
 * a text field) pops it. Capped at 50; redo mirrors it.
 */
export interface UndoEntry {
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

const undoStack: UndoEntry[] = []
const redoStack: UndoEntry[] = []

export function pushUndo(entry: UndoEntry): void {
  undoStack.push(entry)
  if (undoStack.length > 50) undoStack.shift()
  redoStack.length = 0
}

/** Undo the most recent structural op; returns its label (null if empty). */
export async function undoLast(): Promise<string | null> {
  const e = undoStack.pop()
  if (!e) return null
  await e.undo()
  redoStack.push(e)
  return e.label
}

export async function redoLast(): Promise<string | null> {
  const e = redoStack.pop()
  if (!e) return null
  await e.redo()
  undoStack.push(e)
  return e.label
}

export function clearUndo(): void {
  undoStack.length = 0
  redoStack.length = 0
}
