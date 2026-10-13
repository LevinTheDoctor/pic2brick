import { useEffect, useState } from 'react'
import { Glass } from './Glass'

/** Hinweis während der Server baut. Es gibt keine Fortschrittsanzeige, nur die verstrichene Zeit. */
export function BuildingOverlay({ startedAt, withGuide, onCancel }: { startedAt: number; withGuide: boolean; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <Glass variant="clear" className="building" role="status" aria-live="polite">
      <span className="building__bricks" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="building__text">
        <strong>Mosaik wird gebaut</strong>
        <span>
          {time} {withGuide ? 'Mit Bauanleitung dauert es meist ein bis zwei Minuten.' : 'Das dauert nur wenige Sekunden.'}
        </span>
      </span>
      <button type="button" className="chip" onClick={onCancel}>
        Abbrechen
      </button>
    </Glass>
  )
}
