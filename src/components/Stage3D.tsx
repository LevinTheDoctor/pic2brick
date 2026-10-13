import { useEffect, useRef, useState } from 'react'
import type { LegoColor } from '../lib/colors'
import { UNKNOWN_COLOR } from '../lib/colors'
import type { LoadedMosaic } from '../lib/mosaic'
import { MosaicScene, type CameraPreset, type HoverEvent } from '../three/MosaicScene'
import { Glass } from './Glass'

interface Props {
  mosaic: LoadedMosaic
  colors: Map<number, LegoColor>
  step: number
  animateStep: boolean
  focus: number | null
  camera: { preset: CameraPreset; nonce: number }
  /** Ändert sich, wenn Glasflächen auf- oder zugehen */
  layout: string
}

export function Stage3D({ mosaic, colors, step, animateStep, focus, camera, layout }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<MosaicScene | null>(null)
  const [hover, setHover] = useState<HoverEvent | null>(null)

  useEffect(() => {
    const scene = new MosaicScene(canvasRef.current!, setHover)
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mosaic.model) return
    sceneRef.current?.setModel({ model: mosaic.model, colors, names: mosaic.names })
  }, [mosaic, colors])

  useEffect(() => {
    sceneRef.current?.setStep(step, animateStep)
  }, [step, animateStep, mosaic, colors])

  useEffect(() => {
    sceneRef.current?.setFocus(focus)
  }, [focus, mosaic, colors])

  useEffect(() => {
    if (camera.nonce > 0) sceneRef.current?.setCamera(camera.preset)
  }, [camera])

  // Glasflächen messen, damit das Modell im freien Bereich sitzt
  const fitted = useRef<LoadedMosaic | null>(null)
  useEffect(() => {
    const measure = () => {
      const scene = sceneRef.current
      if (!scene) return
      const width = window.innerWidth
      const height = window.innerHeight
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
      const side = (r: DOMRect | undefined) => r && r.width < width * 0.5 && r.bottom > 0 && r.top < height
      const left = rect('.sheet--left')
      const right = rect('.sheet--right')
      const dock = rect('.dock-wrap')
      const top = rect('.topbar')
      scene.setInsets({
        left: side(left) ? left!.right : 0,
        right: side(right) ? width - right!.left : 0,
        top: top ? top.bottom : 0,
        bottom: dock ? height - dock.top : 0,
      })
      if (fitted.current !== mosaic) {
        fitted.current = mosaic
        scene.setCamera('angle', false)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [mosaic, layout])

  const part = hover && mosaic.model?.parts[hover.part]
  const color = part ? (colors.get(part.color) ?? UNKNOWN_COLOR) : null

  return (
    <div className="stage3d">
      <canvas ref={canvasRef} className="stage3d__canvas" aria-label="3D-Ansicht des Mosaiks. Ziehen zum Drehen, scrollen zum Zoomen." />
      {part && color && hover && (
        <Glass
          variant="clear"
          className="part-tip"
          style={{ transform: `translate(${hover.x + 16}px, ${hover.y + 16}px)` }}
          role="status"
        >
          <span className="part-tip__swatch" style={{ background: color.hex }} />
          <span>
            <strong>{mosaic.names.get(part.id) ?? `Teil ${part.id}`}</strong>
            <span className="part-tip__meta">
              {color.name}, Nr. {part.id}
            </span>
          </span>
        </Glass>
      )}
    </div>
  )
}
