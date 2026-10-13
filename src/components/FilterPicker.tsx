import { useEffect, useState } from 'react'
import { previewImage } from '../api/client'
import { valueLabel } from '../lib/labels'

interface Props {
  file: File
  /** Drehen, Spiegeln und Ausschnitt, damit die Kacheln dasselbe Bild zeigen */
  geometry: Record<string, string>
  filters: string[]
  value: string
  onChange: (filter: string) => void
}

/** Farbfilter als Kacheln mit kleinem Vorschaubild vom Server. */
export function FilterPicker({ file, geometry, filters, value, onChange }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const key = JSON.stringify([geometry, filters])

  useEffect(() => {
    const controller = new AbortController()
    const urls: string[] = []
    const [base, list] = JSON.parse(key) as [Record<string, string>, string[]]
    const timer = window.setTimeout(() => {
      for (const filter of list)
        previewImage(file, { ...base, farbfilter: filter, groesse: '96' }, controller.signal)
          .then((blob) => {
            const url = URL.createObjectURL(blob)
            urls.push(url)
            setThumbs((old) => ({ ...old, [filter]: url }))
          })
          .catch(() => {
            // ohne Vorschaubild bleibt nur der Name
          })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [file, key])

  return (
    <div className="filters" role="radiogroup" aria-label="Farbfilter">
      {filters.map((filter) => (
        <button
          key={filter}
          type="button"
          role="radio"
          aria-checked={value === filter}
          className="filter-option"
          onClick={() => onChange(filter)}
        >
          <span className="filter-option__thumb">{thumbs[filter] && <img src={thumbs[filter]} alt="" />}</span>
          <span className="filter-option__name">{valueLabel('farbfilter', filter)}</span>
        </button>
      ))}
    </div>
  )
}
