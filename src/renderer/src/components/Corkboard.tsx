import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BinderItem } from '@shared/types'
import type { CardRect, LabelDef } from '@shared/api'
import { useStore } from '../store/useStore'
import { childrenOf } from '../lib/tree'
import { pushUndo } from '../lib/undo'

interface Props {
  folderId: string
}

type BoardMode = 'grid' | 'freeform'
type Layout = Record<string, CardRect>

const CARD_W = 240
const CARD_H = 176
const GAP = 20
const COLS = 4

/** A starting slot for a freeform card that has no saved position yet. */
function defaultRect(i: number): CardRect {
  return {
    x: GAP + (i % COLS) * (CARD_W + GAP),
    y: GAP + Math.floor(i / COLS) * (CARD_H + GAP),
    w: CARD_W,
    h: CARD_H
  }
}

const modeKey = (folderId: string): string => `wp-cork-mode:${folderId}`

/**
 * Index cards for a folder's children, in two modes:
 *  - Grid (default): card order IS binder order — dragging reorders the
 *    manuscript (and compile), exactly like the outliner.
 *  - Freeform: pin cards anywhere and resize them; positions persist but are
 *    explicitly decorative (they never change manuscript order).
 * A header carries the folder's own synopsis, plus a button to add cards.
 */
export default function Corkboard({ folderId }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const labels = useStore((s) => s.labels)
  const setTree = useStore((s) => s.setTree)
  const patchItem = useStore((s) => s.patchItem)
  const folder = useMemo(() => tree.find((t) => t.id === folderId), [tree, folderId])
  const cards = useMemo(() => childrenOf(tree, folderId), [tree, folderId])

  const [mode, setMode] = useState<BoardMode>(
    () => (localStorage.getItem(modeKey(folderId)) as BoardMode) || 'grid'
  )
  useEffect(() => {
    setMode((localStorage.getItem(modeKey(folderId)) as BoardMode) || 'grid')
  }, [folderId])
  const changeMode = (m: BoardMode): void => {
    setMode(m)
    try {
      localStorage.setItem(modeKey(folderId), m)
    } catch {
      /* keep in-memory choice */
    }
  }

  const addCard = async (): Promise<void> => {
    const { tree: next } = await window.api.binder.create({
      type: 'document',
      title: 'Untitled',
      parentId: folderId
    })
    setTree(next)
  }

  return (
    <div className="corkboard">
      {folder && (
        <div className="corkboard-head">
          <textarea
            key={folder.id}
            className="corkboard-synopsis"
            defaultValue={folder.synopsis}
            placeholder={`Synopsis for “${folder.title}”…`}
            onBlur={(e) => {
              const old = folder.synopsis
              const next = e.target.value
              if (old === next) return
              void window.api.binder.updateSynopsis(folder.id, next)
              patchItem(folder.id, { synopsis: next })
              pushUndo({
                label: `Synopsis of “${folder.title}”`,
                undo: () => {
                  void window.api.binder.updateSynopsis(folder.id, old)
                  patchItem(folder.id, { synopsis: old })
                },
                redo: () => {
                  void window.api.binder.updateSynopsis(folder.id, next)
                  patchItem(folder.id, { synopsis: next })
                }
              })
            }}
          />
          <div className="cork-controls">
            <div className="cork-mode" role="group" aria-label="Corkboard mode">
              <button
                className={mode === 'grid' ? 'on' : ''}
                title="Card order is manuscript order — drag to reorder the binder"
                onClick={() => changeMode('grid')}
              >
                Grid
              </button>
              <button
                className={mode === 'freeform' ? 'on' : ''}
                title="Pin cards anywhere (positions don’t change manuscript order)"
                onClick={() => changeMode('freeform')}
              >
                Freeform
              </button>
            </div>
            <button className="cork-add" onClick={addCard} title="Add a new card to this folder">
              ＋ Add card
            </button>
          </div>
        </div>
      )}

      {mode === 'freeform' && (
        <p className="muted cork-note">Freeform: positions don’t change manuscript order.</p>
      )}

      {cards.length === 0 ? (
        <div className="editor-empty">
          <p>No cards yet.</p>
          <p className="muted">Use “＋ Add card” to start outlining this folder.</p>
        </div>
      ) : mode === 'grid' ? (
        <GridBoard folderId={folderId} cards={cards} labels={labels} />
      ) : (
        <FreeBoard cards={cards} labels={labels} />
      )}
    </div>
  )
}

