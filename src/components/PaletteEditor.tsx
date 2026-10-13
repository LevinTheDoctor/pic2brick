import { useMemo, useState } from 'react'
import { ApiError, createPalette, deletePalette, updatePalette, type Color, type Palette } from '../api/client'
import { isLight, sortByHue } from '../lib/colors'

interface Props {
  catalog: Color[]
  /** Bestehende Palette zum Bearbeiten, sonst neu */
  palette: Palette | null
  /** Vorauswahl für eine neue Palette */
  initial?: number[]
  onDone: (saved: Palette | null) => void
}

/** Palette anlegen oder ändern: Name und Farben aus dem Katalog. */
export function PaletteEditor({ catalog, palette, initial = [], onDone }: Props) {
  const [name, setName] = useState(palette?.name ?? '')
  const [picked, setPicked] = useState<Set<number>>(() => new Set(palette?.farb_ids ?? initial))
  const [special, setSpecial] = useState(() => (palette?.farb_ids ?? initial).some((id) => catalog.find((c) => c.id === id)?.kategorie !== 'solid'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const colors = useMemo(
    () => sortByHue(catalog.filter((c) => (special ? c.kategorie !== 'rubber' : c.kategorie === 'solid'))),
    [catalog, special],
  )

  const toggle = (id: number) =>
    setPicked((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = async (action: () => Promise<Palette | null>) => {
    setBusy(true)
    setError(null)
    try {
      onDone(await action())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Das hat nicht geklappt. Versuche es noch einmal.')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const input = { name: name.trim(), beschreibung: palette?.beschreibung ?? '', farb_ids: [...picked] }
    return run(() => (palette ? updatePalette(palette.id, input) : createPalette(input)))
  }

  return (
    <div className="palette-editor">
      <label className="field">
        <span className="field__label">Name der Palette</span>
        <input
          type="text"
          autoFocus
          placeholder="z. B. Graustufen"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
        />
      </label>
      <div className="field">
        <span className="field__row">
          <span className="field__label">Farben</span>
          <output className="field__value">{picked.size}</output>
        </span>
        <div className="swatches swatches--multi" role="group" aria-label="Farben der Palette">
          {colors.map((color) => (
            <button
              key={color.id}
              type="button"
              aria-pressed={picked.has(color.id)}
              className="swatch swatch--pick"
              data-light={isLight(color.hex) || undefined}
              style={{ background: color.hex }}
              title={color.lego_name ?? color.name}
              aria-label={color.lego_name ?? color.name}
              onClick={() => toggle(color.id)}
            />
          ))}
        </div>
        <label className="field--toggle palette-editor__special">
          <span className="field__hint">Auch Sonderfarben (Transparent, Metallic, …)</span>
          <input type="checkbox" role="switch" className="switch" checked={special} onChange={(e) => setSpecial(e.target.checked)} />
        </label>
      </div>
      {error && <p className="field__error" role="alert">{error}</p>}
      <div className="palette-editor__actions">
        {palette && (
          <button type="button" className="link-button" onClick={() => run(() => deletePalette(palette.id).then(() => null))} disabled={busy}>
            Löschen
          </button>
        )}
        <span />
        <button type="button" className="link-button" onClick={() => onDone(palette)}>
          Abbrechen
        </button>
        <button type="button" className="chip chip--strong" onClick={save} disabled={busy || !name.trim() || picked.size < 2}>
          {palette ? 'Speichern' : 'Anlegen'}
        </button>
      </div>
    </div>
  )
}
