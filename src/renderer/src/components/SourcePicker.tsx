import { useEffect, useRef, useState } from 'react'
import type { Source } from '@shared/types'
import { filterSources, sortSources } from './SourcesPanel'

/**
 * A keyboard-first source chooser: type to filter (title/author/year), arrow
 * to choose, Enter to link. Replaces a 200-option native <select> in the
 * fact-check panel.
 */
export default function SourcePicker({
  sources,
  exclude,
  onPick,
  placeholder = '+ link source…'
}: {
  sources: Source[]
  exclude: string[]
  onPick: (sourceId: string) => void
  placeholder?: string
}): JSX.Element {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const candidates = sortSources(
    filterSources(
      sources.filter((s) => !exclude.includes(s.id)),
      q
    ),
    q ? 'title' : 'recent'
  ).slice(0, 8)

  useEffect(() => setActive(0), [q, open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (id?: string): void => {
    const target = id ?? candidates[active]?.id
    if (!target) return
    onPick(target)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="src-picker" ref={rootRef}>
      <input
        value={q}
        placeholder={placeholder}
        aria-label="Link a source"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, candidates.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick()
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && candidates.length > 0 && (
        <ul className="src-picker-list" role="listbox">
          {candidates.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s.id)
              }}
            >
              <span className="src-picker-title">{s.title}</span>
              <span className="src-picker-sub muted">
                {[s.author, s.year, s.kind].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
