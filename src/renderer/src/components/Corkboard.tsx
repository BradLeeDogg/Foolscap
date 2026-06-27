import { useEffect, useMemo, useRef, useState } from 'react'
import type { BinderItem } from '@shared/types'
import type { CardRect, LabelDef } from '@shared/api'
import { useStore } from '../store/useStore'
import { childrenOf } from '../lib/tree'

interface Props {
  folderId: string
}

type Layout = Record<string, CardRect>

const CARD_W = 240
const CARD_H = 176
const GAP = 20
const COLS = 4

/** A starting grid slot for a card that has no saved position yet. */
function defaultRect(i: number): CardRect {
  return {
    x: GAP + (i % COLS) * (CARD_W + GAP),
    y: GAP + Math.floor(i / COLS) * (CARD_H + GAP),
    w: CARD_W,
    h: CARD_H
  }
}

/**
 * A freeform corkboard: every child of the folder is an index card the writer
 * can drag anywhere and resize to any size. Positions/sizes persist per card. A
 * header carries the folder's own synopsis, plus a button to pin new cards.
 */
export default function Corkboard({ folderId }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const labels = useStore((s) => s.labels)
  const setTree = useStore((s) => s.setTree)
  const patchItem = useStore((s) => s.patchItem)
  const folder = useMemo(() => tree.find((t) => t.id === folderId), [tree, folderId])
  const cards = useMemo(() => childrenOf(tree, folderId), [tree, folderId])

  const [layout, setLayout] = useState<Layout>({})
  useEffect(() => {
    void window.api.corkboard.getLayout().then(setLayout)
  }, [])

  // Resolve each card's rect: its saved layout, else a default grid slot.
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

  const addCard = async (): Promise<void> => {
    const { item, tree: next } = await window.api.binder.create({
      type: 'document',
      title: 'Untitled',
      parentId: folderId
    })
    setTree(next)
    persist(item.id, defaultRect(cards.length))
  }

  // Size the canvas to contain every card so it scrolls when cards spread out.
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
    <div className="corkboard">
      {folder && (
        <div className="corkboard-head">
          <textarea
            key={folder.id}
            className="corkboard-synopsis"
            defaultValue={folder.synopsis}
            placeholder={`Synopsis for “${folder.title}”…`}
            onBlur={(e) => {
              void window.api.binder.updateSynopsis(folder.id, e.target.value)
              patchItem(folder.id, { synopsis: e.target.value })
            }}
          />
          <button className="cork-add" onClick={addCard} title="Pin a new card to this corkboard">
            ＋ Add card
          </button>
        </div>
      )}

      <div className="corkboard-canvas" style={{ width: canvas.w, height: canvas.h }}>
        {cards.length === 0 && (
          <div className="cork-empty muted">No cards yet. Use “＋ Add card” to start outlining.</div>
        )}
        {cards.map((card) => (
          <Card
            key={card.id}
            item={card}
            labels={labels}
            rect={rects[card.id]!}
            onChange={(r) => persist(card.id, r)}
          />
        ))}
      </div>
    </div>
  )
}

function Card({
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
  const select = useStore((s) => s.select)
  const patchItem = useStore((s) => s.patchItem)
  const [editing, setEditing] = useState(false)
  const [pos, setPos] = useState({ x: rect.x, y: rect.y })
  const [size, setSize] = useState({ w: rect.w, h: rect.h })
  const ref = useRef<HTMLDivElement>(null)

  // Latest values for the resize observer (created once, must not go stale).
  const posRef = useRef(pos)
  posRef.current = pos
  const sizeRef = useRef(size)
  sizeRef.current = size
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Sync from props when the saved rect changes (e.g. layout loads).
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
    if (editing || target.closest('.card-title, .card-title-input')) return
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

  const commitTitle = (value: string): void => {
    setEditing(false)
    const title = value.trim()
    if (!title || title === item.title) return
    void window.api.binder.rename(item.id, title)
    patchItem(item.id, { title })
  }

  const statuses = labels.filter((l) => l.kind === 'status')
  const labelDefs = labels.filter((l) => l.kind === 'label')
  const statusColor = statuses.find((s) => s.id === item.statusId)?.color
  const labelColor = labelDefs.find((l) => l.id === item.labelId)?.color

  return (
    <div
      ref={ref}
      className="card"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        borderTopColor: statusColor ?? 'var(--rule-strong)'
      }}
    >
      <div className="card-grab" onPointerDown={onGrabPointerDown} title="Drag to move">
        <span className="card-icon">{item.type === 'folder' ? '📁' : '📄'}</span>
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
        onBlur={(e) => {
          void window.api.binder.updateSynopsis(item.id, e.target.value)
          patchItem(item.id, { synopsis: e.target.value })
        }}
      />
      <div className="card-footer">
        <select
          value={item.statusId ?? ''}
          onChange={(e) => {
            const v = e.target.value || null
            void window.api.binder.setStatus(item.id, v)
            patchItem(item.id, { statusId: v })
          }}
        >
          <option value="">No status</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={item.labelId ?? ''}
          onChange={(e) => {
            const v = e.target.value || null
            void window.api.binder.setLabel(item.id, v)
            patchItem(item.id, { labelId: v })
          }}
        >
          <option value="">No label</option>
          {labelDefs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