// --- Grid (ordered) mode ------------------------------------------------------

function GridBoard({
  folderId,
  cards,
  labels
}: {
  folderId: string
  cards: BinderItem[]
  labels: LabelDef[]
}): JSX.Element {
  const setTree = useStore((s) => s.setTree)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = async ({ active, over }: DragEndEvent): Promise<void> => {
    if (!over || active.id === over.id) return
    const id = String(active.id)
    const ids = cards.map((c) => c.id)
    const oldIndex = ids.indexOf(id)
    const newIndex = arrayMove(ids, oldIndex, ids.indexOf(String(over.id))).indexOf(id)
    const title = cards[oldIndex]?.title ?? 'card'
    setTree(await window.api.binder.move({ id, newParentId: folderId, newIndex }))
    pushUndo({
      label: `Reorder “${title}”`,
      undo: async () =>
        setTree(await window.api.binder.move({ id, newParentId: folderId, newIndex: oldIndex })),
      redo: async () =>
        setTree(await window.api.binder.move({ id, newParentId: folderId, newIndex }))
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div className="corkboard-grid">
          {cards.map((card) => (
            <GridCard key={card.id} item={card} labels={labels} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function GridCard({ item, labels }: { item: BinderItem; labels: LabelDef[] }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  })
  const statusColor = labels.find((l) => l.kind === 'status' && l.id === item.statusId)?.color
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderTopColor: statusColor ?? 'var(--rule-strong)'
  }
  return (
    <div ref={setNodeRef} style={style} className="card">
      <CardBody item={item} labels={labels} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  )
}

// --- Freeform (pinned) mode ----------------------------------------------------

function FreeBoard({ cards, labels }: { cards: BinderItem[]; labels: LabelDef[] }): JSX.Element {
  const [layout, setLayout] = useState<Layout>({})
  useEffect(() => {
    void window.api.corkboard.getLayout().then(setLayout)
  }, [])

  const rects = useMemo(() => {
    const out: Layout = {}
    cards.forEach((c, i) => {
      out[c.id] = layout[c.id] ?? defaultRect(i)
    })
    return out
  }, [cards, layout])

  const persist = (id: string, rect: CardRect): void => {
    setLayout((prev) => ({ ...prev, [id]: rect }))
    void window.api.corkboard.setRect(id, rect)
  }

  const canvas = useMemo(() => {
    let w = 640
    let h = 320
    for (const c of cards) {
      const r = rects[c.id]
      if (r) {
        w = Math.max(w, r.x + r.w + GAP)
        h = Math.max(h, r.y + r.h + GAP)
      }
    }
    return { w, h }
  }, [cards, rects])

  return (
    <div className="corkboard-canvas" style={{ width: canvas.w, height: canvas.h }}>
      {cards.map((card) => (
        <FreeCard
          key={card.id}
          item={card}
          labels={labels}
          rect={rects[card.id]!}
          onChange={(r) => persist(card.id, r)}
        />
      ))}
    </div>
  )
}

function FreeCard({
  item,
  labels,
  rect,
  onChange
}: {
  item: BinderItem
  labels: LabelDef[]
  rect: CardRect
  onChange: (rect: CardRect) => void
}): JSX.Element {
  const [pos, setPos] = useState({ x: rect.x, y: rect.y })
  const [size, setSize] = useState({ w: rect.w, h: rect.h })
  const ref = useRef<HTMLDivElement>(null)

  const posRef = useRef(pos)
  posRef.current = pos
  const sizeRef = useRef(size)
  sizeRef.current = size
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => setPos({ x: rect.x, y: rect.y }), [rect.x, rect.y])
  useEffect(() => setSize({ w: rect.w, h: rect.h }), [rect.w, rect.h])

  // Persist size when the card is resized (native CSS resize handle).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let first = true
    let timer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false
        return
      }
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w === sizeRef.current.w && h === sizeRef.current.h) return
      setSize({ w, h })
      clearTimeout(timer)
      timer = setTimeout(() => onChangeRef.current({ ...posRef.current, w, h }), 300)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(timer)
    }
  }, [])

  const onGrabPointerDown = (e: React.PointerEvent): void => {
    const target = e.target as HTMLElement
    if (target.closest('.card-title, .card-title-input, button, select, textarea')) return
    e.preventDefault()
    const start = { mx: e.clientX, my: e.clientY, ox: posRef.current.x, oy: posRef.current.y }
    const move = (ev: PointerEvent): void => {
      setPos({
        x: Math.max(0, start.ox + (ev.clientX - start.mx)),
        y: Math.max(0, start.oy + (ev.clientY - start.my))
      })
    }
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const next = {
        x: Math.max(0, start.ox + (ev.clientX - start.mx)),
        y: Math.max(0, start.oy + (ev.clientY - start.my))
      }
      onChange({ ...next, w: sizeRef.current.w, h: sizeRef.current.h })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const statusColor = labels.find((l) => l.kind === 'status' && l.id === item.statusId)?.color

  return (
    <div
      ref={ref}
      className="card card-free"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        borderTopColor: statusColor ?? 'var(--rule-strong)'
      }}
    >
      <CardBody item={item} labels={labels} onHeaderPointerDown={onGrabPointerDown} />
    </div>
  )
}

