import type { Format } from '../api/client'
import { studsToCm, valueLabel } from '../lib/labels'

interface Props {
  formats: Format[]
  plate: number
  /** Gewähltes Format oder null bei eigener Größe */
  selected: string | null
  custom: boolean
  size: { width: number; height: number }
  onFormat: (name: string) => void
  onCustom: (size: { width: number; height: number } | null) => void
}

/** Formate als kleine Plattenraster: man sieht sofort 3×3 gegenüber 4×2. */
export function FormatPicker({ formats, plate, selected, custom, size, onFormat, onCustom }: Props) {
  const largest = Math.max(...formats.flatMap((f) => [f.platten_breite, f.platten_hoehe]), 1)

  return (
    <div className="formats">
      <div className="formats__grid" role="radiogroup" aria-label="Format">
        {formats.map((format) => {
          const cell = Math.min(10, 44 / largest)
          const active = !custom && selected === format.name
          return (
            <button
              key={format.name}
              type="button"
              role="radio"
              aria-checked={active}
              className="format"
              title={format.beschreibung}
              onClick={() => onFormat(format.name)}
            >
              <span
                className="format__plates"
                style={{
                  gridTemplateColumns: `repeat(${format.platten_breite}, ${cell}px)`,
                  gridAutoRows: `${cell}px`,
                }}
                aria-hidden="true"
              >
                {Array.from({ length: format.platten_breite * format.platten_hoehe }, (_, i) => (
                  <span key={i} />
                ))}
              </span>
              <span className="format__name">{valueLabel('format', format.name)}</span>
              <span className="format__size">
                {format.platten_breite * plate} × {format.platten_hoehe * plate}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          className="format format--custom"
          onClick={() => onCustom(custom ? null : size)}
        >
          <span className="format__plates format__plates--custom" aria-hidden="true">
            <svg viewBox="0 0 44 44"><path d="M8 36V8h28" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" /><path d="M20 20h16v16H20z" fill="currentColor" opacity=".35" /></svg>
          </span>
          <span className="format__name">Eigene Größe</span>
          <span className="format__size">in Noppen</span>
        </button>
      </div>

      {custom && (
        <div className="custom-size">
          <label className="field field--inline">
            <span className="field__label">Breite</span>
            <input
              type="number"
              min={8}
              max={384}
              value={size.width}
              onChange={(e) => onCustom({ ...size, width: Number(e.target.value) })}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label className="field field--inline">
            <span className="field__label">Höhe</span>
            <input
              type="number"
              min={8}
              max={384}
              value={size.height}
              onChange={(e) => onCustom({ ...size, height: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <p className="formats__note">
        {size.width} × {size.height} Noppen ergeben {studsToCm(size.width)} × {studsToCm(size.height)} cm.
      </p>
    </div>
  )
}
