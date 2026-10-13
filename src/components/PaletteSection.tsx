import { useState } from 'react'
import type { Color, Palette } from '../api/client'
import { PaletteEditor } from './PaletteEditor'

interface Props {
  palettes: Palette[]
  catalog: Color[]
  /** ID der gewählten Palette */
  value: string | null
  onChange: (id: string | undefined) => void
  onRefresh: () => void
}

/** Eigene Farbpaletten: wählen, anlegen, ändern. Ohne Auswahl nimmt der Server alle passenden Farben. */
export function PaletteSection({ palettes, catalog, value, onChange, onRefresh }: Props) {
  const [editing, setEditing] = useState<Palette | 'new' | null>(null)

  const done = (saved: Palette | null) => {
    const removed = editing !== 'new' && editing && !saved
    setEditing(null)
    onRefresh()
    if (saved && editing === 'new') onChange(saved.id)
    if (removed && value === editing.id) onChange(undefined)
  }

  if (editing)
    return (
      <PaletteEditor
        key={editing === 'new' ? 'new' : editing.id}
        catalog={catalog}
        palette={editing === 'new' ? null : editing}
        onDone={done}
      />
    )

  return (
    <fieldset className="field">
      <legend className="field__label">
        Palette
        {value && <span className="changed-dot" title="Geändert" />}
      </legend>
      <ul className="palettes" role="radiogroup">
        <li>
          <button type="button" role="radio" aria-checked={!value} className="palette-choice" onClick={() => onChange(undefined)}>
            <span className="palette-choice__name">Automatisch</span>
            <span className="palette-choice__note">Alle Farben der gewählten Oberflächen</span>
          </button>
        </li>
        {palettes.map((palette) => (
          <li key={palette.id}>
            <button
              type="button"
              role="radio"
              aria-checked={value === palette.id}
              className="palette-choice"
              onClick={() => onChange(palette.id)}
            >
              <span className="palette-choice__name">{palette.name}</span>
              <span className="palette-choice__strip" aria-label={`${palette.farben.length} Farben`}>
                {palette.farben.slice(0, 24).map((c) => (
                  <span key={c.id} style={{ background: c.hex }} title={c.name} />
                ))}
              </span>
            </button>
            <button
              type="button"
              className="icon-button palette-choice__edit"
              onClick={() => setEditing(palette)}
              aria-label={`Palette „${palette.name}“ bearbeiten`}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16h3l8.5-8.5-3-3L4 13zM11.5 5.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="chip palettes__new" onClick={() => setEditing('new')} disabled={catalog.length === 0}>
        Neue Palette
      </button>
    </fieldset>
  )
}
