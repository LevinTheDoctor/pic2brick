import type { components } from './schema'

export type Schemas = components['schemas']
export type Options = Schemas['OptionsModel']
export type FieldOption = Schemas['FieldOptionModel']
export type Format = Schemas['FormatModel']
export type Color = Schemas['ColorModel']
export type Health = Schemas['HealthModel']
export type Stats = Schemas['StatsModel']
export type Result = Schemas['ResultModel']
export type Created = Schemas['MosaicCreatedModel']
export type UpdateFile = Schemas['UpdateFileModel']
export type PriceEstimate = Schemas['PriceEstimateModel']
export type PriceLine = Schemas['PriceLineModel']
export type PriceSummary = Schemas['PriceSummaryModel']
export type BrickLinkExport = Schemas['BrickLinkExportModel']
export type Background = Schemas['BackgroundModel']
export type Raster = Schemas['RasterModel']
export type RasterColor = Schemas['RasterColorModel']
export type EditRequest = Schemas['EditRequestModel']
export type Palette = Schemas['PaletteModel']
export type PaletteInput = Schemas['PaletteInputModel']
export type Preset = Schemas['PresetModel']
export type PresetInput = Schemas['PresetInputModel']
export type PresetMark = Schemas['PresetMarkModel']
export type PresetOrder = Schemas['PresetOrder']

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000'

/** Fehler mit deutscher Meldung aus `{fehler}` – direkt anzeigbar. */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, init)
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError('Der Server ist nicht erreichbar.', 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      body && typeof body.fehler === 'string'
        ? body.fehler
        : `Der Server hat mit Status ${response.status} geantwortet.`
    throw new ApiError(message, response.status)
  }
  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)
  return (await response.json().catch(() => null)) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function imageForm(image: File, fields: Record<string, string>) {
  const form = new FormData()
  form.append('bild', image)
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return form
}

export const getHealth = () => request<Health>('/gesundheit')
export const getOptions = () => request<Options>('/optionen')
export const getColors = () => request<Color[]>('/farben?exotisch=true')
/** Farben, die es für diese Teilarten als 1×1 gibt (für den Noppen-Editor). */
export const getColorsFor = (parts: string[]) =>
  request<Color[]>(`/farben?exotisch=true&teile=${encodeURIComponent(parts.join(','))}`)
export const getMosaic = (id: string) => request<Result>(`/mosaike/${encodeURIComponent(id)}`)
export const updateCatalog = () => request<UpdateFile[]>('/teile/aktualisieren', { method: 'POST' })

export const createMosaic = (image: File, fields: Record<string, string>, signal?: AbortSignal) =>
  request<Created>('/mosaike', { method: 'POST', body: imageForm(image, fields), signal })

/** Das bearbeitete Bild (Drehen, Ausschnitt, Filter, Hintergrund) als PNG, so wie es ins Mosaik geht. */
export const previewImage = (image: File, fields: Record<string, string>, signal?: AbortSignal) =>
  send('/bild/vorschau', { method: 'POST', body: imageForm(image, fields), signal }).then((r) => r.blob())

export const detectBackground = (image: File, fields: Record<string, string>, signal?: AbortSignal) =>
  request<Background>('/bild/hintergrund', { method: 'POST', body: imageForm(image, fields), signal })

/** Farbe jeder Noppe, für den Editor. */
export const getRaster = (id: string) => request<Raster>(`/mosaike/${encodeURIComponent(id)}/raster`)

/** Noppen umfärben. Der Server rechnet ein neues Mosaik mit neuer ID (`basis` = alte ID). */
export const editMosaic = (id: string, edits: EditRequest, signal?: AbortSignal) =>
  request<Created>(`/mosaike/${encodeURIComponent(id)}/bearbeiten`, { ...json('POST', edits), signal })

export const listPalettes = () => request<Palette[]>('/paletten')
export const createPalette = (palette: PaletteInput) => request<Palette>('/paletten', json('POST', palette))
export const updatePalette = (id: string, palette: PaletteInput) =>
  request<Palette>(`/paletten/${encodeURIComponent(id)}`, json('PUT', palette))
export const deletePalette = (id: string) =>
  request<null>(`/paletten/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const listPresets = (order: PresetOrder = 'bewertung') => request<Preset[]>(`/presets?sortierung=${order}`)
export const createPreset = (preset: PresetInput) => request<Preset>('/presets', json('POST', preset))
export const markPreset = (id: string, mark: PresetMark) =>
  request<Preset>(`/presets/${encodeURIComponent(id)}`, json('PATCH', mark))
export const deletePreset = (id: string) => request<null>(`/presets/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const presetFromMosaic = (id: string, name: string) =>
  request<Preset>(`/mosaike/${encodeURIComponent(id)}/preset`, json('POST', { name }))

/** Preise beim BrickLink Price Guide schätzen. `offline` nimmt nur gespeicherte Preise, `force` fragt alles neu ab. */
export function estimatePrices(id: string, { offline = false, force = false } = {}) {
  const query = new URLSearchParams()
  if (offline) query.set('offline', 'true')
  if (force) query.set('erzwingen', 'true')
  const suffix = query.size ? `?${query}` : ''
  return request<PriceEstimate>(`/mosaike/${encodeURIComponent(id)}/preise${suffix}`, { method: 'POST' })
}

export const getPrices = (id: string) => request<PriceEstimate>(`/mosaike/${encodeURIComponent(id)}/preise`)
export const getBrickLinkExport = (id: string) =>
  request<BrickLinkExport>(`/mosaike/${encodeURIComponent(id)}/bricklink`)

export const fileUrl = (id: string, name: string) =>
  `${API_URL}/mosaike/${encodeURIComponent(id)}/dateien/${encodeURIComponent(name)}`
