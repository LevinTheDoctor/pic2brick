import type { CSSProperties } from 'react'

// LEGO-Farben der kleinen Landschaft
const SKY = '#36AEBF' // Medium Azure
const SUN = '#F2CD37' // Yellow
const HILL = '#4B9F4A' // Bright Green
const HILL_FAR = '#237841' // Green
const CLOUD = '#FFFFFF'

const COLS = 12
const ROWS = 9
const CELL = 10

const sun = { x: 78, y: 30, r: 13 }
const hillFar = (x: number) => 58 - 10 * Math.sin(((x + 10) / 80) * Math.PI)
const hillNear = (x: number) => 72 - 12 * Math.sin(((x - 30) / 110) * Math.PI)
const cloud = (x: number, y: number) =>
  Math.hypot(x - 30, y - 24) < 8 || Math.hypot(x - 41, y - 22) < 10 || Math.hypot(x - 52, y - 25) < 7

function scene(x: number, y: number) {
  if (y > hillNear(x)) return HILL
  if (y > hillFar(x)) return HILL_FAR
  if (Math.hypot(x - sun.x, y - sun.y) < sun.r) return SUN
  if (cloud(x, y)) return CLOUD
  return SKY
}

const path = (fn: (x: number) => number) =>
  `M0 ${ROWS * CELL}` +
  Array.from({ length: COLS * CELL + 1 }, (_, x) => ` L${x} ${fn(x).toFixed(1)}`).join('') +
  ` L${COLS * CELL} ${ROWS * CELL} L0 ${ROWS * CELL}Z`

/** Ab dieser Diagonale ist das Foto schon zu Steinen geworden (Treppe wie im Favicon). */
const EDGE = 11

/**
 * Polaroid, dessen Foto zu Steinen wird – rechts oben schon verpixelt, links unten noch Foto.
 * `complete` verwandelt das ganze Bild.
 */
export function PolaroidArt({ caption, complete = false }: { caption: string; complete?: boolean }) {
  const cells = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const diagonal = c + (ROWS - 1 - r)
      const early = diagonal >= EDGE
      cells.push(
        <g
          key={`${r}-${c}`}
          className={`polaroid__cell${early ? ' is-early' : ''}`}
          style={{ '--d': `${(early ? diagonal - EDGE : EDGE - diagonal) * 35}ms` } as CSSProperties}
        >
          <rect x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={scene(c * CELL + 5, r * CELL + 5)} />
          <circle cx={c * CELL + 5} cy={r * CELL + 5} r="3.2" />
        </g>,
      )
    }

  return (
    <figure className={`polaroid${complete ? ' is-complete' : ''}`} aria-hidden="true">
      <svg viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`} className="polaroid__photo">
        <rect width={COLS * CELL} height={ROWS * CELL} fill={SKY} />
        <circle cx={sun.x} cy={sun.y} r={sun.r} fill={SUN} />
        <g fill={CLOUD}>
          <circle cx="30" cy="24" r="8" />
          <circle cx="41" cy="22" r="10" />
          <circle cx="52" cy="25" r="7" />
        </g>
        <path d={path(hillFar)} fill={HILL_FAR} />
        <path d={path(hillNear)} fill={HILL} />
        <g className="polaroid__bricks">{cells}</g>
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