// --- Shared card body -----------------------------------------------------------

function CardBody({
  item,
  labels,
  dragHandle,
  onHeaderPointerDown
}: {
  item: BinderItem
  labels: LabelDef[]
  dragHandle?: Record<string, unknown>
  onHeaderPointerDown?: (e: React.PointerEvent) => void
}): JSX.Element {
  const select = useStore((s) => s.select)
  const patchItem = useStore((s) => s.patchItem)
  const [editing, setEditing] = useState(false)

  const statuses = labels.filter((l) => l.kind === 'status')
  const labelDefs = labels.filter((l) => l.kind === 'label')
  const labelColor = labelDefs.find((l) => l.id === item.labelId)?.color

  const commitTitle = (value: string): void => {
    setEditing(false)
    const title = value.trim()
    if (!title || title === item.title) return
    const old = item.title
    void window.api.binder.rename(item.id, title)
    patchItem(item.id, { title })
    pushUndo({
      label: `Rename “${old}”`,
      undo: () => {
        void window.api.binder.rename(item.id, old)
        patchItem(item.id, { title: old })
      },
      redo: () => {
        void window.api.binder.rename(item.id, title)
        patchItem(item.id, { title })
      }
    })
  }

  const edit = (
    label: string,
    apply: (v: string | null) => void,
    oldValue: string | null,
    newValue: string | null
  ): void => {
    if (oldValue === newValue) return
    apply(newValue)
    pushUndo({ label, undo: () => apply(oldValue), redo: () => apply(newValue) })
  }

  return (
    <>
      <div className="card-grab" onPointerDown={onHeaderPointerDown} title="Drag to move">
        <span className="card-icon" {...(dragHandle ?? {})}>
          {item.type === 'folder' ? '📁' : '📄'}
        </span>
        {editing ? (
          <input
            autoFocus
            className="card-title-input"
            defaultValue={item.title}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="card-title"
            title="Click to open · double-click to rename"
            onClick={() => select(item.id)}
            onDoubleClick={() => setEditing(true)}
          >
            {item.title}
          </span>
        )}
        {labelColor && <span className="card-label-dot" style={{ background: labelColor }} />}
      </div>
      <textarea
        className="card-synopsis"
        defaultValue={item.synopsis}
        placeholder="Synopsis…"
        onBlur={(e) =>
          edit(
            `Synopsis of “${item.title}”`,
            (v) => {
              void window.api.binder.updateSynopsis(item.id, v ?? '')
              patchItem(item.id, { synopsis: v ?? '' })
            },
            item.synopsis,
            e.target.value
          )
        }
      />
      <div className="card-footer">
        <select
          aria-label="Status"
          value={item.statusId ?? ''}
          onChange={(e) =>
            edit(
              `Status of “${item.title}”`,
              (v) => {
                void window.api.binder.setStatus(item.id, v)
                patchItem(item.id, { statusId: v })
              },
              item.statusId,
              e.target.value || null
            )
          }
        >
          <option value="">No status</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Label"
          value={item.labelId ?? ''}
          onChange={(e) =>
            edit(
              `Label of “${item.title}”`,
              (v) => {
                void window.api.binder.setLabel(item.id, v)
                patchItem(item.id, { labelId: v })
              },
              item.labelId,
              e.target.value || null
            )
          }
        >
          <option value="">No label</option>
          {labelDefs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
