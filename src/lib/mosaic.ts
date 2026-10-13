import { fileUrl, getMosaic, type Result } from '../api/client'
import { parsePartsList, type PartRow } from './csv'
import { parseLDraw, type LDrawModel } from './ldraw'

/** Ein geladenes Mosaik mit allem, was die Ansichten brauchen. */
export interface LoadedMosaic {
  id: string
  result: Result
  /** Dateiname → URL */
  files: Record<string, string>
  model: LDrawModel | null
  parts: PartRow[]
  /** Teilnummer → Teilname */
  names: Map<string, string>
  /** Beispiel aus backend-docs/, nicht vom Server – ohne Preise */
  demo: boolean
}

/** Beispiel aus `backend-docs/`, das Vite im Dev-Modus direkt ausliefert. */
export const DEMO_ID = '2026-10-12_234947_Comic'
const DEMO_BASE = `/backend-docs/${DEMO_ID}/`

async function text(url: string | undefined) {
  if (!url) return null
  const response = await fetch(url)
  return response.ok ? response.text() : null
}

async function complete(id: string, result: Result, files: Record<string, string>, demo = false): Promise<LoadedMosaic> {
  // Neuere Server liefern die Teileliste in ergebnis.json mit, ältere nur als CSV
  const listed = result.teileliste ?? []
  const [ldr, csv] = await Promise.all([
    text(files['mosaik.ldr']),
    listed.length ? Promise.resolve(null) : text(files['teileliste.csv']),
  ])
  const parts: PartRow[] = listed.length
    ? listed.map((item) => ({
        partId: item.teil,
        name: item.name,
        colorId: item.farbe_id,
        colorName: item.farbe,
        count: item.anzahl,
        elementId: '',
      }))
    : csv
      ? parsePartsList(csv)
      : []
  const names = new Map(parts.map((row) => [row.partId.toLowerCase(), row.name]))
  return { id, result, files, model: ldr ? parseLDraw(ldr) : null, parts, names, demo }
}

export async function loadMosaic(id: string): Promise<LoadedMosaic> {
  const result = await getMosaic(id)
  const files = Object.fromEntries(result.dateien.map((name) => [name, fileUrl(id, name)]))
  return complete(id, result, files)
}

export async function loadDemo(): Promise<LoadedMosaic> {
  const response = await fetch(`${DEMO_BASE}ergebnis.json`)
  if (!response.ok) throw new Error('Das Beispiel liegt nicht in backend-docs/.')
  const result = (await response.json()) as Result
  const files = Object.fromEntries(result.dateien.map((name) => [name, `${DEMO_BASE}${name}`]))
  return complete(DEMO_ID, result, files, true)
}

/** Seiten der Bauanleitung als Bild-URLs, in Reihenfolge. */
export const instructionPages = (files: Record<string, string>) =>
  Object.keys(files)
    .filter((name) => /^anleitung_\d+\.png$/.test(name))
    .sort()
    .map((name) => files[name])
