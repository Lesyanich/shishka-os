import { supabase } from '../lib/supabase'

export interface BrainNote {
  id: string
  text: string
  category: string | null
  status: string
  created_at: string
}

export async function saveBrainNote(
  text: string,
  category?: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('brain_inbox')
    .insert({ text, category: category ?? null })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id as string }
}

export async function listBrainNotes(limit = 50): Promise<BrainNote[]> {
  const { data, error } = await supabase
    .from('brain_inbox')
    .select('id, text, category, status, created_at')
    .in('status', ['pending', 'ingested'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as BrainNote[]
}

export async function dismissBrainNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('brain_inbox')
    .update({ status: 'dismissed' })
    .eq('id', id)

  if (error) throw new Error(error.message)
}
