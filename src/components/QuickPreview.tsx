import { useEffect, useRef } from 'react'
import { drawStuds, quantize, type PreviewSettings } from '../lib/pixelate'

interface Props {
  image: ImageBitmap
  settings: PreviewSettings
  building: boolean
}

/** Schnellvorschau des Fotos als Noppenraster – reagiert sofort auf Größe, Ausschnitt und Farben. */
export function QuickPreview({ image, settings, building }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(settings)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const cells = quantize(image, settings)
      drawStuds(canvas, cells, settings.width, settings.height)
    })
    return () => cancelAnimationFrame(frame)
    // settings wird über key verglichen
  }, [image, key]) // oxlint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className={`quick-preview${building ? ' is-building' : ''}`}>
      <div className="quick-preview__frame">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Schnellvorschau mit ${settings.width} × ${settings.height} Noppen`}
        />
        <span className="quick-preview__sweep" aria-hidden="true" />
      </div>
      <figcaption>
        Schnellvorschau: ungefähre Farben, ohne Formteile. Das fertige Mosaik baut der Server.
      </figcaption>
    </figure>
  )
}
