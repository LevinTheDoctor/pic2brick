import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ApiError,
  createMosaic,
  getColors,
  getHealth,
  getOptions,
  type Color,
  type Health,
  type Options,
} from './api/client'
import { BuildingOverlay } from './components/BuildingOverlay'
import { Dock, type View } from './components/Dock'
import { DropZone } from './components/DropZone'
import { Glass, GlassFilter } from './components/Glass'
import { InstructionsViewer } from './components/InstructionsViewer'
import { QuickPreview } from './components/QuickPreview'
import { ResultSheet } from './components/ResultSheet'
import { ServerNotice } from './components/ServerNotice'
import { SettingsSheet } from './components/SettingsSheet'
import { TopView } from './components/TopView'
import { buildColorTable } from './lib/colors'
import { asList, colorHex, computeSize, effective, previewPalette, serialize, type Value, type Values } from './lib/form'
import { forgetMosaic, loadRecent, rememberMosaic, type RecentMosaic } from './lib/history'
import { studsToCm } from './lib/labels'
import { instructionPages, loadDemo, loadMosaic, type LoadedMosaic } from './lib/mosaic'
import type { PreviewSettings } from './lib/pixelate'
import type { CameraPreset } from './three/MosaicScene'

// three.js erst laden, wenn ein Mosaik gezeigt wird
const Stage3D = lazy(() => import('./components/Stage3D').then((m) => ({ default: m.Stage3D })))

interface Photo {
  file: File
  url: string
  bitmap: ImageBitmap
}

type Panel = 'settings' | 'result' | null

