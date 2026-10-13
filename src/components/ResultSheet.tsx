import { useMemo, useState } from 'react'
import { ApiError, createPalette, presetFromMosaic } from '../api/client'
import { isLight } from '../lib/colors'
import { number, studsToCm } from '../lib/labels'
import type { LoadedMosaic } from '../lib/mosaic'
import { PriceSection } from './PriceSection'

interface Props {
  mosaic: LoadedMosaic
  focus: number | null
  onFocus: (code: number | null) => void
  /** Bei bearbeiteten Mosaiken: die Version davor öffnen */
  onPrevious: (() => void) | null
  onSaved: () => void
}

/** Einstellungen oder Farben dieses Mosaiks speichern. */
function SaveAs({ mosaic, onSaved }: { mosaic: LoadedMosaic; onSaved: () => void }) {
  const [kind, setKind] = useState<'preset' | 'palette' | null>(null)
  const [name, setName] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!kind || !name.trim()) return
    setBusy(true)
    try {
      if (kind === 'preset') await presetFromMosaic(mosaic.id, name.trim())
      else
        await createPalette({ name: name.trim(), beschreibung: `Aus „${mosaic.result.titel}“`, farb_ids: mosaic.result.palette.map((c) => c.id) })
      setMessage({ ok: true, text: kind === 'preset' ? `Preset „${name.trim()}“ gespeichert.` : `Palette „${name.trim()}“ gespeichert.` })
      setKind(null)
      setName('')
      onSaved()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : 'Das hat nicht geklappt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="result__section" aria-labelledby="save-title">
      <h3 id="save-title">Wiederverwenden</h3>
      <p className="section-note">Für das nächste Foto: dieselben Einstellungen oder nur diese Farben.</p>
      {kind ? (
        <div className="inline-save">
          <input
            type="text"
            autoFocus
            placeholder={kind === 'preset' ? 'Name des Presets' : 'Name der Palette'}
            aria-label={kind === 'preset' ? 'Name des Presets' : 'Name der Palette'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') setKind(null)
            }}
          />
          <button type="button" className="chip chip--strong" onClick={save} disabled={busy || !name.trim()}>
            Speichern
          </button>
          <button type="button" className="link-button" onClick={() => setKind(null)}>
            Abbrechen
          </button>
        </div>
      ) : (
        <div className="chips">
          <button type="button" className="chip" onClick={() => { setKind('preset'); setName(mosaic.result.titel); setMessage(null) }}>
            Als Preset speichern
          </button>
          <button type="button" className="chip" onClick={() => { setKind('palette'); setName(`Farben ${mosaic.result.titel}`); setMessage(null) }}>
            Farben als Palette
          </button>
        </div>
      )}
      {message && <p className={message.ok ? 'section-note' : 'field__error'} role="status">{message.text}</p>}
    </section>
  )
}

const DOWNLOADS: { group: string; files: [string, string, string][] }[] = [
  {
    group: 'Teile bestellen',
    files: [
      ['teileliste_bricklink.xml', 'BrickLink', 'Wanted List zum Hochladen'],
      ['teileliste_lego.csv', 'LEGO Pick a Brick', 'Element-IDs'],
      ['teileliste_rebrickable.csv', 'Rebrickable', 'Import-Liste'],
    ],
  },
  {
    group: 'Bauen',
    files: [
      ['anleitung.pdf', 'Bauanleitung', 'PDF zum Drucken'],
      ['mosaik.ldr', '3D-Modell', 'Für BrickLink Studio'],
    ],
  },
  {
    group: 'Sonstiges',
    files: [
      ['teileliste.csv', 'Teileliste', 'Tabelle für Excel'],
      ['preise_bricklink.csv', 'Preise', 'Tabelle für Excel'],
      ['vorschau.png', 'Vorschaubild', 'PNG'],
    ],
  },
]

