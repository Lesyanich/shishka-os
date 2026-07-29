import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  CatalogImportResult,
  CatalogImportRow,
  CatalogSource,
} from '../types/catalogImport'

/**
 * Data layer for supplier catalog import (mig 393).
 *
 * All parsing lives in `types/catalogImport.ts` and is DB-free; this hook only
 * calls `fn_import_supplier_catalog`. Preview and commit are the SAME call with
 * `p_dry_run` flipped, so the preview can never disagree with what commit does.
 */
export interface UseCatalogImportResult {
  isBusy: boolean
  preview: CatalogImportResult | null
  result: CatalogImportResult | null
  error: string | null
  /** Dry run — writes nothing, creates no supplier, learns no alias. */
  runPreview: (args: ImportArgs) => Promise<CatalogImportResult>
  commit: (args: ImportArgs) => Promise<CatalogImportResult>
  reset: () => void
}

export interface ImportArgs {
  supplierId?: string | null
  supplierName?: string | null
  source: CatalogSource
  /** Free-form provenance: "laadthai_pricelist_2026-07-29". */
  sourceDetail?: string | null
  rows: CatalogImportRow[]
}

/**
 * Strip nulls so the jsonb payload stays small on a 600-row paste — and so an
 * absent value never reaches the RPC as an explicit null it might treat
 * differently from "not supplied". Exported for its own test.
 */
export function toPayload(rows: CatalogImportRow[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (v !== null && v !== undefined && v !== '') out[k] = v
    }
    return out
  })
}

export function useCatalogImport(): UseCatalogImportResult {
  const [isBusy, setIsBusy] = useState(false)
  const [preview, setPreview] = useState<CatalogImportResult | null>(null)
  const [result, setResult] = useState<CatalogImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const call = useCallback(
    async (args: ImportArgs, dryRun: boolean): Promise<CatalogImportResult> => {
      setIsBusy(true)
      setError(null)
      const { data, error: rpcError } = await supabase.rpc('fn_import_supplier_catalog', {
        p_supplier_id: args.supplierId ?? null,
        p_supplier_name: args.supplierName ?? null,
        p_source: args.source,
        p_source_detail: args.sourceDetail ?? null,
        p_rows: toPayload(args.rows),
        p_dry_run: dryRun,
      })
      setIsBusy(false)

      if (rpcError) {
        const failed: CatalogImportResult = { ok: false, error: rpcError.message }
        setError(rpcError.message)
        return failed
      }
      const res = (data as CatalogImportResult | null) ?? {
        ok: false,
        error: 'No response from server',
      }
      if (!res.ok && res.error) setError(res.error)
      return res
    },
    [],
  )

  const runPreview = useCallback<UseCatalogImportResult['runPreview']>(
    async (args) => {
      const res = await call(args, true)
      setPreview(res)
      setResult(null)
      return res
    },
    [call],
  )

  const commit = useCallback<UseCatalogImportResult['commit']>(
    async (args) => {
      const res = await call(args, false)
      setResult(res)
      return res
    },
    [call],
  )

  const reset = useCallback(() => {
    setPreview(null)
    setResult(null)
    setError(null)
  }, [])

  return { isBusy, preview, result, error, runPreview, commit, reset }
}
