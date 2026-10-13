import { useMemo, useState } from 'react'
import {
  ApiError,
  estimatePrices,
  fileUrl,
  getBrickLinkExport,
  getPrices,
  type BrickLinkExport,
  type PriceEstimate,
  type PriceSummary,
} from '../api/client'
import { number } from '../lib/labels'
import type { LoadedMosaic } from '../lib/mosaic'

const REGIONS: Record<string, string> = {
  europe: 'in Europa',
  north_america: 'in Nordamerika',
  south_america: 'in Südamerika',
  asia: 'in Asien',
  africa: 'in Afrika',
  middle_east: 'im Nahen Osten',
  australia_oceania: 'in Australien und Ozeanien',
}
const VAT: Record<string, string> = { Y: 'mit MwSt.', N: 'ohne MwSt.', O: 'mit norwegischer MwSt.' }

const money = (value: number | null | undefined, currency: string) =>
  value == null
    ? '–'
    : value.toLocaleString('de-DE', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Sehr kleine Stückpreise (0,0213 €) brauchen mehr Stellen. */
const unitPrice = (value: number | null, currency: string) =>
  value == null
    ? '–'
    : value.toLocaleString('de-DE', { style: 'currency', currency, minimumFractionDigits: 3, maximumFractionDigits: 3 })

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : null

function conditions(estimate: PriceEstimate) {
  const state = estimate.zustand === 'U' ? 'Gebraucht' : 'Neu'
  const where = estimate.land ? `aus ${estimate.land}` : estimate.region ? (REGIONS[estimate.region] ?? estimate.region) : 'weltweit'
  const vat = VAT[estimate.mwst]
  return vat ? `${state}, Verkäufer ${where}, ${vat}` : `${state}, Verkäufer ${where}.`
}

type Status = { kind: 'idle' } | { kind: 'loading'; force: boolean } | { kind: 'error'; message: string; status: number }

/** Preis bei BrickLink schätzen und die Wanted List zum Bestellen kopieren. */
export function PriceSection({ mosaic }: { mosaic: LoadedMosaic }) {
  const [summary, setSummary] = useState<PriceSummary | null>(mosaic.result.preise ?? null)
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [showLines, setShowLines] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [order, setOrder] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'copied'; data: BrickLinkExport } | { kind: 'failed'; message: string }
  >({ kind: 'idle' })

  const lines = useMemo(
    () => [...(estimate?.positionen ?? [])].sort((a, b) => (b.summe_verkauft ?? -1) - (a.summe_verkauft ?? -1)),
    [estimate],
  )

  if (mosaic.demo)
    return (
      <section className="result__section" aria-labelledby="price-title">
        <h3 id="price-title">Kosten</h3>
        <p className="section-note">Preise schätzt der Server bei BrickLink, deshalb gibt es sie nur für Mosaike, die er gebaut hat.</p>
      </section>
    )

  const run = async (options: { offline?: boolean; force?: boolean } = {}) => {
    setStatus({ kind: 'loading', force: !!options.force })
    try {
      const result = await estimatePrices(mosaic.id, options)
      setEstimate(result)
      setSummary(result)
      setStatus({ kind: 'idle' })
    } catch (e) {
      const error = e instanceof ApiError ? e : new ApiError('Die Preise konnten nicht geladen werden.', 0)
      setStatus({ kind: 'error', message: error.message, status: error.status })
    }
  }

  const toggleLines = async () => {
    if (showLines) return setShowLines(false)
    setShowLines(true)
    if (estimate) return
    try {
      setEstimate(await getPrices(mosaic.id))
    } catch (e) {
      setShowLines(false)
      setStatus({ kind: 'error', message: (e as Error).message, status: (e as ApiError).status ?? 0 })
    }
  }

  const copyWantedList = async () => {
    setOrder({ kind: 'loading' })
    try {
      const data = await getBrickLinkExport(mosaic.id)
      await navigator.clipboard.writeText(data.xml)
      setOrder({ kind: 'copied', data })
    } catch (e) {
      setOrder({
        kind: 'failed',
        message:
          e instanceof ApiError
            ? e.message
            : 'Kopieren ging nicht. Lade die Wanted List stattdessen als Datei herunter und lade sie bei BrickLink hoch.',
      })
    }
  }

  const currency = summary?.waehrung ?? 'EUR'
  // Offline ohne Cache: alles fehlt, die Summe 0 wäre irreführend
  const empty = !!summary && summary.summe_verkauft === 0 && summary.fehlend > 0
  const loading = status.kind === 'loading'
  const uploadUrl = estimate?.upload_url ?? (order.kind === 'copied' ? order.data.upload_url : 'https://www.bricklink.com/v2/wanted/upload.page')
  const visibleLines = showAll ? lines : lines.slice(0, 10)

  return (
    <section className="result__section price" aria-labelledby="price-title" aria-busy={loading}>
      <div className="section-head">
        <h3 id="price-title">Kosten</h3>
        {summary?.stand && <span className="section-meta">Stand {date(summary.stand)}</span>}
      </div>

      {summary && !empty ? (
        <>
          <p className="price__amount">ca. {money(summary.summe_verkauft, currency)}</p>
          <p className="section-note">
            Durchschnitt der Verkäufe bei BrickLink in den letzten 6 Monaten. Aktuelle Angebote liegen bei{' '}
            {money(summary.summe_angeboten, currency)}.{estimate && <> {conditions(estimate)}</>}
          </p>
          {!summary.vollstaendig && (
            <p className="price__warning">
              {summary.fehlend === 1
                ? 'Für 1 Position fehlt ein Preis, die Summe ist deshalb etwas zu niedrig.'
                : `Für ${summary.fehlend} Positionen fehlt ein Preis, die Summe ist deshalb zu niedrig.`}
            </p>
          )}
          <div className="price__actions">
            <button type="button" className="chip" onClick={toggleLines} aria-expanded={showLines}>
              {showLines ? 'Einzelpreise ausblenden' : 'Einzelpreise zeigen'}
            </button>
            <button type="button" className="link-button" onClick={() => run({ force: true })} disabled={loading}>
              {loading ? 'Frage BrickLink …' : 'Neu abfragen'}
            </button>
          </div>
        </>
      ) : (
        <>
          {empty && (
            <p className="price__warning">Für dieses Mosaik sind noch keine Preise gespeichert. Frag sie bei BrickLink ab.</p>
          )}
          <p className="section-note">
            Was die {number(mosaic.parts.reduce((sum, p) => sum + p.count, 0) || mosaic.result.statistik.teile)} Teile bei
            BrickLink ungefähr kosten. Die Abfrage dauert bei großen Mosaiken einige Sekunden.
          </p>
          <button type="button" className="action-button action-button--small" onClick={() => run()} disabled={loading}>
            {loading ? 'Frage BrickLink …' : 'Preis schätzen'}
          </button>
        </>
      )}

      {loading && (
        <p className="price__loading" role="status">
          <span className="mini-bricks" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {status.force ? 'Alle Preise werden neu abgefragt.' : `Preise für ${mosaic.parts.length} Positionen werden abgefragt.`}
        </p>
      )}

      {status.kind === 'error' && (
        <div className="problems" role="alert">
          <p>{status.message}</p>
          <div className="price__actions">
            <button type="button" className="chip" onClick={() => run()}>
              Erneut versuchen
            </button>
            {status.status === 503 && (
              <button type="button" className="chip" onClick={() => run({ offline: true })}>
                Gespeicherte Preise zeigen
              </button>
            )}
          </div>
        </div>
      )}

      {showLines && estimate && (
        <>
          <table className="parts price__lines">
            <thead>
              <tr>
                <th scope="col">Teil</th>
                <th scope="col" className="num">Stück</th>
                <th scope="col" className="num">Summe</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line) => (
                <tr key={`${line.teil}-${line.farbe}`} data-missing={line.summe_verkauft == null || undefined}>
                  <td>
                    {line.name}
                    <span className="parts__id">
                      {line.anzahl} × {line.farbe}
                      {line.hinweis && <>, {line.hinweis}</>}
                    </span>
                  </td>
                  <td className="num">{unitPrice(line.stueck_verkauft, estimate.waehrung)}</td>
                  <td className="num">{money(line.summe_verkauft, estimate.waehrung)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="price__actions">
            {lines.length > 10 && (
              <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Weniger zeigen' : `Alle ${lines.length} Positionen zeigen`}
              </button>
            )}
            <a className="link-button" href={fileUrl(mosaic.id, 'preise_bricklink.csv')} download="preise_bricklink.csv">
              Preise als Tabelle laden
            </a>
          </div>
        </>
      )}

      <div className="order">
        <h4>Bei BrickLink bestellen</h4>
        <ol className="order__steps">
          <li>
            <span className="order__text">Wanted List kopieren</span>
            <button type="button" className="chip chip--strong" onClick={copyWantedList} disabled={order.kind === 'loading'}>
              {order.kind === 'copied' ? 'Kopiert' : order.kind === 'loading' ? 'Kopiere …' : 'Kopieren'}
            </button>
          </li>
          <li>
            <span className="order__text">Bei BrickLink einfügen</span>
            <a className="chip" href={uploadUrl} target="_blank" rel="noreferrer">
              BrickLink öffnen
            </a>
          </li>
        </ol>
        {order.kind === 'copied' && (
          <p className="section-note" role="status">
            {order.data.positionen} Positionen mit {number(order.data.teile)} Teilen kopiert.
            {order.data.ausgelassen.length > 0 && (
              <> Nicht dabei, weil BrickLink die Farbe nicht kennt: {order.data.ausgelassen.join(', ')}.</>
            )}
          </p>
        )}
        {order.kind === 'failed' && (
          <p className="problems" role="alert">
            {order.message}
          </p>
        )}
      </div>
    </section>
  )
}
