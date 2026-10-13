import type { CSSProperties } from 'react'
import type { Color, FieldOption, Options } from '../api/client'
import { asList, computeSize, conflicts, effective, type Value, type Values } from '../lib/form'
import {
  BASE_STYLES,
  FIELD_HINTS,
  SHAPE_STYLES,
  STYLE_HINTS,
  fieldLabel,
  number,
  valueLabel,
} from '../lib/labels'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { FormatPicker } from './FormatPicker'

interface Props {
  options: Options
  catalog: Color[] | null
  values: Values
  onChange: (field: string, value: Value | undefined) => void
  onReplace: (values: Values) => void
  aspect: number
  fileName: string
  building: boolean
  onBuild: () => void
}

const GROUPS: { title: string; fields: string[]; open?: boolean }[] = [
  { title: 'Größe', fields: ['plattengroesse', 'modus'], open: true },
  { title: 'Stil', fields: ['stil', 'teile', 'relief', 'relief_hoehe'], open: true },
  { title: 'Farben', fields: ['kontrast', 'saettigung', 'farbkategorien', 'exotische_farben', 'max_farben', 'dithering', 'staerke'] },
  { title: 'Rahmen', fields: ['rahmen', 'rahmenfarbe', 'eckenfarbe', 'rahmen_teile', 'rahmen_erhoehung'] },
  { title: 'Unterbau', fields: ['unterbau', 'unterbaufarbe'] },
  { title: 'Erweitert', fields: ['farbabstand', 'aufraeumen', 'zerlegung', 'ausgaben'] },
]
/** Felder mit eigener Darstellung */
const SPECIAL = new Set(['format', 'platten', 'breite', 'hoehe', 'titel'])
const COLOR_FIELDS = new Set(['rahmenfarbe', 'eckenfarbe', 'unterbaufarbe'])
const SLIDERS: Record<string, [number, number, number]> = {
  kontrast: [0, 2, 0.05],
  saettigung: [0, 2, 0.05],
  staerke: [0, 1, 0.05],
  rahmen: [0, 4, 1],
  rahmen_erhoehung: [0, 3, 1],
  relief_hoehe: [1, 3, 1],
  max_farben: [0, 60, 1],
}
const BOOLEAN_FIELDS = new Set(['exotische_farben', 'aufraeumen'])

function StyleIcon({ style }: { style: string }) {
  const cells = [0, 1, 2]
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true" className="style-icon">
      {cells.flatMap((y) =>
        cells.map((x) => {
          const [cx, cy] = [5 + x * 10, 5 + y * 10]
          const key = `${x}-${y}`
          if (style === 'punkte') return <circle key={key} cx={cx} cy={cy} r="4.4" />
          if (style === 'noppen') return <circle key={key} cx={cx} cy={cy} r="3" />
          if (style === 'formen' && x + y === 2) return <path key={key} d={`M${cx - 4.5} ${cy + 4.5}L${cx + 4.5} ${cy - 4.5}V${cy + 4.5}Z`} />
          if (style === 'formen' && x + y > 2) return <rect key={key} x={cx - 4.5} y={cy - 4.5} width="9" height="9" rx="1" />
          if (style === 'formen') return null
          return <rect key={key} x={cx - 4.5} y={cy - 4.5} width="9" height="9" rx="1" />
        }),
      )}
    </svg>
  )
}

