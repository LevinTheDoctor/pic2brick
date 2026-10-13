/**
 * Prozedurale Teilegeometrie für die Teile, die lego-mosaik verbaut.
 *
 * Maße in LDU (1 Noppe = 20 LDU, Plate = 8, Brick = 24). Umrisse werden in der
 * LDraw-Draufsicht (x, z) beschrieben, um den Teil-Ursprung herum. Der Ursprung
 * liegt wie in LDraw an der Oberseite des Körpers; der Körper reicht nach unten.
 */

export type Outline = [number, number][]

export interface PartSpec {
  /** Schlüssel für die gemeinsame Geometrie (alle Teile mit gleichem Schlüssel teilen sich ein Mesh) */
  key: string
  outline: Outline
  /** Höhe des Körpers in LDU */
  height: number
  /** Noppenmitten in der Draufsicht (x, z) */
  studs: [number, number][]
  /** Runder Umriss (für weichere Kanten) */
  round?: boolean
  /** Teil liegt quer (Technic-Pin): eigener Zylinder */
  pin?: boolean
}

const PLATE = 8
const BRICK = 24

const rect = (w: number, l: number): Outline => {
  const x = (l * 20) / 2
  const z = (w * 20) / 2
  return [[-x, -z], [x, -z], [x, z], [-x, z]]
}

const gridStuds = (w: number, l: number): [number, number][] => {
  const studs: [number, number][] = []
  for (let i = 0; i < l; i++)
    for (let j = 0; j < w; j++) studs.push([-l * 10 + 10 + i * 20, -w * 10 + 10 + j * 20])
  return studs
}

const arc = (cx: number, cz: number, r: number, from: number, to: number, segments = 14): Outline => {
  const points: Outline = []
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments
    points.push([cx + r * Math.cos(a), cz + r * Math.sin(a)])
  }
  return points
}

const box = (kind: 'plate' | 'brick' | 'tile', w: number, l: number): PartSpec => ({
  key: `${kind}:${w}x${l}`,
  outline: rect(w, l),
  height: kind === 'brick' ? BRICK : PLATE,
  studs: kind === 'tile' ? [] : gridStuds(w, l),
})

const disc = (kind: 'plate' | 'tile' | 'brick'): PartSpec => ({
  key: `round:${kind}`,
  outline: arc(0, 0, 10, 0, Math.PI * 2, 24).slice(0, -1),
  height: kind === 'brick' ? BRICK : PLATE,
  studs: kind === 'tile' ? [] : [[0, 0]],
  round: true,
})

const mirrorX = (outline: Outline): Outline => outline.map(([x, z]) => [-x, z] as [number, number]).reverse()

/** Noppen auf allen Zellen, auf denen die ganze Noppe innerhalb des Umrisses liegt. */
function studsInside(outline: Outline, w: number, l: number): [number, number][] {
  const r = 6
  return gridStuds(l, w).filter(([x, z]) =>
    [[x, z], [x - r, z], [x + r, z], [x, z - r], [x, z + r]].every(([px, pz]) => insidePolygon(px, pz, outline)),
  )
}

export function insidePolygon(x: number, z: number, polygon: Outline) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// Keile: 2 Noppen breit (x), lang in z. „Left“ ist bei +z voll breit und verjüngt sich
// zur −z-Seite auf eine Noppe, die Schräge liegt auf der +x-Seite (geprüft an vorschau.png).
const wedgeLeft = (length: number): Outline => {
  const h = length * 10
  return [[-20, -h], [0, -h], [20, h], [-20, h]]
}

const wedge = (key: string, length: number, left: boolean): PartSpec => {
  const outline = left ? wedgeLeft(length) : mirrorX(wedgeLeft(length))
  return { key, outline, height: PLATE, studs: studsInside(outline, 2, length) }
}

const SPECS: Record<string, PartSpec> = {
  '65803': { key: 'panel', outline: rect(16, 16), height: 16, studs: gridStuds(16, 16) },
  '2780': { key: 'pin', outline: [], height: 0, studs: [], pin: true },
  // Viertelkreis: Mittelpunkt in der Ecke (−x, +z), Bogen zur gegenüberliegenden Ecke (geprüft an vorschau.png)
  '25269': {
    key: 'quarter',
    outline: [[-10, 10], ...arc(-10, 10, 20, -Math.PI / 2, 0)],
    height: PLATE,
    studs: [],
    round: true,
  },
  // Halbkreis: gerade Kante bei +z, Bogen nach −z
  '24246': {
    key: 'half',
    outline: arc(0, 10, 10, Math.PI, Math.PI * 2),
    height: PLATE,
    studs: [],
    round: true,
  },
  '26601': {
    key: 'cut-corner',
    outline: [[-20, -20], [0, -20], [20, 0], [20, 20], [-20, 20]],
    height: PLATE,
    studs: [[-10, -10], [-10, 10], [10, 10]],
  },
  '24299': wedge('wedge2-left', 2, true),
  '24307': wedge('wedge2-right', 2, false),
  '43723': wedge('wedge3-left', 3, true),
  '43722': wedge('wedge3-right', 3, false),
  '41770': wedge('wedge4-left', 4, true),
  '41769': wedge('wedge4-right', 4, false),
  '4073': disc('plate'),
  '6141': disc('plate'),
  '85861': disc('plate'),
  '98138': disc('tile'),
  '3062b': disc('brick'),
  '3062': disc('brick'),
}

