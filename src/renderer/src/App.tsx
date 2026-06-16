import { useEffect, useState } from 'react'

// M0 placeholder: confirms React is mounted and the preload bridge is alive.
// Replaced by the real launcher + workspace in M1.
export default function App(): JSX.Element {
  const [bridge, setBridge] = useState<'checking' | 'ok' | 'unavailable'>('checking')

  useEffect(() => {
    let cancelled = false
    window.api
      ?.health()
      .then(() => !cancelled && setBridge('ok'))
      .catch(() => !cancelled && setBridge('unavailable'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="m0-splash">
      <h1>WProcessor</h1>
      <p className="m0-tagline">Nothing between you and the page.</p>
      <p className="m0-status" data-state={bridge}>
        {bridge === 'checking' && 'Starting…'}
        {bridge === 'ok' && 'Ready — scaffold online.'}
        {bridge === 'unavailable' && 'Bridge unavailable.'}
      </p>
    </div>
  )
}
