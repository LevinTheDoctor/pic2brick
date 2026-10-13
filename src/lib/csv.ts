/** Liest eine `;`-getrennte CSV (UTF-8 mit BOM) als Liste von Objekten. */
export function parseCsv(text: string, separator = ';'): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return []
  const split = (line: string) => {
    const cells: string[] = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = !quoted
      } else if (char === separator && !quoted) {
        cells.push(cell)
        cell = ''
      } else cell += char
    }
    cells.push(cell)
    return cells
  }
  const header = split(lines[0])
  return lines.slice(1).map((line) => {
    const cells = split(line)
    return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']))
  })
}

export interface PartRow {
  partId: string
  name: string
  colorId: number
  colorName: string
  count: number
  elementId: string
}

/** Zeilen aus `teileliste.csv`. */
export function parsePartsList(text: string): PartRow[] {
  return parseCsv(text).map((row) => ({
    partId: row['Teil-Nr.'] ?? '',
    name: row['Teilname'] ?? '',
    colorId: Number(row['Farb-ID']),
    colorName: row['Farbname'] ?? '',
    count: Number(row['Anzahl']) || 0,
    elementId: row['Element-ID'] ?? '',
  }))
}
