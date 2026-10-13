import type { Background } from '../api/client'
import { number } from '../lib/labels'

interface Props {
  background: Background | null
  detecting: boolean
  mode: string
  onRemove: (colorId: number) => void
}

/** Ab diesem Anteil lohnt sich das Angebot „Hintergrund entfernen“. */
const WORTH_IT = 0.15

/** Erkannter Hintergrund (`/bild/hintergrund`): Farbe, Anteil und ein Knopf zum Entfernen. */
export function BackgroundHint({ background, detecting, mode, onRemove }: Props) {
  if (!background) return detecting ? <p className="bg-hint bg-hint--quiet">Hintergrund wird erkannt …</p> : null
  const share = `${number(background.anteil * 100)} %`
  const lego = background.lego_farbe

  if (mode === 'behalten' && background.anteil < WORTH_IT) return null

  return (
    <div className="bg-hint" role="status">
      <span className="swatch" style={{ background: background.farbe_hex }} />
      <span className="bg-hint__text">
        <strong>{mode === 'behalten' ? 'Einfarbiger Hintergrund erkannt' : 'Erkannter Hintergrund'}</strong>
        <span>
          {share} des Bilds, am nächsten an {lego.lego_name ?? lego.name}
        </span>
      </span>
      {mode === 'behalten' && (
        <button type="button" className="chip" onClick={() => onRemove(lego.id)}>
          Entfernen
        </button>
      )}
    </div>
  )
}
