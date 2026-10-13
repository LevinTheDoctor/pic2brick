import { useEffect, type CSSProperties } from 'react'
import type { BuildStep } from '../lib/ldraw'
import type { CameraPreset } from '../three/MosaicScene'
import { Glass } from './Glass'

export type View = '3d' | 'top' | 'guide' | 'edit'

interface Props {
  view: View
  onView: (view: View) => void
  steps: BuildStep[]
  step: number
  onStep: (step: number, animate: boolean) => void
  playing: boolean
  onPlaying: (playing: boolean) => void
  onCamera: (preset: CameraPreset) => void
  hasModel: boolean
  hasGuide: boolean
  hasRaster: boolean
}

const VIEWS: { id: View; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'top', label: 'Draufsicht' },
  { id: 'guide', label: 'Anleitung' },
  { id: 'edit', label: 'Bearbeiten' },
]

export function Dock({ view, onView, steps, step, onStep, playing, onPlaying, onCamera, hasModel, hasGuide, hasRaster }: Props) {
  const last = steps.length - 1
  const current = steps[step]

  // Abspielen: alle 0,9 s ein Schritt
  useEffect(() => {
    if (!playing) return
    if (step >= last) {
      onPlaying(false)
      return
    }
    const timer = window.setTimeout(() => onStep(step + 1, true), 900)
    return () => window.clearTimeout(timer)
  }, [playing, step, last, onStep, onPlaying])

  const togglePlay = () => {
    if (playing) return onPlaying(false)
    if (step >= last) onStep(0, true)
    onPlaying(true)
  }

  // Abschnittsgrenzen als Markierungen auf dem Regler
  const sections = steps.map((s, i) => (s.subStep === 1 ? i : -1)).filter((i) => i > 0)

  return (
    <Glass as="nav" variant="clear" className="dock" aria-label="Ansicht und Bauschritte">
      {view === '3d' && hasModel && steps.length > 0 && (
        <div className="dock__steps">
          <button
            type="button"
            className="icon-button"
            onClick={togglePlay}
            aria-label={playing ? 'Pausieren' : 'Bauschritte abspielen'}
          >
            {playing ? (
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.2v11.6a.8.8 0 0 0 1.2.7l9.4-5.8a.8.8 0 0 0 0-1.4L7.2 3.5a.8.8 0 0 0-1.2.7Z" /></svg>
            )}
          </button>
          <div className="scrubber">
            <input
              type="range"
              min={0}
              max={last}
              value={step}
              onChange={(e) => {
                onPlaying(false)
                onStep(Number(e.target.value), false)
              }}
              aria-label="Bauschritt"
              aria-valuetext={`Schritt ${step + 1} von ${steps.length}: ${current?.label}`}
              style={{ '--progress': `${(step / Math.max(last, 1)) * 100}%` } as CSSProperties}
            />
            <div className="scrubber__ticks" aria-hidden="true">
              {sections.map((i) => (
                <span key={i} style={{ left: `${(i / Math.max(last, 1)) * 100}%` }} />
              ))}
            </div>
          </div>
          <p className="dock__label" aria-live="polite">
            <span className="dock__section">{current?.label}</span>
            <span className="dock__count">
              Schritt {step + 1} von {steps.length}
            </span>
          </p>
        </div>
      )}
      <div className="dock__row">
      {view === '3d' && hasModel ? (
        <div className="dock__camera" role="group" aria-label="Kamera">
          <button type="button" className="chip" onClick={() => onCamera('angle')}>
            Schräg
          </button>
          <button type="button" className="chip" onClick={() => onCamera('top')}>
            Von oben
          </button>
        </div>
      ) : (
        <span />
      )}
      <div className="segmented" role="tablist" aria-label="Ansicht">
        {VIEWS.filter((v) => ({ '3d': hasModel, guide: hasGuide, edit: hasRaster, top: true })[v.id]).map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className="segmented__option"
            onClick={() => onView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      </div>
    </Glass>
  )
}
