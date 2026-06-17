import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

/** ⌘/Ctrl-P palette: type to jump to any document or folder in the binder. */
export default function QuickOpen({ onClose }: { onClose: () => void }): JSX.Element {
  const tree = useStore((s) => s.tree)
  const select = useStore((s) => s.select)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const items = tree.map((t) => ({ id: t.id, title: t.title, type: t.type }))
    if (!query) return items.slice(0, 30)
    return items
      .map((it) => {
        const idx = it.title.toLowerCase().indexOf(query)
        return idx < 0 ? null : { it, score: (it.title.toLowerCase().startsWith(query) ? 0 : 1000) + idx }
      })
      .filter((x): x is { it: (typeof items)[number]; score: number } => x !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 30)
      .map((x) => x.it)
  }, [q, tree])

  useEffect(() => {
    setActive(0)
  }, [q])

  const choose = (id?: string): void => {
    const target = id ?? results[active]?.id
    if (target) select(target)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="modal-backdrop quickopen-backdrop" onClick={onClose}>
      <div className="quickopen" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quickopen-input"
          placeholder="Go to document or folder…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="quickopen-list">
          {results.map((r, i) => (
            <li
              key={r.id}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r.id)}
            >
              <span className="row-icon">{r.type === 'folder' ? '📁' : '📄'}</span>
              <span className="quickopen-title">{r.title}</span>
            </li>
          ))}
          {results.length === 0 && <li className="quickopen-empty muted">No matches</li>}
        </ul>
      </div>
    </div>
  )
}
