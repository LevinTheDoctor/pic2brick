/** Ein platziertes Teil aus einer LDraw-Datei (Zeilentyp 1). */
export interface PlacedPart {
  /** Teilnummer ohne `.dat`, z. B. `3024` */
  id: string
  /** LDraw-Farbcode */
  color: number
  /** Position in LDU (LDraw: Y zeigt nach unten) */
  position: [number, number, number]
  /** 3×3-Rotationsmatrix, zeilenweise */
  matrix: [number, number, number, number, number, number, number, number, number]
  /** Index des Bauschritts */
  step: number
}

export interface BuildStep {
  /** Beschriftung aus dem letzten `0 // …`-Kommentar, z. B. „Abschnitt 4“ */
  label: string
  /** Laufende Nummer innerhalb des Abschnitts (ab 1) */
  subStep: number
  /** Anzahl Teile in diesem Schritt */
  count: number
}

export interface LDrawModel {
  title: string
  parts: PlacedPart[]
  steps: BuildStep[]
}

/** Liest eine flache LDR-Datei (ohne Untermodelle), wie sie lego-mosaik schreibt. */
export function parseLDraw(text: string): LDrawModel {
  const parts: PlacedPart[] = []
  const steps: BuildStep[] = []
  let title = ''
  let label = 'Bauschritt'
  let subStep = 1
  let count = 0

  const closeStep = () => {
    if (count === 0) return
    steps.push({ label, subStep, count })
    subStep += 1
    count = 0
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const tokens = line.split(/\s+/)
    if (tokens[0] === '0') {
      if (tokens[1] === 'STEP') closeStep()
      else if (tokens[1] === '//') {
        closeStep()
        label = tokens.slice(2).join(' ')
        subStep = 1
      } else if (!title && tokens.length > 1 && !tokens[1].startsWith('!') && !tokens[1].endsWith(':')) {
        title = tokens.slice(1).join(' ')
      }
      continue
    }
    if (tokens[0] !== '1' || tokens.length < 15) continue
    const n = tokens.slice(1, 14).map(Number)
    const file = tokens.slice(14).join(' ')
    parts.push({
      id: file.replace(/\.dat$/i, '').toLowerCase(),
      color: n[0],
      position: [n[1], n[2], n[3]],
      matrix: [n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12]],
      step: steps.length,
    })
    count += 1
  }
  closeStep()
  return { title, parts, steps }
}
