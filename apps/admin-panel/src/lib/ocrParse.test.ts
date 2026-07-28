import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runOcrParse, getStoredOcrModel, OCR_MODEL_STORAGE_KEY } from './ocrParse'

/**
 * Guards the receipt-parse trigger, which is shared by the receipt inbox and
 * the purchase-order screen.
 *
 * The case that matters most is `claude-sub`: it is NOT an OCR call. It hands
 * the row to the agent queue by stamping model_used, and calling the edge
 * function with it would be wrong. A hand-written second copy of this trigger
 * dropped exactly that branch, which is why the logic now lives in one place
 * and is pinned by these tests.
 */

const invoke = vi.fn()
const update = vi.fn()
const eq = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({ update: (v: unknown) => update(v) }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  update.mockReturnValue({ eq: (...a: unknown[]) => eq(...a) })
  eq.mockResolvedValue({ error: null })
  invoke.mockResolvedValue({ data: { ok: true }, error: null })
})

describe('runOcrParse', () => {
  it('does NOT call the OCR function for claude-sub — it queues for the agent', async () => {
    const result = await runOcrParse('inbox-1', 'claude-sub')

    expect(invoke).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ model_used: 'claude-subscription' })
    expect(eq).toHaveBeenCalledWith('id', 'inbox-1')
    expect(result).toEqual({ ok: true })
  })

  it('surfaces a failure to queue rather than reporting success', async () => {
    eq.mockResolvedValue({ error: { message: 'rls denied' } })

    expect(await runOcrParse('inbox-1', 'claude-sub')).toEqual({ ok: false, error: 'rls denied' })
  })

  it('calls the ocr-receipt function with the inbox id and model', async () => {
    const result = await runOcrParse('inbox-2', 'gemini-flash')

    expect(invoke).toHaveBeenCalledWith('ocr-receipt?inbox_id=inbox-2&model=gemini-flash')
    expect(update).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('reports the function error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await runOcrParse('inbox-3', 'gemini-pro')).toEqual({ ok: false, error: 'boom' })
  })

  it('reports a parse failure returned in the payload', async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: 'unreadable photo' }, error: null })
    expect(await runOcrParse('inbox-4', 'gemini-pro')).toEqual({
      ok: false,
      error: 'unreadable photo',
    })
  })

  it('does not throw when the call itself blows up', async () => {
    invoke.mockRejectedValue(new Error('network down'))
    expect(await runOcrParse('inbox-5', 'gpt-4o')).toEqual({ ok: false, error: 'network down' })
  })
})

describe('getStoredOcrModel', () => {
  it('honours the model chosen in the receipt inbox', () => {
    localStorage.setItem(OCR_MODEL_STORAGE_KEY, 'claude-sonnet')
    expect(getStoredOcrModel()).toBe('claude-sonnet')
  })

  it('passes through a model this module has never heard of', () => {
    // No local allow-list on purpose: the picker owns the options, so a new
    // model must NOT be silently downgraded to the default here.
    localStorage.setItem(OCR_MODEL_STORAGE_KEY, 'gemini-9-ultra')
    expect(getStoredOcrModel()).toBe('gemini-9-ultra')
  })

  it('falls back to the inbox default when nothing is stored', () => {
    expect(getStoredOcrModel()).toBe('gemini-flash')
  })
})
