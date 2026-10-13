/** Zuletzt gebaute Mosaike. Das Backend hat keine Liste, deshalb merkt sich das Frontend die IDs. */

export interface RecentMosaic {
  id: string
  title: string
  width: number
  height: number
  preview: string | null
  createdAt: string
}

const KEY = 'pic2brick.recent'
const LIMIT = 12

export function loadRecent(): RecentMosaic[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as RecentMosaic[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function rememberMosaic(entry: RecentMosaic): RecentMosaic[] {
  const list = [entry, ...loadRecent().filter((item) => item.id !== entry.id)].slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Ohne Speicher bleibt die Liste nur für diese Sitzung
  }
  return list
}

export function forgetMosaic(id: string): RecentMosaic[] {
  const list = loadRecent().filter((item) => item.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // ignorieren
  }
  return list
}
