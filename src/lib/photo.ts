import { serialize, type Values } from './form'

/** Felder, die das Foto vor dem Mosaik bearbeiten. Gehen auch an `/bild/vorschau` und `/bild/hintergrund`. */
export const PHOTO_FIELDS = [
  'drehen',
  'spiegeln',
  'ausschnitt',
  'farbfilter',
  'filter_staerke',
  'helligkeit',
  'kontrast',
  'saettigung',
  'hintergrund',
  'hintergrundfarbe',
  'hintergrund_toleranz',
  'hintergrund_staerke',
]

/** Gehören zum einzelnen Foto, nicht in ein Preset. */
export const GEOMETRY_FIELDS = ['drehen', 'spiegeln', 'ausschnitt']

/** Bildfelder (nur Geändertes) für die Bild-Endpunkte. */
export function photoFields(values: Values, { crop = true } = {}): Record<string, string> {
  const picked: Values = {}
  for (const field of PHOTO_FIELDS)
    if (field in values && (crop || field !== 'ausschnitt')) picked[field] = values[field]
  return serialize(picked)
}

/** Ausschnitt in Prozent des gedrehten Bilds. */
export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export const FULL_CROP: Crop = { x: 0, y: 0, w: 100, h: 100 }

export function parseCrop(value: unknown): Crop | null {
  if (typeof value !== 'string' || !value) return null
  const [x, y, w, h] = value.split(',').map(Number)
  if ([x, y, w, h].some((n) => !Number.isFinite(n)) || w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

const round = (n: number) => Math.round(n * 10) / 10
export const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

/** Größter mittiger Ausschnitt mit `ratio` (Höhe je Breite in Prozent) innerhalb von `box`. */
export function fitCrop(box: Crop, ratio: number | null): Crop {
  if (!ratio) return box
  let w = box.w
  let h = w * ratio
  if (h > box.h) {
    h = box.h
    w = h / ratio
  }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** Ausschnitt auf ein neues Verhältnis bringen: gleiche Mitte, ungefähr gleiche Fläche. */
export function refitCrop(crop: Crop, ratio: number): Crop {
  let w = Math.sqrt((crop.w * crop.h) / ratio)
  let h = w * ratio
  const scale = Math.min(1, 100 / w, 100 / h)
  w *= scale
  h *= scale
  return {
    x: clamp(crop.x + crop.w / 2 - w / 2, 0, 100 - w),
    y: clamp(crop.y + crop.h / 2 - h / 2, 0, 100 - h),
    w,
    h,
  }
}

export const formatCrop = (crop: Crop) => [crop.x, crop.y, crop.w, crop.h].map(round).join(',')

/** Maße nach dem Drehen (vor dem Ausschnitt). */
export function rotatedSize(width: number, height: number, values: Values) {
  const quarter = Number(values.drehen ?? 0) % 180 === 90
  return quarter ? { width: height, height: width } : { width, height }
}

/** Seitenverhältnis des Bilds, das ins Mosaik geht: gedreht und zugeschnitten. */
export function editedAspect(width: number, height: number, values: Values) {
  const size = rotatedSize(width, height, values)
  const crop = parseCrop(values.ausschnitt) ?? FULL_CROP
  return (size.width * crop.w) / (size.height * crop.h)
}

/** Um 90° drehen. Der Ausschnitt bezieht sich auf das gedrehte Bild und fällt deshalb weg. */
export function rotate(values: Values, quarterTurns: 1 | -1): Values {
  const next = { ...values }
  const angle = (((Number(values.drehen ?? 0) + quarterTurns * 90) % 360) + 360) % 360
  if (angle) next.drehen = angle
  else delete next.drehen
  delete next.ausschnitt
  return next
}

export function flip(values: Values): Values {
  const next = { ...values }
  if (values.spiegeln) delete next.spiegeln
  else next.spiegeln = true
  delete next.ausschnitt
  return next
}

/** Einstellungen für ein Preset: alles Geänderte außer Titel, Preset und Foto-Geometrie. */
export function presetSettings(values: Values): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(values)) {
    if (key === 'titel' || key === 'preset' || GEOMETRY_FIELDS.includes(key) || value === '') continue
    out[key] = Array.isArray(value) ? value.join(',') : value
  }
  return out
}
