import { useRef, useState } from 'react'
import type { RecentMosaic } from '../lib/history'
import { studsToCm } from '../lib/labels'
import { BACKEND_REPO, FRONTEND_REPO } from '../lib/links'
import { Glass } from './Glass'
import { PolaroidArt } from './PolaroidArt'

interface Props {
  onFile: (file: File) => void
  recent: RecentMosaic[]
  onOpen: (id: string) => void
  onForget: (id: string) => void
  onDemo?: () => void
  dragging: boolean
}

export function DropZone({ onFile, recent, onOpen, onForget, onDemo, dragging }: Props) {
  const input = useRef<HTMLInputElement>(null)
  // Das Beispiel liegt nur lokal in backend-docs/ (nicht im Repo); fehlt es, Karte ausblenden
  const [demoFound, setDemoFound] = useState(true)
  const showDemo = !!onDemo && demoFound

  return (
    <div className="welcome">
      <Glass className={`dropzone${dragging ? ' is-dragging' : ''}`} onClick={() => input.current?.click()}>
        <div className="dropzone__copy">
          <h1 className="dropzone__title">Aus deinem Foto wird ein Mosaik zum Nachbauen</h1>
          <p className="dropzone__text">
            Zieh ein Foto hierher oder wähle eines aus. JPG oder PNG, höchstens 20&nbsp;MB.
          </p>
          <button
            type="button"
            className="action-button"
            onClick={(e) => {
              e.stopPropagation()
              input.current?.click()
            }}
          >
            Foto auswählen
          </button>
        </div>
        <PolaroidArt caption={dragging ? 'Loslassen!' : 'dein-foto.jpg'} complete={dragging} />
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
      </Glass>

      {(recent.length > 0 || showDemo) && (
        <section className="recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Zuletzt gebaut</h2>
          <ul className="recent__list">
            {recent.map((item) => (
              <li key={item.id} className="recent__item">
                <button type="button" className="recent__open" onClick={() => onOpen(item.id)}>
                  {item.preview ? (
                    <img src={item.preview} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  ) : (
                    <span className="recent__placeholder" />
                  )}
                  <span className="recent__title">{item.title}</span>
                  <span className="recent__meta">
                    {item.width} × {item.height} Noppen, {studsToCm(item.width)} cm breit
                  </span>
                </button>
                <button type="button" className="recent__forget" onClick={() => onForget(item.id)} aria-label={`${item.title} aus der Liste entfernen`}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
              </li>
            ))}
            {showDemo && (
              <li className="recent__item">
                <button type="button" className="recent__open" onClick={onDemo}>
                  <img
                    src="/backend-docs/2026-10-12_234947_Comic/vorschau.png"
                    alt=""
                    onError={() => setDemoFound(false)}
                  />
                  <span className="recent__title">Beispiel ansehen</span>
                  <span className="recent__meta">Comic, 48 × 48 Noppen, ohne Server</span>
                </button>
              </li>
            )}
          </ul>
        </section>
      )}

      <footer className="welcome__source">
        Quellcode auf GitHub:{' '}
        <a href={FRONTEND_REPO} target="_blank" rel="noreferrer">
          Pic2Brick
        </a>{' '}
        (Frontend) und{' '}
        <a href={BACKEND_REPO} target="_blank" rel="noreferrer">
          lego-mosaik
        </a>{' '}
        (Backend)
      </footer>
    </div>
  )
}
