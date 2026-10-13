import { useEffect, useState, type ComponentPropsWithoutRef, type ElementType } from 'react'

type GlassProps<T extends ElementType> = {
  as?: T
  variant?: 'sheet' | 'clear'
} & ComponentPropsWithoutRef<T>

/** Fläche aus flüssigem Glas. `clear` für schwebende Steuerelemente, `sheet` für Inhaltsflächen. */
export function Glass<T extends ElementType = 'div'>({ as, variant = 'sheet', className = '', ...rest }: GlassProps<T>) {
  const Tag = (as ?? 'div') as ElementType
  return <Tag className={`glass glass--${variant} ${className}`} {...rest} />
}

/**
 * Verschiebungskarte für die Lichtbrechung am Rand: Rot = x-, Grün = y-Verschiebung.
 * Innen neutral (128), zum Rand hin wird der Hintergrund nach innen gezogen.
 */
function displacementMap(size = 256, band = 0.16) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const dx = u < band ? (band - u) / band : u > 1 - band ? -(u - (1 - band)) / band : 0
      const dy = v < band ? (band - v) / band : v > 1 - band ? -(v - (1 - band)) / band : 0
      const i = (y * size + x) * 4
      image.data[i] = 128 + Math.sign(dx) * Math.pow(Math.abs(dx), 2) * 127
      image.data[i + 1] = 128 + Math.sign(dy) * Math.pow(Math.abs(dy), 2) * 127
      image.data[i + 2] = 128
      image.data[i + 3] = 255
    }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

const isChromium = () => {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => b.brand === 'Chromium')
}

/** SVG-Filter für die Lichtbrechung; aktiv nur in Chromium (backdrop-filter mit url()). */
export function GlassFilter() {
  const [map] = useState(() => (isChromium() ? displacementMap() : null))

  useEffect(() => {
    if (!map) return
    document.documentElement.classList.add('refract')
    return () => document.documentElement.classList.remove('refract')
  }, [map])

  if (!map) return null
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter
        id="liquid-refract"
        x="0"
        y="0"
        width="1"
        height="1"
        filterUnits="objectBoundingBox"
        primitiveUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={map} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="0.08" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