export function SettingsSheet({ options, catalog, values, onChange, onReplace, aspect, fileName, building, onBuild }: Props) {
  const get = (field: string) => effective(options, values, field)
  const size = computeSize(options, values, aspect)
  const custom = 'breite' in values || 'hoehe' in values
  const plate = Number(get('plattengroesse') ?? 16) || 16
  const problems = conflicts(options, values)
  const style = String(get('stil') ?? '')
  const base = String(get('unterbau') ?? '')

  // Gewähltes Format: explizit oder passend zu den Standard-Platten
  const [pw, ph] = String(get('platten') ?? '3x3').split(/x/i).map(Number)
  const selectedFormat =
    (values.format as string | undefined) ??
    options.formate.find((f) => f.platten_breite === pw && f.platten_hoehe === ph)?.name ??
    null

  const setFormat = (name: string) => {
    const next: Values = { ...values, format: name }
    delete next.platten
    delete next.breite
    delete next.hoehe
    onReplace(next)
  }
  const setCustom = (custom: { width: number; height: number } | null) => {
    const next = { ...values }
    delete next.format
    delete next.platten
    if (custom) {
      next.breite = Math.min(Math.max(Math.round(custom.width) || 8, 8), 384)
      next.hoehe = Math.min(Math.max(Math.round(custom.height) || 8, 8), 384)
    } else {
      delete next.breite
      delete next.hoehe
    }
    onReplace(next)
  }

  const disabledReason = (field: string, value: string): string | null => {
    if (field === 'stil' && BASE_STYLES.includes(value) && base === 'ohne') return 'Braucht einen Unterbau'
    if (field === 'unterbau' && value === 'ohne' && BASE_STYLES.includes(style)) return 'Passt nicht zum Stil'
    if ((field === 'teile') && value === 'brick' && SHAPE_STYLES.includes(style)) return 'Nur mit Stil Quadrate'
    return null
  }

  const visible = (field: string) => {
    if (!options.felder[field]) return false
    if (field === 'relief_hoehe') return get('relief') !== 'ohne'
    if (field === 'staerke') return get('dithering') !== 'nearest'
    if (field === 'eckenfarbe' || field === 'rahmen_teile' || field === 'rahmen_erhoehung' || field === 'rahmenfarbe')
      return Number(get('rahmen') ?? 1) > 0
    if (field === 'farbkategorien') return !get('exotische_farben')
    return true
  }

  const known = new Set([...GROUPS.flatMap((g) => g.fields), ...SPECIAL])
  const extra = Object.keys(options.felder).filter((f) => !known.has(f))
  const groups = GROUPS.map((g) => (g.title === 'Erweitert' ? { ...g, fields: [...g.fields, ...extra] } : g))

  const renderField = (field: string, option: FieldOption) => {
    const value = get(field)
    const changed = field in values
    const label = fieldLabel(field)
    const hint = FIELD_HINTS[field]
    const reset = changed && (
      <button type="button" className="link-button field__reset" onClick={() => onChange(field, undefined)}>
        Zurücksetzen
      </button>
    )
    const head = (
      <span className="field__label">
        {label}
        {changed && <span className="changed-dot" title="Geändert" />}
        {reset}
      </span>
    )

    if (COLOR_FIELDS.has(field))
      return (
        <ColorSwatchPicker
          key={field}
          label={label}
          colors={catalog ?? []}
          value={typeof value === 'number' ? value : null}
          changed={changed}
          defaultLabel={field === 'eckenfarbe' ? 'Wie der Rahmen' : 'Passend zum Unterbau'}
          onChange={(id) => onChange(field, id ?? undefined)}
        />
      )

    if (option.mehrfach) {
      const selected = asList(value)
      return (
        <fieldset key={field} className="field">
          <legend className="field__label">{head}</legend>
          <div className="chips">
            {option.werte.map((raw) => {
              const v = String(raw)
              const reason = disabledReason(field, v)
              const on = selected.includes(v)
              return (
                <button
                  key={v}
                  type="button"
                  className="chip chip--toggle"
                  aria-pressed={on}
                  disabled={!!reason && !on}
                  title={reason ?? undefined}
                  onClick={() => onChange(field, on ? selected.filter((s) => s !== v) : [...selected, v])}
                >
                  {valueLabel(field, v)}
                </button>
              )
            })}
          </div>
          {hint && <span className="field__hint">{hint}</span>}
        </fieldset>
      )
    }

    if (field === 'stil')
      return (
        <fieldset key={field} className="field">
          <legend className="field__label">{head}</legend>
          <div className="styles" role="radiogroup">
            {option.werte.map((raw) => {
              const v = String(raw)
              const reason = disabledReason(field, v)
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={value === v}
                  className="style-option"
                  disabled={!!reason}
                  onClick={() => onChange(field, v)}
                >
                  <StyleIcon style={v} />
                  <span className="style-option__name">{valueLabel(field, v)}</span>
                  <span className="style-option__hint">{reason ?? STYLE_HINTS[v] ?? ''}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )

    if (option.werte.length > 0) {
      const short = option.werte.length <= 4 && option.werte.every((w) => valueLabel(field, w).length <= 14)
      if (short)
        return (
          <fieldset key={field} className="field">
            <legend className="field__label">{head}</legend>
            <div className="mini-segmented mini-segmented--wide" role="radiogroup">
              {option.werte.map((raw) => {
                const reason = disabledReason(field, String(raw))
                return (
                  <button
                    key={String(raw)}
                    type="button"
                    role="radio"
                    aria-checked={String(value) === String(raw)}
                    disabled={!!reason}
                    title={reason ?? undefined}
                    onClick={() => onChange(field, raw)}
                  >
                    {valueLabel(field, raw)}
                  </button>
                )
              })}
            </div>
            {hint && <span className="field__hint">{hint}</span>}
          </fieldset>
        )
      return (
        <label key={field} className="field">
          {head}
          <select
            value={String(value ?? '')}
            onChange={(e) => {
              const raw = option.werte.find((w) => String(w) === e.target.value)
              onChange(field, raw ?? e.target.value)
            }}
          >
            {option.werte.map((raw) => (
              <option key={String(raw)} value={String(raw)} disabled={!!disabledReason(field, String(raw))}>
                {valueLabel(field, raw)}
              </option>
            ))}
          </select>
          {hint && <span className="field__hint">{hint}</span>}
        </label>
      )
    }

    if (BOOLEAN_FIELDS.has(field) || typeof option.standard === 'boolean')
      return (
        <label key={field} className="field field--toggle">
          <span className="field__text">
            {head}
            {hint && <span className="field__hint">{hint}</span>}
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={Boolean(value)}
            onChange={(e) => onChange(field, e.target.checked)}
          />
        </label>
      )

    const slider = SLIDERS[field]
    if (slider || (option.minimum !== null && option.maximum !== null)) {
      const [min, max, step] = slider ?? [option.minimum ?? 0, option.maximum ?? 1, 0.05]
      const numeric = Number(value ?? min)
      const lo = Math.max(min, option.minimum ?? min)
      const hi = option.maximum !== null ? Math.min(max, option.maximum) : max
      return (
        <label key={field} className="field">
          <span className="field__row">
            {head}
            <output className="field__value">
              {field === 'max_farben' && numeric === 0 ? 'alle' : number(numeric, step < 1 ? 2 : 0)}
            </output>
          </span>
          <input
            type="range"
            min={lo}
            max={hi}
            step={step}
            value={numeric}
            style={{ '--progress': `${((numeric - lo) / (hi - lo || 1)) * 100}%` } as CSSProperties}
            onChange={(e) => onChange(field, Number(e.target.value))}
          />
          {hint && <span className="field__hint">{hint}</span>}
        </label>
      )
    }

    return (
      <label key={field} className="field">
        {head}
        <input
          type={typeof option.standard === 'number' ? 'number' : 'text'}
          value={value === null ? '' : String(value)}
          min={option.minimum ?? undefined}
          max={option.maximum ?? undefined}
          onChange={(e) =>
            onChange(field, e.target.value === '' ? undefined : typeof option.standard === 'number' ? Number(e.target.value) : e.target.value)
          }
        />
        {hint && <span className="field__hint">{hint}</span>}
      </label>
    )
  }

  const changedCount = Object.keys(values).length

  return (
    <form
      className="settings"
      onSubmit={(e) => {
        e.preventDefault()
        if (!building && problems.length === 0) onBuild()
      }}
    >
      <label className="field field--title">
        <span className="field__label">Titel auf dem Titelblatt</span>
        <input
          type="text"
          placeholder={fileName.replace(/\.[^.]+$/, '')}
          value={String(values.titel ?? '')}
          onChange={(e) => onChange('titel', e.target.value || undefined)}
        />
      </label>

      {groups.map((group) => {
        const fields = group.fields.filter(visible)
        const isSize = group.title === 'Größe'
        if (fields.length === 0 && !isSize) return null
        const changedHere = fields.filter((f) => f in values).length
        return (
          <details key={group.title} className="group" open={group.open}>
            <summary>
              <span>{group.title}</span>
              {changedHere > 0 && <span className="group__badge">{changedHere} geändert</span>}
            </summary>
            <div className="group__body">
              {isSize && (
                <FormatPicker
                  formats={options.formate}
                  plate={plate}
                  selected={selectedFormat}
                  custom={custom}
                  size={size}
                  onFormat={setFormat}
                  onCustom={setCustom}
                />
              )}
              {fields.map((f) => renderField(f, options.felder[f]))}
            </div>
          </details>
        )
      })}

      <div className="settings__footer">
        {problems.length > 0 && (
          <ul className="problems" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="settings__actions">
          {changedCount > 0 && (
            <button type="button" className="link-button" onClick={() => onReplace({})}>
              Alles zurücksetzen
            </button>
          )}
          <button type="submit" className="action-button" disabled={building || problems.length > 0}>
            {building ? 'Wird gebaut …' : 'Mosaik bauen'}
          </button>
        </div>
      </div>
    </form>
  )
}
