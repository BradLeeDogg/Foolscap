import { type DB, getMetaValue, setMetaValue } from './db'
import type { CardRect } from '@shared/api'

export type { CardRect }

/** Per-item corkboard layout, keyed by binder item id. */
export type CorkLayout = Record<string, CardRect>

const KEY = 'corkboard.layout'

export function getCorkLayout(db: DB): CorkLayout {
  const raw = getMetaValue(db, KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as CorkLayout
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Save one card's rect; returns the full updated layout. */
export function setCorkRect(db: DB, id: string, rect: CardRect): CorkLayout {
  const layout = getCorkLayout(db)
  layout[id] = {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    w: Math.max(120, Math.round(rect.w)),
    h: Math.max(96, Math.round(rect.h))
  }
  setMetaValue(db, KEY, JSON.stringify(layout))
  return layout
}