const BOXES: [string, 'plate' | 'brick' | 'tile', number, number][] = [
  ['3024', 'plate', 1, 1], ['3023', 'plate', 1, 2], ['3623', 'plate', 1, 3], ['3710', 'plate', 1, 4],
  ['3666', 'plate', 1, 6], ['3460', 'plate', 1, 8], ['4477', 'plate', 1, 10], ['60479', 'plate', 1, 12],
  ['3022', 'plate', 2, 2], ['3021', 'plate', 2, 3], ['3020', 'plate', 2, 4], ['3795', 'plate', 2, 6],
  ['3034', 'plate', 2, 8], ['3832', 'plate', 2, 10], ['2445', 'plate', 2, 12], ['3031', 'plate', 4, 4],
  ['3032', 'plate', 4, 6], ['3035', 'plate', 4, 8], ['3030', 'plate', 4, 10], ['3029', 'plate', 4, 12],
  ['3958', 'plate', 6, 6], ['3036', 'plate', 6, 8], ['3033', 'plate', 6, 10], ['41539', 'plate', 8, 8],
  ['91405', 'plate', 16, 16],
  ['3005', 'brick', 1, 1], ['3004', 'brick', 1, 2], ['3622', 'brick', 1, 3], ['3010', 'brick', 1, 4],
  ['3009', 'brick', 1, 6], ['3008', 'brick', 1, 8], ['6111', 'brick', 1, 10], ['6112', 'brick', 1, 12],
  ['3003', 'brick', 2, 2], ['3002', 'brick', 2, 3], ['3001', 'brick', 2, 4], ['2456', 'brick', 2, 6],
  ['3007', 'brick', 2, 8],
  ['3070b', 'tile', 1, 1], ['3070', 'tile', 1, 1], ['3069b', 'tile', 1, 2], ['3069', 'tile', 1, 2],
  ['63864', 'tile', 1, 3], ['2431', 'tile', 1, 4], ['6636', 'tile', 1, 6], ['4162', 'tile', 1, 8],
  ['3068b', 'tile', 2, 2], ['3068', 'tile', 2, 2], ['26603', 'tile', 2, 3], ['87079', 'tile', 2, 4],
  ['69729', 'tile', 2, 6],
]
for (const [id, kind, w, l] of BOXES) SPECS[id] = box(kind, w, l)

const BASEPLATE: Record<string, number> = { '3867': 16, '3811': 32, '4186': 48 }
for (const [id, size] of Object.entries(BASEPLATE))
  SPECS[id] = { key: `baseplate:${size}`, outline: rect(size, size), height: 4, studs: gridStuds(size, size) }

/** Leitet Maße aus einem Teilenamen ab, z. B. „Plate 1 x 8“, „Tile Round 1 x 1“, „Baseplate 32 x 32“. */
function specFromName(name: string): PartSpec | null {
  const round = /^(Plate|Tile|Brick) Round 1 x 1\b/i.exec(name)
  if (round) return disc(round[1].toLowerCase() as 'plate' | 'tile' | 'brick')
  const base = /^Baseplate (\d+) x (\d+)/i.exec(name)
  if (base) {
    const [w, l] = [Number(base[1]), Number(base[2])].sort((a, b) => a - b)
    return { key: `baseplate:${w}x${l}`, outline: rect(w, l), height: 4, studs: gridStuds(w, l) }
  }
  const match = /^(Plate|Brick|Tile) (\d+) x (\d+)/i.exec(name)
  if (!match) return null
  const [w, l] = [Number(match[2]), Number(match[3])].sort((a, b) => a - b)
  return box(match[1].toLowerCase() as 'plate' | 'brick' | 'tile', w, l)
}

const FALLBACK = box('plate', 1, 1)

/** Spezifikation für eine LDraw-Teilnummer; `names` kommt aus der Teileliste. */
export function partSpec(id: string, names: Map<string, string>): PartSpec {
  const known = SPECS[id]
  if (known) return known
  const name = names.get(id) ?? names.get(id.replace(/[a-z]$/, ''))
  return (name && specFromName(name)) || FALLBACK
}
