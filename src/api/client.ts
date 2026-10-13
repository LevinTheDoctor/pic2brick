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

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000'

/** Fehler mit deutscher Meldung aus `{fehler}` – direkt anzeigbar. */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, init)
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError('Der Server ist nicht erreichbar.', 0)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      body && typeof body.fehler === 'string'
        ? body.fehler
        : `Der Server hat mit Status ${response.status} geantwortet.`
    throw new ApiError(message, response.status)
  }
  return body as T
}

export const getHealth = () => request<Health>('/gesundheit')
export const getOptions = () => request<Options>('/optionen')
export const getColors = () => request<Color[]>('/farben?exotisch=true')
export const getMosaic = (id: string) => request<Result>(`/mosaike/${encodeURIComponent(id)}`)
export const updateCatalog = () => request<UpdateFile[]>('/teile/aktualisieren', { method: 'POST' })

export function createMosaic(image: File, fields: Record<string, string>, signal?: AbortSignal) {
  const form = new FormData()
  form.append('bild', image)
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return request<Created>('/mosaike', { method: 'POST', body: form, signal })
}

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
