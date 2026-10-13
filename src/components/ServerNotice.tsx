import { useState } from 'react'
import { updateCatalog, type Health } from '../api/client'
import { Glass } from './Glass'

interface Props {
  status: 'checking' | 'ok' | 'offline'
  health: Health | null
  onRetry: () => void
}

/** Hinweis, wenn der Server fehlt oder der Teilekatalog veraltet ist. */
export function ServerNotice({ status, health, onRetry }: Props) {
  const [updating, setUpdating] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [dismissed, setDismissed] = useState(false)

  if (status === 'offline')
    return (
      <Glass variant="clear" className="notice" role="status">
        <span className="notice__text">
          <strong>Der Server läuft nicht.</strong> Starte ihn im Backend-Ordner mit <code>uv run lego-mosaik server</code>.
        </span>
        <button type="button" className="chip" onClick={onRetry}>
          Erneut prüfen
        </button>
      </Glass>
    )

  const outdated = health?.katalog.some((file) => file.veraltet)
  if (status !== 'ok' || !outdated || dismissed) return null

  const update = async () => {
    setUpdating('running')
    try {
      await updateCatalog()
      setUpdating('done')
      onRetry()
    } catch {
      setUpdating('failed')
    }
  }

  return (
    <Glass variant="clear" className="notice" role="status">
      <span className="notice__text">
        {updating === 'failed'
          ? 'Der Teilekatalog konnte nicht aktualisiert werden. Prüfe die Internetverbindung des Servers.'
          : 'Der Teilekatalog ist veraltet. Neue Teile und Farben fehlen vielleicht.'}
      </span>
      <button type="button" className="chip" onClick={update} disabled={updating === 'running'}>
        {updating === 'running' ? 'Wird aktualisiert …' : 'Katalog aktualisieren'}
      </button>
      <button type="button" className="icon-button" onClick={() => setDismissed(true)} aria-label="Hinweis schließen">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </Glass>
  )
}
