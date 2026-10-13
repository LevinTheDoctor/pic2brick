import { useId, useMemo, useState } from 'react'
import type { Color } from '../api/client'
import { isLight } from '../lib/colors'

interface Props {
  label: string
  colors: Color[]
  /** Rebrickable-ID oder null für den Standard */
  value: number | null
  changed: boolean
  defaultLabel: string
  onChange: (id: number | null) => void
}

const hue = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 0.12) return -1 + max // Grautöne zuerst, von dunkel nach hell
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/** Farbwahl aus dem Katalog (Uni-Farben), aufklappbar. */
export function ColorSwatchPicker({ label, colors, value, changed, defaultLabel, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const solid = useMemo(
    () => colors.filter((c) => c.kategorie === 'solid').sort((a, b) => hue(a.hex) - hue(b.hex)),
    [colors],
  )
  const current = colors.find((c) => c.id === value)

  return (
    <div className="field">
      <span className="field__label" id={id}>
        {label}
        {changed && <span className="changed-dot" title="Geändert" />}
      </span>
      <button type="button" className="swatch-button" aria-expanded={open} aria-labelledby={id} onClick={() => setOpen(!open)}>
        <span className="swatch" style={{ background: current?.hex ?? 'transparent' }} data-empty={!current || undefined} />
        <span>{current ? (current.lego_name ?? current.name) : defaultLabel}</span>
      </button>
      {open && (
        <div className="swatches" role="listbox" aria-labelledby={id}>
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className="swatches__default"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            {defaultLabel}
          </button>
          {solid.map((color) => (
            <button
              key={color.id}
              type="button"
              role="option"
              aria-selected={color.id === value}
              className="swatch swatch--pick"
              data-light={isLight(color.hex) || undefined}
              style={{ background: color.hex }}
              title={color.lego_name ?? color.name}
              aria-label={color.lego_name ?? color.name}
              onClick={() => {
                onChange(color.id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
