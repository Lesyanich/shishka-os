import { useCallback, useMemo, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { useCatalogImport } from '../../hooks/useCatalogImport'
import {
  buildImportRows,
  CATALOG_SOURCES,
  FIELD_LABELS,
  parseCatalogText,
  SOURCE_LABELS,
  type CatalogField,
  type CatalogImportResult,
  type CatalogImportRow,
  type CatalogSource,
  type ColumnMap,
  type ParsedCatalog,
} from '../../types/catalogImport'

/**
 * Import a supplier's price list into supplier_catalog (mig 394).
 *
 * Preview and commit are the same RPC with `p_dry_run` flipped, so what the
 * preview promises is exactly what commit does. The preview deliberately states
 * how many rows will land WITHOUT a link and WITHOUT a pack size: those are not
 * warnings to dismiss, they are the honest description of what is about to be
 * stored, and a row with no pack size cannot be price-compared at all.
 */

const FIELD_OPTIONS: CatalogField[] = [
  'name',
  'sku',
  'barcode',
  'price',
  'pack',
  'package_unit',
  'brand',
  'ignore',
]

const LABEL = 'mb-0.5 block text-[10px] uppercase tracking-wide text-cream/45'
const INPUT =
  'h-8 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-xs text-cream outline-none focus:border-forest-soft'

/** One sentence a human can act on, or null when there is nothing to say yet. */
export function previewHeadline(res: CatalogImportResult | null): string | null {
  if (!res) return null
  if (!res.ok) return res.error ?? 'Import failed'
  const parts = [`${res.inserted ?? 0} new`, `${res.updated ?? 0} updated`]
  if (res.skipped) parts.push(`${res.skipped} skipped`)
  if (res.duplicates_in_payload) parts.push(`${res.duplicates_in_payload} duplicated in the list`)
  return parts.join(' · ')
}

/**
 * A small import that updates almost nothing usually means the parse or the
 * supplier is wrong, not that the list was already current. Worth saying out
 * loud before the user walks away believing it worked.
 */
export function suspiciouslyFewUpdates(res: CatalogImportResult | null): boolean {
  if (!res?.ok) return false
  const received = res.received ?? 0
  if (received < 20) return false
  return (res.updated ?? 0) === 0 && (res.inserted ?? 0) === received
}

interface Props {
  supplierId: string
  supplierName: string
  onImported?: () => void
}

export function CatalogImportPanel({ supplierId, supplierName, onImported }: Props) {
  const { isBusy, preview, result, error, runPreview, commit, reset } = useCatalogImport()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'paste' | 'single'>('paste')
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedCatalog | null>(null)
  const [columns, setColumns] = useState<ColumnMap>([])
  const [source, setSource] = useState<CatalogSource>('pricelist')
  const [sourceDetail, setSourceDetail] = useState('')
  const [single, setSingle] = useState({
    name: '',
    sku: '',
    barcode: '',
    price: '',
    packQty: '',
    packUnit: '',
  })

  const built = useMemo(
    () => (parsed ? buildImportRows(parsed, columns) : null),
    [parsed, columns],
  )

  const reparse = useCallback((raw: string) => {
    setText(raw)
    reset()
    if (!raw.trim()) {
      setParsed(null)
      setColumns([])
      return
    }
    const p = parseCatalogText(raw)
    setParsed(p)
    setColumns(p.columns)
  }, [reset])

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return
      reparse(await file.text())
    },
    [reparse],
  )

  const closePanel = useCallback(() => {
    setOpen(false)
    setText('')
    setParsed(null)
    setColumns([])
    reset()
  }, [reset])

  const args = useMemo(
    () => ({
      supplierId,
      source,
      sourceDetail: sourceDetail.trim() || null,
      rows: built?.rows ?? [],
    }),
    [supplierId, source, sourceDetail, built],
  )

  const doCommit = useCallback(async () => {
    const res = await commit(args)
    if (res.ok) {
      onImported?.()
      setText('')
      setParsed(null)
      setColumns([])
    }
  }, [args, commit, onImported])

  const doSingle = useCallback(async () => {
    const row: CatalogImportRow = {
      name: single.name.trim() || null,
      sku: single.sku.trim() || null,
      barcode: single.barcode.trim() || null,
      price: single.price ? Number(single.price) : null,
      package_qty: single.packQty ? Number(single.packQty) : null,
      package_unit: single.packUnit.trim() || null,
    }
    const res = await commit({
      supplierId,
      source: 'manual',
      sourceDetail: sourceDetail.trim() || null,
      rows: [row],
    })
    if (res.ok) {
      onImported?.()
      setSingle({ name: '', sku: '', barcode: '', price: '', packQty: '', packUnit: '' })
    }
  }, [single, supplierId, sourceDetail, commit, onImported])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center rounded-md border border-forest-soft/60 bg-forest-soft/10 px-2.5 text-[11px] font-medium text-mint-200 hover:bg-forest-soft/20"
      >
        <Upload className="mr-1 h-3 w-3" />
        Import catalog
      </button>
    )
  }

  const shown = built?.rows.slice(0, 15) ?? []

  return (
    <div className="rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {(['paste', 'single'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={[
                'rounded-md px-2 py-1 text-[11px] font-medium transition',
                mode === m
                  ? 'bg-forest-soft/20 text-mint-200 ring-1 ring-inset ring-forest-soft/40'
                  : 'text-cream/45 hover:text-cream/80',
              ].join(' ')}
            >
              {m === 'paste' ? 'Paste price list' : 'Add one item'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={closePanel}
          className="rounded-md p-1 text-cream/60 hover:bg-[var(--s-3)] hover:text-cream"
          aria-label="Close import"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <span className={LABEL}>Where it came from</span>
          <select
            value={mode === 'single' ? 'manual' : source}
            disabled={mode === 'single'}
            onChange={(e) => setSource(e.target.value as CatalogSource)}
            className={INPUT}
          >
            {CATALOG_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={LABEL}>Note (optional)</span>
          <input
            type="text"
            value={sourceDetail}
            onChange={(e) => setSourceDetail(e.target.value)}
            placeholder="e.g. LINE list 29 Jul"
            className={INPUT}
          />
        </div>
      </div>

      {mode === 'paste' ? (
        <>
          <textarea
            value={text}
            onChange={(e) => reparse(e.target.value)}
            rows={5}
            placeholder={`Paste the price list — tab or comma separated.\nชื่อสินค้า\tราคา\tขนาด`}
            className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-1)] p-2 font-mono text-[11px] text-cream outline-none focus:border-forest-soft"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              className="text-[11px] text-cream/60 file:mr-2 file:rounded-md file:border file:border-[var(--line-strong)] file:bg-[var(--s-1)] file:px-2 file:py-1 file:text-[11px] file:text-cream/80"
            />
          </div>

          {parsed && built && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                {columns.map((f, i) => (
                  <div key={i}>
                    <span className={LABEL}>Column {i + 1}</span>
                    <select
                      value={f}
                      onChange={(e) => {
                        const next = [...columns]
                        next[i] = e.target.value as CatalogField
                        setColumns(next)
                        reset()
                      }}
                      className="h-7 rounded-md border border-[var(--line-strong)] bg-[var(--s-1)] px-1.5 text-[11px] text-cream outline-none focus:border-forest-soft"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {FIELD_LABELS[opt]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-cream/60">
                {built.rows.length} row{built.rows.length === 1 ? '' : 's'} ready
                {built.issues.length > 0 && (
                  <span className="text-brick-bright"> · {built.issues.length} need attention</span>
                )}
                {built.duplicateKeys.length > 0 && (
                  <span className="text-cream/45">
                    {' '}
                    · {built.duplicateKeys.length} duplicated in the list
                  </span>
                )}
              </p>

              {shown.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-md border border-[var(--line)]">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[var(--s-1)] text-cream/45">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">Product</th>
                        <th className="px-2 py-1 text-left font-medium">SKU / barcode</th>
                        <th className="px-2 py-1 text-right font-medium">Price</th>
                        <th className="px-2 py-1 text-left font-medium">Pack</th>
                        {preview?.rows && (
                          <th className="px-2 py-1 text-left font-medium">Status</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, i) => {
                        const v = preview?.rows?.[i]
                        return (
                          <tr key={i} className="border-t border-[var(--line)]">
                            <td className="max-w-[14rem] truncate px-2 py-1 text-cream/80">
                              {r.name ?? '—'}
                            </td>
                            <td className="px-2 py-1 text-cream/45">
                              {r.sku ?? r.barcode ?? '—'}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-cream/80">
                              {r.price != null ? `฿${r.price.toLocaleString()}` : '—'}
                            </td>
                            <td className="px-2 py-1 text-cream/45">
                              {r.package_qty != null
                                ? `${r.package_qty} ${r.package_unit ?? ''}`.trim()
                                : '—'}
                            </td>
                            {preview?.rows && (
                              <td className="px-2 py-1">
                                {v ? (
                                  <span className={v.status === 'new' ? 'text-mint-200' : 'text-cream/60'}>
                                    {v.status}
                                    {!v.linked && <span className="text-cream/45"> · unlinked</span>}
                                    {!v.pack_known && (
                                      <span className="text-brick-bright"> · no pack</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-cream/30">—</span>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {built.rows.length > shown.length && (
                    <p className="px-2 py-1 text-[10px] text-cream/45">
                      showing {shown.length} of {built.rows.length}
                    </p>
                  )}
                </div>
              )}

              {built.issues.length > 0 && (
                <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[10px] text-brick-bright">
                  {built.issues.slice(0, 10).map((iss, i) => (
                    <li key={i}>
                      line {iss.row}: {iss.reason}
                    </li>
                  ))}
                </ul>
              )}

              {preview?.ok && (
                <div className="rounded-md border border-[var(--line)] bg-[var(--s-1)] px-2.5 py-2 text-[11px] text-cream/80">
                  <p>{previewHeadline(preview)}</p>
                  <p className="mt-0.5 text-cream/45">
                    {preview.unlinked ?? 0} will land unlinked (they go to the matching queue) ·{' '}
                    {preview.pack_unknown ?? 0} have no pack size and cannot be price-compared
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy || built.rows.length === 0}
                  onClick={() => void runPreview(args)}
                  className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--s-1)] px-3 text-xs text-cream/80 hover:bg-[var(--s-3)] disabled:opacity-50"
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Preview'}
                </button>
                <button
                  type="button"
                  disabled={isBusy || !preview?.ok || built.rows.length === 0}
                  onClick={() => void doCommit()}
                  className="inline-flex h-8 items-center rounded-md border border-forest-soft/60 bg-forest-soft/15 px-3 text-xs font-medium text-mint-200 hover:bg-forest-soft/25 disabled:opacity-50"
                  title={preview?.ok ? undefined : 'Run the preview first'}
                >
                  Import {built.rows.length} row{built.rows.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <span className={LABEL}>Product name (as {supplierName} calls it)</span>
              <input
                className={INPUT}
                value={single.name}
                onChange={(e) => setSingle({ ...single, name: e.target.value })}
              />
            </div>
            <div>
              <span className={LABEL}>Supplier SKU</span>
              <input
                className={INPUT}
                value={single.sku}
                onChange={(e) => setSingle({ ...single, sku: e.target.value })}
              />
            </div>
            <div>
              <span className={LABEL}>Barcode</span>
              <input
                className={INPUT}
                value={single.barcode}
                onChange={(e) => setSingle({ ...single, barcode: e.target.value })}
              />
            </div>
            <div>
              <span className={LABEL}>Price (฿)</span>
              <input
                className={INPUT}
                type="number"
                min={0}
                value={single.price}
                onChange={(e) => setSingle({ ...single, price: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className={LABEL}>Pack qty</span>
                <input
                  className={INPUT}
                  type="number"
                  min={0}
                  value={single.packQty}
                  onChange={(e) => setSingle({ ...single, packQty: e.target.value })}
                />
              </div>
              <div>
                <span className={LABEL}>Pack unit</span>
                <input
                  className={INPUT}
                  placeholder="kg"
                  value={single.packUnit}
                  onChange={(e) => setSingle({ ...single, packUnit: e.target.value })}
                />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-cream/45">
            Leave the pack blank if you do not know it — an assumed pack size produces a wrong
            unit price, which is worse than a missing one.
          </p>
          <button
            type="button"
            disabled={isBusy || !single.name.trim()}
            onClick={() => void doSingle()}
            className="inline-flex h-8 items-center rounded-md border border-forest-soft/60 bg-forest-soft/15 px-3 text-xs font-medium text-mint-200 hover:bg-forest-soft/25 disabled:opacity-50"
          >
            {isBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Add to catalog
          </button>
        </div>
      )}

      {(error || result) && (
        <div
          className={[
            'mt-2 rounded-md border px-2.5 py-2 text-[11px]',
            result?.ok
              ? 'border-forest-soft/40 bg-forest-soft/10 text-mint-200'
              : 'border-brick-soft/30 bg-brick-soft/10 text-brick-bright',
          ].join(' ')}
        >
          {result?.ok ? (
            <>
              <p>Imported: {previewHeadline(result)}</p>
              {suspiciouslyFewUpdates(result) && (
                <p className="mt-0.5 text-cream/60">
                  Every row was new. If this supplier already had a catalog, check the column
                  mapping — nothing matched what we already hold.
                </p>
              )}
            </>
          ) : (
            <p>{error ?? result?.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
