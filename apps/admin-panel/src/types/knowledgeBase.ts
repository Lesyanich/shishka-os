import type { AppRole } from '../contexts/AppRoleContext'

/** Knowledge-base ("Handbook") types — mirror of migration 345. */

export type KbLang = 'en' | 'th' | 'my'

export const KB_LANGS: readonly KbLang[] = ['en', 'th', 'my']

export const KB_LANG_LABEL: Record<KbLang, string> = {
  en: 'English',
  th: 'ไทย',
  my: 'မြန်မာ',
}

export interface KbTranslation {
  id: string
  page_id: string
  lang: KbLang
  title: string
  body_md: string
  updated_at: string
}

export interface KbAssignment {
  staff_id: string
}

export interface KbPage {
  id: string
  parent_id: string | null
  slug: string
  icon: string | null
  sort_order: number
  min_role: AppRole
  is_published: boolean
  redirect_to_page_id: string | null
  cover_image_url: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  translations: KbTranslation[]
  /** Staff this page is personally assigned to. Empty/absent = shared (role-visible). */
  assignments?: KbAssignment[]
}

/** Staff ids a page is assigned to (empty = shared / role-visible). */
export function assignedStaffIds(page: KbPage): string[] {
  return (page.assignments ?? []).map((a) => a.staff_id)
}

export interface KbTreeNode extends KbPage {
  children: KbTreeNode[]
  depth: number
}

export interface KbResolvedContent {
  title: string
  body_md: string
  /** True when the requested language had no content and we fell back to English. */
  isFallback: boolean
}

/**
 * Pick the title + body for a page in the requested language, falling back to
 * English when the translation is missing or empty. English is the canonical
 * stored language (migration 345).
 */
export function pickTranslation(page: KbPage, lang: KbLang): KbResolvedContent {
  const en = page.translations.find((t) => t.lang === 'en')
  if (lang === 'en') {
    return { title: en?.title ?? page.slug, body_md: en?.body_md ?? '', isFallback: false }
  }
  const want = page.translations.find((t) => t.lang === lang)
  const hasContent = !!want && (want.title.trim() !== '' || want.body_md.trim() !== '')
  if (hasContent) {
    return { title: want!.title || en?.title || page.slug, body_md: want!.body_md, isFallback: false }
  }
  return { title: en?.title ?? page.slug, body_md: en?.body_md ?? '', isFallback: true }
}
