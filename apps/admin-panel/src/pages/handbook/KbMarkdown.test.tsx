import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { KbMarkdown } from './KbMarkdown'

describe('KbMarkdown', () => {
  it('renders markdown text', () => {
    render(<KbMarkdown body={'# Hello\n\nsome **bold** text'} />)
    expect(screen.getByText(/some/)).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('turns a /handbook/<slug> link into an in-app navigation button', () => {
    const onNavigate = vi.fn()
    render(<KbMarkdown body={'[Open](/handbook/foo)'} onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onNavigate).toHaveBeenCalledWith('foo')
  })

  it('resolves a known [[wikilink]] to an in-app button', () => {
    const onNavigate = vi.fn()
    render(
      <KbMarkdown body={'see [[opening-checklist]]'} knownSlugs={['opening-checklist']} onNavigate={onNavigate} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'opening-checklist' }))
    expect(onNavigate).toHaveBeenCalledWith('opening-checklist')
  })

  it('renders an unknown wikilink as plain (non-link) text', () => {
    render(<KbMarkdown body={'see [[missing-page]]'} knownSlugs={['other']} onNavigate={() => {}} />)
    expect(screen.queryByRole('button', { name: 'missing-page' })).not.toBeInTheDocument()
    expect(screen.getByText('missing-page')).toBeInTheDocument()
  })

  it('opens external links in a new tab', () => {
    render(<KbMarkdown body={'[site](https://example.com)'} />)
    const link = screen.getByRole('link', { name: /site/ })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders inline HTML callouts with class and style attributes', () => {
    render(
      <KbMarkdown body={'<div class="cal cal-warn" style="margin-top:4px"><span class="cal-title">Heads up</span> total mismatch</div>'} />,
    )
    expect(screen.getByText('Heads up')).toHaveClass('cal-title')
    expect(screen.getByText(/total mismatch/)).toBeInTheDocument()
  })

  it('strips dangerous inline HTML (script tags) via sanitize', () => {
    const { container } = render(
      <KbMarkdown body={'ok text<script>window.__pwned = true</script>'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/ok text/)).toBeInTheDocument()
  })
})
