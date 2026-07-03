import { describe, it, expect } from 'vitest'
import { KB_LANGS, KB_LANG_LABEL, pickTranslation, type KbPage } from './knowledgeBase'

function makePage(translations: KbPage['translations']): KbPage {
  return {
    id: 'p1',
    parent_id: null,
    slug: 'about',
    icon: null,
    sort_order: 0,
    min_role: 'cook',
    is_published: true,
    redirect_to_page_id: null,
    cover_image_url: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    translations,
  }
}

const t = (lang: 'en' | 'th' | 'my', title: string, body_md = 'body') => ({
  id: `${lang}-1`,
  page_id: 'p1',
  lang,
  title,
  body_md,
  updated_at: '',
})

describe('knowledgeBase types', () => {
  it('exposes the three languages with labels', () => {
    expect(KB_LANGS).toEqual(['en', 'th', 'my'])
    expect(KB_LANG_LABEL.en).toBe('English')
    expect(KB_LANG_LABEL.th).toBeTruthy()
    expect(KB_LANG_LABEL.my).toBeTruthy()
  })

  it('returns English content directly for lang=en', () => {
    const page = makePage([t('en', 'About', 'hello')])
    const r = pickTranslation(page, 'en')
    expect(r.title).toBe('About')
    expect(r.body_md).toBe('hello')
    expect(r.isFallback).toBe(false)
  })

  it('returns the requested translation when present', () => {
    const page = makePage([t('en', 'About'), t('th', 'เกี่ยวกับ', 'สวัสดี')])
    const r = pickTranslation(page, 'th')
    expect(r.title).toBe('เกี่ยวกับ')
    expect(r.body_md).toBe('สวัสดี')
    expect(r.isFallback).toBe(false)
  })

  it('falls back to English when the translation is missing', () => {
    const page = makePage([t('en', 'About', 'hello')])
    const r = pickTranslation(page, 'my')
    expect(r.title).toBe('About')
    expect(r.body_md).toBe('hello')
    expect(r.isFallback).toBe(true)
  })

  it('falls back to English when the translation is empty', () => {
    const page = makePage([t('en', 'About', 'hello'), t('th', '', '')])
    const r = pickTranslation(page, 'th')
    expect(r.body_md).toBe('hello')
    expect(r.isFallback).toBe(true)
  })

  it('falls back to the slug when there is no English content', () => {
    const page = makePage([])
    const r = pickTranslation(page, 'en')
    expect(r.title).toBe('about')
  })
})
