import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { ApiError, getColorsFor, getRaster, type Color, type EditRequest, type Raster } from '../api/client'
import { isLight, sortByHue } from '../lib/colors'
import { number } from '../lib/labels'
import type { LoadedMosaic } from '../lib/mosaic'
import { drawStuds } from '../lib/pixelate'
import { countChanges, fillCells, isFrame, lineCells, paint, rectCells, toEditRequest, type Cell, type Grid } from '../lib/raster'
import { Glass } from './Glass'

type Tool = 'pinsel' | 'rechteck' | 'fuellen' | 'pipette'

interface Props {
  mosaic: LoadedMosaic
  building: boolean
  onApply: (edits: EditRequest) => void
  onPrevious: (() => void) | null
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'pinsel', label: 'Pinsel', key: 'b' },
  { id: 'rechteck', label: 'Rechteck', key: 'r' },
  { id: 'fuellen', label: 'Füllen', key: 'f' },
  { id: 'pipette', label: 'Pipette', key: 'i' },
]

interface History {
  steps: Grid[]
  index: number
}

/** Ungespeicherte Änderungen je Mosaik, damit ein Wechsel der Ansicht nichts verwirft. */
const drafts = new Map<string, History>()

/** Pixel-Editor auf dem Noppenraster (`/mosaike/{id}/raster`). Übernehmen rechnet ein neues Mosaik. */
export function StudEditor({ mosaic, building, onApply, onPrevious }: Props) {
  const [raster, setRaster] = useState<Raster | null>(null)
  const [allowed, setAllowed] = useState<Color[]>([])
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<History | null>(() => drafts.get(mosaic.id) ?? null)
  const [stroke, setStroke] = useState<Grid | null>(null)
  const [tool, setTool] = useState<Tool>('pinsel')
  const [color, setColor] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null)
  const [rect, setRect] = useState<{ from: Cell; to: Cell } | null>(null)
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  // Laufender Strich bzw. Rechteck: in Refs, damit schnelle Zeigerereignisse nichts verlieren
  const drawing = useRef<{ grid: Grid; last: Cell; rect: { from: Cell; to: Cell } | null } | null>(null)

  // Raster und erlaubte Farben laden
  useEffect(() => {
    let alive = true
    const kinds = (mosaic.result.konfiguration as { palette?: { part_kinds?: string[] } }).palette?.part_kinds ?? ['plate', 'tile']
    Promise.all([getRaster(mosaic.id), getColorsFor(kinds).catch(() => [] as Color[])]).then(
      ([r, colors]) => {
        if (!alive) return
        setRaster(r)
        setAllowed(colors)
        setHistory((h) => h ?? { steps: [r.zeilen], index: 0 })
        setColor((c) => c ?? r.farben[0]?.id ?? null)
      },
      (e) => alive && setError(e instanceof ApiError ? e.message : 'Das Noppenraster konnte nicht geladen werden.'),
    )
    return () => {
      alive = false
    }
  }, [mosaic])

  useEffect(() => {
    if (history && history.index > 0) drafts.set(mosaic.id, history)
    else drafts.delete(mosaic.id)
  }, [history, mosaic.id])

  const grid = stroke ?? history?.steps[history.index] ?? null
  const original = history?.steps[0] ?? null
  const changes = grid && original ? countChanges(original, grid) : 0

  const colorById = useMemo(() => {
    const map = new Map<number, { hex: string; name: string }>()
    for (const c of allowed) map.set(c.id, { hex: c.hex, name: c.lego_name ?? c.name })
    for (const c of raster?.farben ?? []) map.set(c.id, { hex: c.hex, name: map.get(c.id)?.name ?? c.name })
    return map
  }, [allowed, raster])
  const used = useMemo(() => sortByHue(raster?.farben ?? []), [raster])
  const more = useMemo(() => sortByHue(allowed.filter((c) => !raster?.farben.some((u) => u.id === c.id))), [allowed, raster])

  // Zeichnen
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !raster || !grid) return
    const cells = grid.flat().map((id) => colorById.get(id)?.hex ?? '#9BA19D')
    drawStuds(canvas, cells, raster.breite, raster.hoehe, 1400)
  }, [grid, raster, colorById])

  // Passende Größe: das Raster füllt die Fläche, Zoom vergrößert darüber hinaus
  useEffect(() => {
    const area = areaRef.current
    if (!area || !raster) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setFit(Math.max(Math.min(width / raster.breite, height / raster.hoehe), 1))
    })
    observer.observe(area)
    return () => observer.disconnect()
  }, [raster])

  const commit = (next: Grid) =>
    setHistory((h) => {
      if (!h || next === h.steps[h.index]) return h
      const steps = [...h.steps.slice(0, h.index + 1), next]
      return { steps, index: steps.length - 1 }
    })

  const undo = () => setHistory((h) => (h && h.index > 0 ? { ...h, index: h.index - 1 } : h))
  const redo = () => setHistory((h) => (h && h.index < h.steps.length - 1 ? { ...h, index: h.index + 1 } : h))
  const discard = () => setHistory((h) => (h ? { steps: [h.steps[0]], index: 0 } : h))

  // Tastenkürzel: ⌘Z, ⇧⌘Z und Werkzeuge
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const match = TOOLS.find((t) => t.key === event.key.toLowerCase())
      if (match) setTool(match.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cellAt = (event: PointerEvent): Cell | null => {
    const canvas = canvasRef.current
    if (!canvas || !raster) return null
    const box = canvas.getBoundingClientRect()
    const col = Math.floor(((event.clientX - box.left) / box.width) * raster.breite)
    const row = Math.floor(((event.clientY - box.top) / box.height) * raster.hoehe)
    if (row < 0 || col < 0 || row >= raster.hoehe || col >= raster.breite) return null
    return { row, col }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !raster || !grid || building) return
    const cell = cellAt(event)
    if (!cell) return
    if (tool === 'pipette') {
      setColor(grid[cell.row][cell.col])
      setTool('pinsel')
      return
    }
    if (color === null) return
    if (tool === 'fuellen') {
      commit(paint(grid, raster, fillCells(grid, raster, cell), color))
      return
    }
    const rectangle = tool === 'rechteck' ? { from: cell, to: cell } : null
    drawing.current = { grid: rectangle ? grid : paint(grid, raster, [cell], color), last: cell, rect: rectangle }
    if (rectangle) setRect(rectangle)
    else setStroke(drawing.current.grid)
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent) => {
    const cell = cellAt(event)
    setHover(cell ? { cell, x: event.clientX, y: event.clientY } : null)
    const current = drawing.current
    if (!current || !cell || !raster || color === null) return
    if (current.rect) {
      current.rect = { ...current.rect, to: cell }
      setRect(current.rect)
    } else {
      current.grid = paint(current.grid, raster, lineCells(current.last, cell), color)
      setStroke(current.grid)
    }
    current.last = cell
  }

  const onPointerUp = () => {
    const current = drawing.current
    if (!current) return
    drawing.current = null
    if (current.rect && raster && color !== null) commit(paint(current.grid, raster, rectCells(current.rect.from, current.rect.to), color))
    else commit(current.grid)
    setStroke(null)
    setRect(null)
  }

  const onWheel = (event: WheelEvent) => {
    // Pinch auf dem Trackpad oder Strg + Mausrad zoomt, sonst wird gescrollt
    if (!event.ctrlKey) return
    event.preventDefault()
    setScale((s) => Math.min(Math.max(s * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 1), 8))
  }

  if (error) return <div className="guide guide--empty">{error}</div>
  if (!raster || !grid) return <div className="guide guide--empty">Noppenraster wird geladen …</div>

  const current = color !== null ? colorById.get(color) : undefined
  const hovered = hover ? { frame: isFrame(raster, hover.cell), color: colorById.get(grid[hover.cell.row][hover.cell.col]) } : null
  const studPx = fit * scale
  const rectBox = rect && {
    left: Math.min(rect.from.col, rect.to.col),
    top: Math.min(rect.from.row, rect.to.row),
    width: Math.abs(rect.from.col - rect.to.col) + 1,
    height: Math.abs(rect.from.row - rect.to.row) + 1,
  }

  return (
    <div className="stud-editor">
      <Glass variant="clear" className="editor-toolbar" role="toolbar" aria-label="Werkzeuge">
        <div className="mini-segmented" role="radiogroup" aria-label="Werkzeug">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tool === t.id} onClick={() => setTool(t.id)} title={`${t.label} (${t.key.toUpperCase()})`}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="swatch-button editor-toolbar__color" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <span className="swatch" style={{ background: current?.hex }} />
          <span>{current?.name ?? 'Farbe'}</span>
        </button>
        <button type="button" className="icon-button" onClick={undo} disabled={!history || history.index === 0} aria-label="Rückgängig" title="Rückgängig (⌘Z)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 5 3.5 9l4 4M4 9h7.5a5 5 0 0 1 0 10H9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="icon-button" onClick={redo} disabled={!history || history.index >= history.steps.length - 1} aria-label="Wiederholen" title="Wiederholen (⇧⌘Z)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5 4 4-4 4M16 9H8.5a5 5 0 0 0 0 10H11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {picking && (
          <div className="editor-colors">
            <p className="editor-colors__title">Im Mosaik</p>
            <div className="swatches">
              {used.map((c) => (
                <ColorButton key={c.id} id={c.id} hex={c.hex} name={colorById.get(c.id)?.name ?? c.name} selected={c.id === color} onPick={(id) => { setColor(id); setPicking(false) }} />
              ))}
            </div>
            {more.length > 0 && (
              <>
                <p className="editor-colors__title">Weitere Farben</p>
                <div className="swatches">
                  {more.map((c) => (
                    <ColorButton key={c.id} id={c.id} hex={c.hex} name={c.lego_name ?? c.name} selected={c.id === color} onPick={(id) => { setColor(id); setPicking(false) }} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Glass>

      <div ref={areaRef} className="stud-editor__area" onWheel={onWheel}>
        <div className="stud-editor__board" style={{ width: raster.breite * studPx, height: raster.hoehe * studPx }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Noppenraster mit ${raster.breite} × ${raster.hoehe} Noppen`}
            data-tool={tool}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHover(null)}
          />
          {rectBox && current && (
            <span
              className="stud-editor__rect"
              style={{
                left: `${(rectBox.left / raster.breite) * 100}%`,
                top: `${(rectBox.top / raster.hoehe) * 100}%`,
                width: `${(rectBox.width / raster.breite) * 100}%`,
                height: `${(rectBox.height / raster.hoehe) * 100}%`,
                background: current.hex,
              }}
            />
          )}
        </div>
      </div>

      {hover && hovered && !stroke && !rect && (
        <Glass variant="clear" className="part-tip" style={{ transform: `translate(${hover.x + 16}px, ${hover.y + 16}px)` }} role="status">
          <span className="part-tip__swatch" style={{ background: hovered.color?.hex }} />
          <span>
            <strong>{hovered.frame ? 'Rahmen, nicht änderbar' : hovered.color?.name}</strong>
            <span className="part-tip__meta">
              Zeile {hover.cell.row + 1}, Spalte {hover.cell.col + 1}
            </span>
          </span>
        </Glass>
      )}

      <Glass variant="clear" className="editor-actions" role="group" aria-label="Änderungen">
        {onPrevious && changes === 0 && (
          <button type="button" className="chip" onClick={onPrevious} disabled={building}>
            Vorherige Version
          </button>
        )}
        <span className="editor-actions__count">
          {changes === 0 ? 'Tippe auf Noppen, um sie umzufärben' : `${number(changes)} ${changes === 1 ? 'Noppe' : 'Noppen'} geändert`}
        </span>
        {changes > 0 && (
          <>
            <button type="button" className="link-button" onClick={discard} disabled={building}>
              Verwerfen
            </button>
            <button
              type="button"
              className="action-button action-button--small"
              onClick={() => {
                if (!original || !grid) return
                drafts.delete(mosaic.id)
                onApply(toEditRequest(original, grid))
              }}
              disabled={building}
            >
              Übernehmen
            </button>
          </>
        )}
      </Glass>
    </div>
  )
}

function ColorButton({ id, hex, name, selected, onPick }: { id: number; hex: string; name: string; selected: boolean; onPick: (id: number) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="swatch swatch--pick"
      data-light={isLight(hex) || undefined}
      style={{ background: hex }}
      title={name}
      aria-label={name}
      onClick={() => onPick(id)}
    />
  )
}
