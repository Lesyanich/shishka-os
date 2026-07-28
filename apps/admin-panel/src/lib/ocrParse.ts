import { supabase } from './supabase'

/**
 * Single source of truth for receipt OCR triggering.
 *
 * Extracted from useReceiptInbox WITHOUT behaviour changes, because the
 * procurement screen needs the same trigger: a receipt attached to a purchase
 * order is excluded from the standalone inbox, so it needs its own button —
 * and a second hand-written copy of this logic silently dropped the
 * `claude-sub` case, which is exactly how the model rules rot.
 *
 * Anything about WHICH model runs, or HOW parsing is triggered, belongs here
 * and nowhere else. The parsing rules themselves live in the `ocr-receipt`
 * edge function — this module only calls it.
 */

export type OcrModel =
  | 'gemini-flash'
  | 'gemini-flash-lite'
  | 'gemini-3-flash'
  | 'gemini-pro'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gpt-4o'
  | 'claude-sub'
  | 'gemini-flash-vision'
  | 'gemini-pro-vision'

export const OCR_MODEL_STORAGE_KEY = 'receipt-ocr-model'

/**
 * The model the user last picked in the receipt inbox.
 *
 * Deliberately does NOT keep its own list of valid models: the picker in
 * InboxUploader owns the option list and only ever writes a value it offers.
 * A second list here would go stale the day a model is added there, and this
 * reader would silently downgrade to the default instead of honouring the
 * choice. Absent value → the same default the inbox picker uses.
 */
export function getStoredOcrModel(): OcrModel {
  const v = localStorage.getItem(OCR_MODEL_STORAGE_KEY)
  return (v as OcrModel | null) ?? 'gemini-flash'
}

export type OcrParseResult = { ok: boolean; error?: string }

/**
 * Triggers parsing for one inbox row.
 *
 * `claude-sub` is NOT an OCR call: it hands the row to the agent queue by
 * stamping model_used, and a human/agent picks it up later. Every caller must
 * preserve that distinction — invoking the edge function with claude-sub would
 * be wrong.
 */
export async function runOcrParse(inboxId: string, model: OcrModel): Promise<OcrParseResult> {
  if (model === 'claude-sub') {
    const { error } = await supabase
      .from('receipt_inbox')
      .update({ model_used: 'claude-subscription' })
      .eq('id', inboxId)
    return error ? { ok: false, error: error.message } : { ok: true }
  }

  try {
    const { data, error: fnErr } = await supabase.functions.invoke(
      `ocr-receipt?inbox_id=${inboxId}&model=${model}`,
    )
    if (fnErr) return { ok: false, error: fnErr.message }
    if (data && !data.ok) return { ok: false, error: data.error || 'Parse failed' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