export function ResultSheet({ mosaic, focus, onFocus, onPrevious, onSaved }: Props) {
  const { result, parts, files } = mosaic
  const stats = result.statistik
  const [sort, setSort] = useState<'color' | 'count'>('color')
  const [showAll, setShowAll] = useState(false)

  const palette = useMemo(() => [...result.palette].sort((a, b) => b.noppen - a.noppen), [result.palette])
  const maxStuds = palette[0]?.noppen ?? 1
  const hexById = useMemo(() => new Map(result.palette.map((c) => [c.id, c.hex])), [result.palette])

  const rows = useMemo(() => {
    const list = [...parts]
    if (sort === 'count') list.sort((a, b) => b.count - a.count)
    else list.sort((a, b) => a.colorName.localeCompare(b.colorName) || b.count - a.count)
    return list
  }, [parts, sort])
  const visibleRows = showAll ? rows : rows.slice(0, 12)

  return (
    <div className="result">
      <header className="result__head">
        <h2 className="result__size">
          {stats.breite} × {stats.hoehe}
        </h2>
        <p className="result__size-note">
          Noppen, also {studsToCm(stats.breite)} × {studsToCm(stats.hoehe)} cm
        </p>
        {onPrevious && (
          <p className="result__version">
            Bearbeitete Version.{' '}
            <button type="button" className="link-button" onClick={onPrevious}>
              Vorherige Version öffnen
            </button>
          </p>
        )}
        <dl className="facts">
          <div><dt>Teile</dt><dd>{number(stats.teile)}</dd></div>
          <div><dt>Farben</dt><dd>{stats.farben}</dd></div>
          {stats.seiten > 0 && <div><dt>Seiten Anleitung</dt><dd>{stats.seiten}</dd></div>}
          <div><dt>Gespart ggü. 1×1</dt><dd>{number(stats.savings_percent, 0)} %</dd></div>
          {stats.formteile > 0 && <div><dt>Formteile</dt><dd>{number(stats.formteile)}</dd></div>}
          {stats.altfarben > 0 && <div><dt>Ältere Farben</dt><dd>{stats.altfarben}</dd></div>}
        </dl>
      </header>

      <PriceSection key={mosaic.id} mosaic={mosaic} />

      <section className="result__section" aria-labelledby="palette-title">
        <div className="section-head">
          <h3 id="palette-title">Farben</h3>
          {focus !== null && (
            <button type="button" className="link-button" onClick={() => onFocus(null)}>
              Alle zeigen
            </button>
          )}
        </div>
        <p className="section-note">Tippe eine Farbe an, um zu sehen, wo sie hinkommt.</p>
        <ul className="palette">
          {palette.map((color) => {
            const code = color.ldraw_code
            const active = code !== null && focus === code
            return (
              <li key={color.id}>
                <button
                  type="button"
                  className="palette__row"
                  aria-pressed={active}
                  disabled={code === null}
                  onClick={() => onFocus(active ? null : code)}
                >
                  <span
                    className="palette__swatch"
                    data-light={isLight(color.hex) || undefined}
                    style={{ background: color.hex }}
                  />
                  <span className="palette__name">{color.name}</span>
                  <span className="palette__bar" aria-hidden="true">
                    <span style={{ width: `${(color.noppen / maxStuds) * 100}%`, background: color.hex }} />
                  </span>
                  <span className="palette__count">{number(color.noppen)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {parts.length > 0 && (
        <section className="result__section" aria-labelledby="parts-title">
          <div className="section-head">
            <h3 id="parts-title">Teileliste</h3>
            <div className="mini-segmented" role="group" aria-label="Sortierung">
              <button type="button" aria-pressed={sort === 'color'} onClick={() => setSort('color')}>
                Nach Farbe
              </button>
              <button type="button" aria-pressed={sort === 'count'} onClick={() => setSort('count')}>
                Nach Menge
              </button>
            </div>
          </div>
          <table className="parts">
            <thead>
              <tr>
                <th scope="col">Teil</th>
                <th scope="col">Farbe</th>
                <th scope="col" className="num">Anzahl</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={`${row.partId}-${row.colorId}`}>
                  <td>
                    {row.name}
                    <span className="parts__id">{row.partId}</span>
                  </td>
                  <td>
                    <span className="parts__color">
                      <span className="dot" style={{ background: hexById.get(row.colorId) ?? 'transparent' }} />
                      {row.colorName}
                    </span>
                  </td>
                  <td className="num">{number(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 12 && (
            <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Weniger zeigen' : `Alle ${rows.length} Positionen zeigen`}
            </button>
          )}
        </section>
      )}

      {!mosaic.demo && <SaveAs mosaic={mosaic} onSaved={onSaved} />}

      <section className="result__section" aria-labelledby="files-title">
        <h3 id="files-title">Herunterladen</h3>
        {DOWNLOADS.map(({ group, files: list }) => {
          const available = list.filter(([name]) => files[name])
          if (available.length === 0) return null
          return (
            <div key={group} className="downloads">
              <h4>{group}</h4>
              <ul>
                {available.map(([name, label, note]) => (
                  <li key={name}>
                    <a className="download" href={files[name]} download={name}>
                      <span className="download__label">{label}</span>
                      <span className="download__note">{note}</span>
                      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4.5 16h11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>
    </div>
  )
}
