import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'

/** Draufsicht (`vorschau.png`): mit Mausrad oder Pinch zoomen, mit Ziehen verschieben. */
export function TopView({ src, title }: { src: string; title: string }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const zoom = (factor: number) =>
    setView((v) => {
      const scale = Math.min(Math.max(v.scale * factor, 1), 8)
      return scale === 1 ? { scale, x: 0, y: 0 } : { ...v, scale }
    })

  const onWheel = (event: WheelEvent) => zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15)
  const onPointerDown = (event: PointerEvent) => {
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX - view.x, y: event.clientY - view.y }
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current || view.scale === 1) return
    setView((v) => ({ ...v, x: event.clientX - drag.current!.x, y: event.clientY - drag.current!.y }))
  }

  return (
    <div
      className="topview"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => setView({ scale: 1, x: 0, y: 0 })}
    >
      <img
        src={src}
        alt={`Draufsicht des Mosaiks „${title}“`}
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
      <div className="topview__zoom">
        <button type="button" className="icon-button" onClick={() => zoom(1 / 1.4)} aria-label="Verkleinern">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="2" rx="1" /></svg>
        </button>
        <button type="button" className="icon-button" onClick={() => zoom(1.4)} aria-label="Vergrößern">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="2" rx="1" /><rect x="9" y="4" width="2" height="12" rx="1" /></svg>
        </button>
      </div>
    </div>
  )
}