export default function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'offline'>('checking')
  const [health, setHealth] = useState<Health | null>(null)
  const [options, setOptions] = useState<Options | null>(null)
  const [catalog, setCatalog] = useState<Color[] | null>(null)

  const [photo, setPhoto] = useState<Photo | null>(null)
  const [values, setValues] = useState<Values>({})
  const [building, setBuilding] = useState<{ controller: AbortController; startedAt: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [mosaic, setMosaic] = useState<LoadedMosaic | null>(null)
  const [view, setView] = useState<View>('3d')
  const [step, setStep] = useState(0)
  const [animateStep, setAnimateStep] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [camera, setCamera] = useState<{ preset: CameraPreset; nonce: number }>({ preset: 'angle', nonce: 0 })

  const [recent, setRecent] = useState<RecentMosaic[]>(loadRecent)
  const [panel, setPanel] = useState<Panel>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Server, Optionen und Farbkatalog
  const connect = useCallback(
    () =>
      Promise.all([getHealth(), getOptions(), getColors()]).then(
        ([h, o, c]) => {
          setHealth(h)
          setOptions(o)
          setCatalog(c)
          setStatus('ok')
        },
        () => setStatus('offline'),
      ),
    [],
  )

  useEffect(() => {
    void connect()
  }, [connect])

  const reconnect = () => {
    setStatus('checking')
    void connect()
  }

  const choosePhoto = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Das ist kein Bild. Wähle eine JPG- oder PNG-Datei.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Das Bild ist größer als 20 MB. Verkleinere es oder wähle ein anderes.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      setPhoto((old) => {
        if (old) {
          URL.revokeObjectURL(old.url)
          old.bitmap.close()
        }
        return { file, url: URL.createObjectURL(file), bitmap }
      })
      setMosaic(null)
      setFocus(null)
      setError(null)
      setPanel(null)
    } catch {
      setError('Dieses Bild lässt sich nicht öffnen. Wähle eine JPG- oder PNG-Datei.')
    }
  }, [])

  const showMosaic = useCallback((loaded: LoadedMosaic, remember = true) => {
    const last = Math.max((loaded.model?.steps.length ?? 1) - 1, 0)
    setMosaic(loaded)
    setStep(last)
    setAnimateStep(false)
    setPlaying(false)
    setFocus(null)
    setView(loaded.model ? '3d' : 'top')
    setPanel(null)
    setError(null)
    const s = loaded.result.statistik
    if (remember)
      setRecent(
        rememberMosaic({
          id: loaded.id,
          title: loaded.result.titel,
          width: s.breite,
          height: s.hoehe,
          preview: loaded.files['vorschau.png'] ?? null,
          createdAt: new Date().toISOString(),
        }),
      )
  }, [])

  const openRecent = async (id: string) => {
    try {
      showMosaic(await loadMosaic(id))
      setPhoto(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Das Mosaik konnte nicht geladen werden.')
    }
  }

  const openDemo = async () => {
    try {
      showMosaic(await loadDemo(), false)
      setPhoto(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const build = async () => {
    if (!photo) return
    const controller = new AbortController()
    setBuilding({ controller, startedAt: Date.now() })
    setError(null)
    try {
      const created = await createMosaic(photo.file, serialize(values), controller.signal)
      showMosaic(await loadMosaic(created.id))
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setError(e instanceof ApiError ? e.message : 'Beim Bauen ist etwas schiefgelaufen. Versuche es noch einmal.')
    } finally {
      setBuilding(null)
    }
  }

  const changeValue = (field: string, value: Value | undefined) =>
    setValues((old) => {
      const next = { ...old }
      if (value === undefined) delete next[field]
      else next[field] = value
      return next
    })

  const handleStep = useCallback((next: number, animate: boolean) => {
    setStep(next)
    setAnimateStep(animate)
  }, [])

  // Farben fürs 3D-Modell
  const colors = useMemo(() => buildColorTable(mosaic?.result.palette, catalog ?? undefined), [mosaic, catalog])

  // Schnellvorschau
  const aspect = photo ? photo.bitmap.width / photo.bitmap.height : 1
  const size = computeSize(options, values, aspect)
  const previewSettings: PreviewSettings = useMemo(() => {
    const frame = Number(effective(options, values, 'rahmen') ?? 1)
    return {
      width: size.width,
      height: size.height,
      fit: effective(options, values, 'modus') === 'einpassen' ? 'einpassen' : 'zuschneiden',
      contrast: Number(effective(options, values, 'kontrast') ?? 1),
      saturation: Number(effective(options, values, 'saettigung') ?? 1),
      palette: previewPalette(options, values, catalog),
      frame,
      frameColor: colorHex(catalog, (effective(options, values, 'rahmenfarbe') as number | null) ?? 0, '#05131D'),
      padColor: '#FFFFFF',
    }
  }, [options, values, catalog, size.width, size.height])

  const pages = mosaic ? instructionPages(mosaic.files) : []
  const outputs = asList(effective(options, values, 'ausgaben'))
  const title = mosaic?.result.titel ?? (photo ? photo.file.name.replace(/\.[^.]+$/, '') : null)
  const stats = mosaic?.result.statistik

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !building) void choosePhoto(file)
  }

  return (
    <div
      className="app"
      data-mode={mosaic ? 'result' : photo ? 'compose' : 'empty'}
      data-panel={panel ?? 'none'}
      data-left={photo ? 'open' : 'none'}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <GlassFilter />

      <main className="stage">
        {mosaic && view === '3d' && mosaic.model && (
          <Suspense fallback={null}>
            <Stage3D
              mosaic={mosaic}
              colors={colors}
              step={step}
              animateStep={animateStep}
              focus={focus}
              camera={camera}
              layout={`${panel}-${photo ? 1 : 0}`}
            />
          </Suspense>
        )}
        {mosaic && view === 'top' && mosaic.files['vorschau.png'] && (
          <TopView src={mosaic.files['vorschau.png']} title={mosaic.result.titel} />
        )}
        {mosaic && view === 'guide' && <InstructionsViewer pages={pages} pdf={mosaic.files['anleitung.pdf']} />}
        {!mosaic && photo && (
          <QuickPreview image={photo.bitmap} settings={previewSettings} building={!!building} />
        )}
        {!mosaic && !photo && (
          <DropZone
            onFile={choosePhoto}
            recent={recent}
            onOpen={openRecent}
            onForget={(id) => setRecent(forgetMosaic(id))}
            onDemo={import.meta.env.DEV ? openDemo : undefined}
            dragging={dragging}
          />
        )}
      </main>

      <header className="topbar">
        <Glass variant="clear" className="brand">
          <button
            type="button"
            className="brand__home"
            onClick={() => {
              setMosaic(null)
              setPhoto(null)
              setPanel(null)
            }}
            aria-label="Pic2Brick, zur Startseite"
          >
            <img src="/favicon.svg" alt="" className="brand__mark" />
            <span className="brand__name">Pic2Brick</span>
          </button>
          {title && (
            <span className="brand__title">
              <span className="brand__mosaic">{title}</span>
              {stats && (
                <span className="brand__size">
                  {stats.breite} × {stats.hoehe} Noppen, {studsToCm(stats.breite)} × {studsToCm(stats.hoehe)} cm
                </span>
              )}
            </span>
          )}
        </Glass>
        <ServerNotice status={status} health={health} onRetry={reconnect} />
        {(photo || mosaic) && (
          <Glass as="div" variant="clear" className="topbar__actions">
            <button type="button" className="chip chip--strong" onClick={() => fileInput.current?.click()} disabled={!!building}>
              Neues Foto
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void choosePhoto(file)
                e.target.value = ''
              }}
            />
          </Glass>
        )}
      </header>

      {photo && (
        <Glass as="aside" className="sheet sheet--left" aria-label="Einstellungen">
          <div className="sheet__head">
            <h2>Einstellungen</h2>
            <button type="button" className="icon-button sheet__close" onClick={() => setPanel(null)} aria-label="Einstellungen schließen">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
          {options ? (
            <SettingsSheet
              options={options}
              catalog={catalog}
              values={values}
              onChange={changeValue}
              onReplace={setValues}
              aspect={aspect}
              fileName={photo.file.name}
              building={!!building}
              onBuild={build}
            />
          ) : (
            <p className="sheet__empty">
              {status === 'checking'
                ? 'Verbinde mit dem Server …'
                : 'Ohne Server gibt es keine Einstellungen. Die Schnellvorschau zeigt trotzdem, wie das Foto als Mosaik ungefähr aussieht.'}
            </p>
          )}
        </Glass>
      )}

      {mosaic && (
        <Glass as="aside" className="sheet sheet--right" aria-label="Teile und Farben">
          <div className="sheet__head">
            <h2>{mosaic.result.titel}</h2>
            <button type="button" className="icon-button sheet__close" onClick={() => setPanel(null)} aria-label="Teile und Farben schließen">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
          <ResultSheet
            mosaic={mosaic}
            focus={focus}
            onFocus={(code) => {
              setFocus(code)
              if (code !== null && view !== '3d' && mosaic.model) setView('3d')
            }}
          />
        </Glass>
      )}

      {building && (
        <BuildingOverlay
          startedAt={building.startedAt}
          withGuide={outputs.includes('instructions_png')}
          onCancel={() => building.controller.abort()}
        />
      )}

      {error && (
        <Glass variant="clear" className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="icon-button" onClick={() => setError(null)} aria-label="Meldung schließen">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </Glass>
      )}

      {(mosaic || photo) && (
        <div className="dock-wrap">
          {mosaic ? (
            <Dock
              view={view}
              onView={setView}
              steps={mosaic.model?.steps ?? []}
              step={step}
              onStep={handleStep}
              playing={playing}
              onPlaying={setPlaying}
              onCamera={(preset) => setCamera((c) => ({ preset, nonce: c.nonce + 1 }))}
              hasModel={!!mosaic.model}
              hasGuide={pages.length > 0}
            />
          ) : null}
          <Glass as="nav" variant="clear" className="panel-tabs" aria-label="Flächen">
            {photo && (
              <button type="button" className="chip" aria-pressed={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
                Einstellungen
              </button>
            )}
            {mosaic && (
              <button type="button" className="chip" aria-pressed={panel === 'result'} onClick={() => setPanel(panel === 'result' ? null : 'result')}>
                Teile und Farben
              </button>
            )}
            {photo && !mosaic && options && (
              <button type="button" className="action-button action-button--small" onClick={build} disabled={!!building}>
                Mosaik bauen
              </button>
            )}
          </Glass>
        </div>
      )}
    </div>
  )
}
