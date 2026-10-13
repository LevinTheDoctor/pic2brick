import type { Color, Result } from '../api/client'

export interface LegoColor {
  hex: string
  name: string
  transparent: boolean
}

// Gängige LDraw-Farben, falls weder Palette noch /farben einen Code kennen
// (z. B. Rahmen- oder Unterbaufarben). Werte wie bei Rebrickable.
const FALLBACK: Record<number, [string, string]> = {
  0: ['#05131D', 'Black'], 1: ['#0055BF', 'Blue'], 2: ['#237841', 'Green'], 3: ['#008F9B', 'Dark Turquoise'],
  4: ['#C91A09', 'Red'], 5: ['#C870A0', 'Dark Pink'], 6: ['#583927', 'Brown'], 7: ['#9BA19D', 'Light Gray'],
  8: ['#6D6E5C', 'Dark Gray'], 9: ['#B4D2E3', 'Light Blue'], 10: ['#4B9F4A', 'Bright Green'],
  11: ['#55A5AF', 'Light Turquoise'], 12: ['#F2705E', 'Salmon'], 13: ['#FC97AC', 'Pink'], 14: ['#F2CD37', 'Yellow'],
  15: ['#FFFFFF', 'White'], 17: ['#C2DAB8', 'Light Green'], 18: ['#FBE696', 'Light Yellow'], 19: ['#E4CD9E', 'Tan'],
  22: ['#81007B', 'Purple'], 23: ['#2032B0', 'Dark Blue-Violet'], 25: ['#FE8A18', 'Orange'], 26: ['#923978', 'Magenta'],
  27: ['#BBE90B', 'Lime'], 28: ['#958A73', 'Dark Tan'], 29: ['#E4ADC8', 'Bright Pink'], 30: ['#AC78BA', 'Medium Lavender'],
  31: ['#E1D5ED', 'Lavender'], 70: ['#582A12', 'Reddish Brown'], 71: ['#A0A5A9', 'Light Bluish Gray'],
  72: ['#6C6E68', 'Dark Bluish Gray'], 73: ['#5A93DB', 'Medium Blue'], 74: ['#73DCA1', 'Medium Green'],
  84: ['#CC702A', 'Medium Dark Flesh'], 85: ['#3F3691', 'Dark Purple'], 92: ['#D09168', 'Nougat'],
  191: ['#F8BB3D', 'Bright Light Orange'], 212: ['#9FC3E9', 'Bright Light Blue'], 226: ['#FFF03A', 'Bright Light Yellow'],
  272: ['#0A3463', 'Dark Blue'], 288: ['#184632', 'Dark Green'], 308: ['#352100', 'Dark Brown'], 320: ['#720E0F', 'Dark Red'],
  321: ['#078BC9', 'Dark Azure'], 322: ['#36AEBF', 'Medium Azure'], 323: ['#ADC3C0', 'Light Aqua'],
  378: ['#A0BCAC', 'Sand Green'], 379: ['#6074A1', 'Sand Blue'], 484: ['#A95500', 'Dark Orange'],
  33: ['#0020A0', 'Trans-Dark Blue'], 34: ['#84B68D', 'Trans-Green'], 36: ['#C91A09', 'Trans-Red'],
  40: ['#635F52', 'Trans-Black'], 41: ['#AEEFEC', 'Trans-Light Blue'], 46: ['#F5CD2F', 'Trans-Yellow'],
  47: ['#FCFCFC', 'Trans-Clear'], 57: ['#F08F1C', 'Trans-Orange'],
}

const isTransparentName = (name: string) => /^trans/i.test(name)

/** Uni-Farben für die Schnellvorschau, wenn der Server nicht erreichbar ist. */
export const FALLBACK_SOLID = Object.values(FALLBACK)
  .filter(([, name]) => !isTransparentName(name))
  .map(([hex]) => hex)

/** Baut die Zuordnung LDraw-Code → Farbe aus Palette, Katalog und Fallback. */
export function buildColorTable(palette: Result['palette'] | undefined, catalog: Color[] | undefined) {
  const table = new Map<number, LegoColor>()
  for (const [code, [hex, name]] of Object.entries(FALLBACK))
    table.set(Number(code), { hex, name, transparent: isTransparentName(name) })
  for (const color of catalog ?? [])
    if (color.ldraw_code != null)
      table.set(color.ldraw_code, {
        hex: color.hex,
        name: color.name,
        transparent: color.kategorie === 'transparent',
      })
  for (const color of palette ?? [])
    if (color.ldraw_code != null) {
      const known = table.get(color.ldraw_code)
      table.set(color.ldraw_code, {
        hex: color.hex,
        name: color.name,
        transparent: known?.transparent ?? isTransparentName(color.name),
      })
    }
  return table
}

export const UNKNOWN_COLOR: LegoColor = { hex: '#9BA19D', name: 'Unbekannte Farbe', transparent: false }

/** Relative Helligkeit, um Text auf einer Farbfläche lesbar zu setzen. */
export function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150
}
