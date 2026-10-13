import type { EditRequest, Raster } from '../api/client'

/** Farb-ID je Noppe, `grid[zeile][spalte]`, 0-basiert inklusive Rahmen. */
export type Grid = number[][]
export interface Cell {
  row: number
  col: number
}

export const isFrame = (raster: Raster, { row, col }: Cell) =>
  row < raster.rahmen || col < raster.rahmen || row >= raster.hoehe - raster.rahmen || col >= raster.breite - raster.rahmen

/** Färbt Noppen um; Rahmen-Noppen bleiben. Kopiert nur geänderte Zeilen. */
export function paint(grid: Grid, raster: Raster, cells: Cell[], color: number): Grid {
  let next = grid
  for (const cell of cells) {
    if (isFrame(raster, cell) || next[cell.row][cell.col] === color) continue
    if (next === grid) next = [...grid]
    if (next[cell.row] === grid[cell.row]) next[cell.row] = [...grid[cell.row]]
    next[cell.row][cell.col] = color
  }
  return next
}

/** Alle Noppen im Rechteck zwischen zwei Ecken. */
export function rectCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = []
  for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++)
    for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) cells.push({ row, col })
  return cells
}

/** Noppen auf der Linie zwischen zwei Noppen, damit schnelle Pinselstriche keine Lücken haben. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const steps = Math.max(Math.abs(b.row - a.row), Math.abs(b.col - a.col), 1)
  return Array.from({ length: steps + 1 }, (_, i) => ({
    row: Math.round(a.row + ((b.row - a.row) * i) / steps),
    col: Math.round(a.col + ((b.col - a.col) * i) / steps),
  }))
}

/** Farbeimer: zusammenhängende Fläche gleicher Farbe (4er-Nachbarschaft), ohne Rahmen. */
export function fillCells(grid: Grid, raster: Raster, start: Cell): Cell[] {
  if (isFrame(raster, start)) return []
  const target = grid[start.row][start.col]
  const seen = new Uint8Array(raster.breite * raster.hoehe)
  const cells: Cell[] = []
  const stack = [start]
  while (stack.length) {
    const cell = stack.pop()!
    const i = cell.row * raster.breite + cell.col
    if (seen[i] || isFrame(raster, cell) || grid[cell.row][cell.col] !== target) continue
    seen[i] = 1
    cells.push(cell)
    stack.push(
      { row: cell.row - 1, col: cell.col },
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col - 1 },
      { row: cell.row, col: cell.col + 1 },
    )
  }
  return cells
}

export function countChanges(original: Grid, edited: Grid) {
  let count = 0
  for (let row = 0; row < original.length; row++) {
    if (original[row] === edited[row]) continue
    for (let col = 0; col < original[row].length; col++) if (original[row][col] !== edited[row][col]) count++
  }
  return count
}

/**
 * Änderungen für `POST /mosaike/{id}/bearbeiten`, 1-basiert inklusive Rahmen.
 * Geschickt wird der Endzustand: Läufe gleicher Farbe in einer Zeile als Fläche, Einzelne als Noppe.
 * So kommt es nicht auf die Reihenfolge an, in der der Server Noppen, Flächen und Füllungen anwendet.
 */
export function toEditRequest(original: Grid, edited: Grid): EditRequest {
  const request: EditRequest = { noppen: [], flaechen: [], fuellen: [] }
  for (let row = 0; row < original.length; row++) {
    if (original[row] === edited[row]) continue
    let col = 0
    while (col < original[row].length) {
      const color = edited[row][col]
      if (original[row][col] === color) {
        col++
        continue
      }
      let end = col + 1
      while (end < original[row].length && edited[row][end] === color && original[row][end] !== color) end++
      const length = end - col
      if (length === 1) request.noppen!.push({ zeile: row + 1, spalte: col + 1, farbe_id: color })
      else request.flaechen!.push({ zeile: row + 1, spalte: col + 1, breite: length, hoehe: 1, farbe_id: color })
      col = end
    }
  }
  return request
}
