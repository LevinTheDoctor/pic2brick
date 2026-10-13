import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { FULL_CROP, clamp, fitCrop, type Crop } from '../lib/photo'

interface Props {
  /** Bild nach Drehen, Filter und Hintergrund, aber ohne Ausschnitt */
  src: string
  /** Breite / Höhe dieses Bilds */
  imageAspect: number
  crop: Crop | null
  /** Seitenverhältnis (Breite / Höhe) für den Rahmen, null = frei */
  lockAspect: number | null
  /** Maske des Hintergrunds (weiß = Hintergrund) oder null */
  mask: string | null
  pending: boolean
  onCrop: (crop: Crop | null) => void
}

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN = 5

/** Höhe in Prozent je Prozent Breite, damit der Ausschnitt das Seitenverhältnis hat. */
const ratioFor = (imageAspect: number, aspect: number | null) => (aspect ? imageAspect / aspect : null)

function resize(anchor: { x: number; y: number }, point: { x: number; y: number }, ratio: number | null): Crop {
  const sx = point.x < anchor.x ? -1 : 1
  const sy = point.y < anchor.y ? -1 : 1
  const maxW = sx > 0 ? 100 - anchor.x : anchor.x
  const maxH = sy > 0 ? 100 - anchor.y : anchor.y
  let w = Math.max(Math.abs(point.x - anchor.x), MIN)
  let h = Math.max(Math.abs(point.y - anchor.y), MIN)
  if (ratio) {
    if (h < w * ratio) h = w * ratio
    else w = h / ratio
    const scale = Math.min(1, maxW / w, maxH / h)
    w *= scale
    h *= scale
  } else {
    w = Math.min(w, maxW)
    h = Math.min(h, maxH)
  }
  return { x: sx > 0 ? anchor.x : anchor.x - w, y: sy > 0 ? anchor.y : anchor.y - h, w, h }
}

/** Hintergrundmaske als blaue, halbtransparente Fläche. */
function MaskOverlay({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < data.data.length; i += 4) {
        const alpha = data.data[i] // weiß = Hintergrund
        data.data[i] = 0
        data.data[i + 1] = 85
        data.data[i + 2] = 191
        data.data[i + 3] = alpha * 0.55
      }
      ctx.putImageData(data, 0, 0)
    }
    image.src = src
  }, [src])

  return <canvas ref={canvasRef} className="photo-editor__mask" aria-hidden="true" />
}

/** Foto mit Ausschnittsrahmen: Ecken ziehen, Rahmen verschieben oder neu aufziehen. */
export function PhotoEditor({ src, imageAspect, crop, lockAspect, mask, pending, onCrop }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; crop: Crop } | null>(null)
  const [draft, setDraft] = useState<Crop | null>(null)

  const ratio = ratioFor(imageAspect, lockAspect)
  // Ohne eigenen Ausschnitt nimmt der Server die Mitte im Seitenverhältnis des Mosaiks
  const shown = draft ?? crop ?? fitCrop(FULL_CROP, ratio)

  const toPercent = (event: PointerEvent) => {
    const rect = frameRef.current!.getBoundingClientRect()
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }

  const start = (handle: Handle) => (event: PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    frameRef.current!.setPointerCapture(event.pointerId)
    drag.current = { handle, start: toPercent(event), crop: shown }
  }

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current
    if (!current) return
    const point = toPercent(event)
    const { crop: c } = current
    if (current.handle === 'move') {
      setDraft({
        ...c,
        x: clamp(c.x + point.x - current.start.x, 0, 100 - c.w),
        y: clamp(c.y + point.y - current.start.y, 0, 100 - c.h),
      })
      return
    }
    const anchor = {
      x: current.handle.includes('w') ? c.x + c.w : c.x,
      y: current.handle.includes('n') ? c.y + c.h : c.y,
    }
    setDraft(resize(anchor, point, ratio))
  }

  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    if (draft) onCrop(draft.w >= 99.9 && draft.h >= 99.9 ? null : draft)
    setDraft(null)
  }

  return (
    <figure className="photo-editor">
      <div
        ref={frameRef}
        className={`photo-editor__frame${pending ? ' is-pending' : ''}`}
        onPointerDown={(event) => {
          // Auf dem Foto neu aufziehen
          const point = toPercent(event)
          frameRef.current!.setPointerCapture(event.pointerId)
          const seed = { x: point.x, y: point.y, w: 0, h: 0 }
          drag.current = { handle: 'se', start: point, crop: seed }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ aspectRatio: String(imageAspect), '--aspect': imageAspect } as CSSProperties}
      >
        <img src={src} alt="Dein Foto mit allen Bearbeitungen" draggable={false} />
        {mask && <MaskOverlay src={mask} />}
        <div
          className="crop"
          style={{ left: `${shown.x}%`, top: `${shown.y}%`, width: `${shown.w}%`, height: `${shown.h}%` }}
          onPointerDown={start('move')}
          role="group"
          aria-label="Ausschnitt"
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span key={corner} className={`crop__handle crop__handle--${corner}`} onPointerDown={start(corner)} />
          ))}
        </div>
      </div>
      <figcaption>
        {lockAspect
          ? 'Zieh an den Ecken oder verschieb den Rahmen. Er hat das Seitenverhältnis des Mosaiks.'
          : 'Freier Ausschnitt. Beim Zuschneiden nimmt der Server daraus die Mitte im Seitenverhältnis des Mosaiks.'}
      </figcaption>
    </figure>
  )
}
