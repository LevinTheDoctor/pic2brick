import { useMemo, useState } from 'react'
import { ApiError, createPreset, deletePreset, markPreset, type Preset, type PresetOrder } from '../api/client'

interface Props {
  presets: Preset[]
  /** ID des angewendeten Presets */
  active: string | null
  /** Einstellungen zum Speichern (ohne Titel und Foto-Geometrie) */
  settings: Record<string, string | number | boolean>
  onApply: (preset: Preset) => void
  /** Das angewendete Preset wurde gelöscht */
  onDeleted: (id: string) => void
  onRefresh: () => void
}

const ORDERS: { id: PresetOrder; label: string }[] = [
  { id: 'bewertung', label: 'Sterne' },
  { id: 'nutzung', label: 'Oft' },
  { id: 'name', label: 'A–Z' },
  { id: 'neu', label: 'Neu' },
]

/** Wie `GET /presets?sortierung=…`: Favoriten oben, dann nach Wahl. */
function sortPresets(list: Preset[], order: PresetOrder) {
  const by: Record<PresetOrder, (a: Preset, b: Preset) => number> = {
    bewertung: (a, b) => b.bewertung - a.bewertung || b.nutzungen - a.nutzungen,
    nutzung: (a, b) => b.nutzungen - a.nutzungen,
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
    neu: (a, b) => b.erstellt.localeCompare(a.erstellt),
  }
  return [...list].sort((a, b) => Number(b.favorit) - Number(a.favorit) || by[order](a, b) || a.name.localeCompare(b.name, 'de'))
}

function Stars({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  return (
    <span className="stars" role="radiogroup" aria-label="Bewertung">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
          data-on={n <= value || undefined}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2.6 2.2 4.6 5 .6-3.7 3.5 1 5L10 13.8l-4.5 2.5 1-5-3.7-3.5 5-.6z" /></svg>
        </button>
      ))}
    </span>
  )
}

/** Gespeicherte Einstellungen: anwenden, bewerten, speichern. */
export function PresetSection({ presets, active, settings, onApply, onDeleted, onRefresh }: Props) {
  const [order, setOrder] = useState<PresetOrder>('bewertung')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sorted = useMemo(() => sortPresets(presets, order), [presets, order])
  const empty = Object.keys(settings).length === 0

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
      onRefresh()
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Das hat nicht geklappt. Versuche es noch einmal.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!name.trim()) return
    const ok = await run(() =>
      createPreset({ name: name.trim(), beschreibung: '', einstellungen: settings, favorit: false, bewertung: 0 }),
    )
    if (ok) {
      setNaming(false)
      setName('')
    }
  }

  return (
    <details className="group" open={presets.length > 0 || undefined}>
      <summary>
        <span>Presets</span>
        {active && <span className="group__badge">{presets.find((p) => p.id === active)?.name ?? active}</span>}
      </summary>
      <div className="group__body">
        {sorted.length > 0 ? (
          <>
            {sorted.length > 2 && (
              <div className="mini-segmented mini-segmented--wide presets__order" role="group" aria-label="Sortierung">
                {ORDERS.map((o) => (
                  <button key={o.id} type="button" aria-pressed={order === o.id} onClick={() => setOrder(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <ul className="presets">
              {sorted.map((preset) => (
                <li key={preset.id} className="preset-row" aria-current={preset.id === active || undefined}>
                  <button type="button" className="preset-row__apply" onClick={() => onApply(preset)} title="Einstellungen übernehmen">
                    <span className="preset-row__name">{preset.name}</span>
                    <span className="preset-row__meta">
                      {Object.keys(preset.einstellungen).length === 1 ? '1 Einstellung' : `${Object.keys(preset.einstellungen).length} Einstellungen`}
                      {preset.nutzungen > 0 && `, ${preset.nutzungen}× benutzt`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button preset-row__fav"
                    aria-pressed={preset.favorit}
                    aria-label={preset.favorit ? 'Kein Favorit mehr' : 'Als Favorit markieren'}
                    onClick={() => void run(() => markPreset(preset.id, { favorit: !preset.favorit }))}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16.5s-6.5-3.8-6.5-8.4A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 6.5 2.1c0 4.6-6.5 8.4-6.5 8.4Z" /></svg>
                  </button>
                  <button
                    type="button"
                    className="icon-button preset-row__delete"
                    aria-label={`Preset „${preset.name}“ löschen`}
                    onClick={() => void run(() => deletePreset(preset.id).then(() => onDeleted(preset.id)))}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                  <Stars value={preset.bewertung} onChange={(stars) => void run(() => markPreset(preset.id, { bewertung: stars }))} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="section-note">Speichere Einstellungen, die dir gefallen, und nimm sie beim nächsten Foto wieder.</p>
        )}

        {naming ? (
          <div className="inline-save">
            <input
              type="text"
              autoFocus
              placeholder="Name, z. B. Comic klar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Enter speichert das Preset, nicht das Mosaik
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void save()
                }
                if (e.key === 'Escape') setNaming(false)
              }}
              aria-label="Name des Presets"
            />
            <button type="button" className="chip chip--strong" onClick={save} disabled={busy || !name.trim()}>
              Speichern
            </button>
            <button type="button" className="link-button" onClick={() => setNaming(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="chip presets__save"
            onClick={() => setNaming(true)}
            disabled={empty}
            title={empty ? 'Ändere zuerst eine Einstellung' : undefined}
          >
            Aktuelle Einstellungen speichern
          </button>
        )}
        {error && <p className="field__error" role="alert">{error}</p>}
      </div>
    </details>
  )
}
