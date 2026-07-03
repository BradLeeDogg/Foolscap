import { useEffect, useRef, useState } from 'react'

/**
 * In-app replacements for window.prompt / window.confirm — styled like the
 * command palette, keyboard-first (Enter/Esc), non-blocking. Call the imperative
 * helpers from anywhere; <Sheets/> (mounted once in App) renders the active one.
 */
interface PromptReq {
  kind: 'prompt'
  title: string
  placeholder?: string
  initial?: string
  confirmLabel?: string
  resolve: (value: string | null) => void
}
interface ConfirmReq {
  kind: 'confirm'
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}
type Req = PromptReq | ConfirmReq

let emit: ((req: Req) => void) | null = null

export function promptSheet(opts: Omit<PromptReq, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => emit?.({ kind: 'prompt', ...opts, resolve }) ?? resolve(null))
}
export function confirmSheet(opts: Omit<ConfirmReq, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => emit?.({ kind: 'confirm', ...opts, resolve }) ?? resolve(false))
}

export default function Sheets(): JSX.Element | null {
  const [req, setReq] = useState<Req | null>(null)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emit = (r) => {
      setReq(r)
      if (r.kind === 'prompt') setValue(r.initial ?? '')
    }
    return () => {
      emit = null
    }
  }, [])
  useEffect(() => {
    if (req?.kind === 'prompt') inputRef.current?.focus()
  }, [req])

  if (!req) return null

  const close = (result: string | null | boolean): void => {
    if (req.kind === 'prompt') req.resolve(result as string | null)
    else req.resolve(result as boolean)
    setReq(null)
  }

  return (
    <div className="modal-backdrop" onClick={() => close(req.kind === 'prompt' ? null : false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="sheet-title">{req.title}</h3>
        {req.kind === 'prompt' ? (
          <input
            ref={inputRef}
            className="sheet-input"
            value={value}
            placeholder={req.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') close(value.trim() ? value.trim() : null)
              if (e.key === 'Escape') close(null)
            }}
          />
        ) : (
          req.body && <p className="sheet-body muted">{req.body}</p>
        )}
        <div className="sheet-actions">
          <button onClick={() => close(req.kind === 'prompt' ? null : false)}>Cancel</button>
          <button
            className={req.kind === 'confirm' && req.danger ? 'danger primary' : 'primary'}
            onClick={() => close(req.kind === 'prompt' ? (value.trim() ? value.trim() : null) : true)}
          >
            {req.confirmLabel ?? (req.kind === 'prompt' ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
