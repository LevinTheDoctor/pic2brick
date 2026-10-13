import type { Color, Options } from '../api/client'
import { FALLBACK_SOLID } from './colors'
import { BASE_STYLES, SHAPE_STYLES } from './labels'

export type Value = string | number | boolean | string[]
/** Nur die Felder, die der Nutzer geändert hat. */
export type Values = Record<string, Value>

export function effective(options: Options | null, values: Values, field: string): Value | null {
  if (field in values) return values[field]
  const standard = options?.felder[field]?.standard
  return standard === undefined ? null : standard
}

export const asList = (value: Value | null): string[] =>
  Array.isArray(value) ? value : typeof value === 'string' && value ? value.split(',') : []

/** Formularfelder für POST /mosaike (nur Geändertes). */
export function serialize(values: Values): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || value === null) continue
    out[key] = Array.isArray(value) ? value.join(',') : String(value)
  }
  return out
}

/** Gesamtgröße in Noppen (mit Rahmen), wie der Server sie bauen wird. */
export function computeSize(options: Options | null, values: Values, aspect: number) {
  const plate = Number(effective(options, values, 'plattengroesse') ?? 16) || 16
  const breite = values.breite as number | undefined
  const hoehe = values.hoehe as number | undefined
  if (breite || hoehe) {
    const width = breite ?? Math.max(8, Math.round((hoehe as number) * aspect))
    const height = hoehe ?? Math.max(8, Math.round((breite as number) / aspect))
    return { width, height }
  }
  const format = options?.formate.find((f) => f.name === values.format)
  if (format) return { width: format.platten_breite * plate, height: format.platten_hoehe * plate }
  const platten = String(effective(options, values, 'platten') ?? '3x3')
  const [w, h] = platten.split(/x/i).map(Number)
  return { width: (w || 3) * plate, height: (h || 3) * plate }
}

/** Prüft die Regeln, die der Server sonst mit 422 ablehnt. */
export function conflicts(options: Options | null, values: Values): string[] {
  const style = String(effective(options, values, 'stil') ?? '')
  const base = String(effective(options, values, 'unterbau') ?? '')
  const parts = asList(effective(options, values, 'teile'))
  const problems: string[] = []
  if (BASE_STYLES.includes(style) && base === 'ohne')
    problems.push('Die Stile Punkte und Noppen brauchen einen Unterbau. Wähle unter „Unterbau“ etwas anderes als „Ohne“.')
  if (SHAPE_STYLES.includes(style) && parts.includes('brick'))
    problems.push('Formteile gibt es nicht als Brick. Nimm unter „Teile im Bild“ die Bricks heraus oder wähle den Stil Quadrate.')
  if (parts.length === 0) problems.push('Wähle unter „Teile im Bild“ mindestens eine Teilart.')
  return problems
}

/** Farben für die Schnellvorschau, passend zu den gewählten Oberflächen. */
export function previewPalette(options: Options | null, values: Values, catalog: Color[] | null): string[] {
  if (!catalog?.length) return FALLBACK_SOLID
  const exotic = Boolean(effective(options, values, 'exotische_farben'))
  const categories = asList(effective(options, values, 'farbkategorien'))
  const allowed = catalog.filter((c) =>
    exotic ? c.kategorie !== 'rubber' : (categories.length ? categories : ['solid']).includes(c.kategorie),
  )
  return allowed.length ? allowed.map((c) => c.hex) : FALLBACK_SOLID
}

export function colorHex(catalog: Color[] | null, id: number | null, fallback: string) {
  if (id === null) return fallback
  return catalog?.find((c) => c.id === id)?.hex ?? fallback
}
