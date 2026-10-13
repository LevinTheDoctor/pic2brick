import { Glass } from './Glass'

export type ComposeView = 'photo' | 'preview'

interface Props {
  view: ComposeView
  onView: (view: ComposeView) => void
  /** Bildfelder gibt es nur mit Server */
  editable: boolean
  onRotate: (quarterTurns: 1 | -1) => void
  onFlip: () => void
  flipped: boolean
  locked: boolean
  onLocked: (locked: boolean) => void
  cropped: boolean
  onResetCrop: () => void
  hasMask: boolean
  showMask: boolean
  onShowMask: (show: boolean) => void
}

const VIEWS: { id: ComposeView; label: string }[] = [
  { id: 'photo', label: 'Foto' },
  { id: 'preview', label: 'Mosaik' },
]

/** Dock vor dem Bauen: Foto bearbeiten oder die Schnellvorschau ansehen. */
export function ComposeDock(props: Props) {
  const { view, onView, editable } = props
  return (
    <Glass as="nav" variant="clear" className="dock" aria-label="Foto und Vorschau">
      <div className="dock__row">
        {view === 'photo' && editable ? (
          <div className="dock__camera" role="group" aria-label="Foto bearbeiten">
            <button type="button" className="icon-button" onClick={() => props.onRotate(-1)} aria-label="Nach links drehen" title="Nach links drehen">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 9.5a6 6 0 1 1 1.8 4.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M2.6 6.2 4.4 10l3.8-1.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="icon-button" onClick={() => props.onRotate(1)} aria-label="Nach rechts drehen" title="Nach rechts drehen">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 9.5a6 6 0 1 0-1.8 4.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M17.4 6.2 15.6 10l-3.8-1.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="icon-button" onClick={props.onFlip} aria-pressed={props.flipped} aria-label="Spiegeln" title="Spiegeln">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5v15" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" /><path d="M7.5 5 3 15h4.5zM12.5 5 17 15h-4.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="chip" aria-pressed={props.locked} onClick={() => props.onLocked(!props.locked)} title="Ausschnitt im Seitenverhältnis des Mosaiks">
              Seitenverhältnis
            </button>
            {props.cropped && (
              <button type="button" className="chip" onClick={props.onResetCrop}>
                Ganzes Bild
              </button>
            )}
            {props.hasMask && (
              <button type="button" className="chip" aria-pressed={props.showMask} onClick={() => props.onShowMask(!props.showMask)}>
                Hintergrund
              </button>
            )}
          </div>
        ) : (
          <span />
        )}
        <div className="segmented" role="tablist" aria-label="Ansicht">
          {VIEWS.map((v) => (
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
