import { useEffect, useState } from 'react'
import { Glass } from './Glass'

interface Props {
  pages: string[]
  pdf?: string
}

/** Bauanleitung Seite für Seite, mit Pfeiltasten blätterbar. */
export function InstructionsViewer({ pages, pdf }: Props) {
  const [page, setPage] = useState(0)
  const last = pages.length - 1
  const go = (next: number) => setPage(Math.min(Math.max(next, 0), last))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return
      if (event.key === 'ArrowRight') setPage((p) => Math.min(p + 1, last))
      if (event.key === 'ArrowLeft') setPage((p) => Math.max(p - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  if (pages.length === 0)
    return (
      <div className="guide guide--empty">
        <p>Für dieses Mosaik gibt es keine Bauanleitung. Wähle beim nächsten Bauen unter „Dateien“ die Bauanleitung aus.</p>
      </div>
    )

  return (
    <div className="guide">
      <figure className="guide__page">
        <img src={pages[page]} alt={`Bauanleitung, Seite ${page + 1}`} />
      </figure>
      <Glass variant="clear" className="guide__bar">
        <button type="button" className="icon-button" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Vorherige Seite">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <label className="guide__counter">
          Seite
          <input
            type="number"
            min={1}
            max={pages.length}
            value={page + 1}
            onChange={(e) => go(Number(e.target.value) - 1)}
          />
          von {pages.length}
        </label>
        <button type="button" className="icon-button" onClick={() => go(page + 1)} disabled={page === last} aria-label="Nächste Seite">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {pdf && (
          <a className="chip" href={pdf} download>
            PDF laden
          </a>
        )}
      </Glass>
      <div className="guide__strip" aria-label="Alle Seiten">
        {pages.map((src, i) => (
          <button
            key={src}
            type="button"
            className="guide__thumb"
            aria-current={i === page}
            aria-label={`Seite ${i + 1}`}
            onClick={() => go(i)}
          >
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}
