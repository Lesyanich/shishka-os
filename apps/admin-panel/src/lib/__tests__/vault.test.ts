// Pure-function smoke tests for vault helpers.
import { describe, it, expect } from 'vitest'
import {
  resolveWikilink,
  transformWikilinks,
  buildFolderNodes,
  slugifyHeading,
  extractToc,
  readAssets,
  stripFrontmatter,
} from '../vault'

describe('lib/vault', () => {
  describe('resolveWikilink', () => {
    const knownPaths = ['Menu/README.md', 'Menu/Salads.md', 'Decisions/D-001-foo.md']

    it('resolves exact path', () => {
      expect(resolveWikilink('Menu/Salads', knownPaths)).toBe('Menu/Salads.md')
    })

    it('resolves folder index', () => {
      expect(resolveWikilink('Menu', knownPaths)).toBe('Menu/README.md')
    })

    it('resolves by basename', () => {
      expect(resolveWikilink('D-001-foo', knownPaths)).toBe('Decisions/D-001-foo.md')
    })

    it('returns null for unknown', () => {
      expect(resolveWikilink('Nope', knownPaths)).toBeNull()
    })
  })

  describe('transformWikilinks', () => {
    it('rewrites resolvable [[link]] to wiki: URI', () => {
      const out = transformWikilinks('See [[Menu]] for details', ['Menu/README.md'])
      expect(out).toContain('[Menu](wiki:Menu%2FREADME.md)')
    })

    it('italicizes unresolvable links', () => {
      const out = transformWikilinks('Mystery [[Nope]] here', ['Menu/README.md'])
      expect(out).toContain('*Nope*')
    })
  })

  describe('buildFolderNodes', () => {
    it('groups pages by top-level folder, sorting README to index', () => {
      const tree = [
        { path: 'Menu/Salads.md', title: 'Salads', type: null, lastModified: '', isFolderIndex: false },
        { path: 'Menu/README.md', title: 'Menu', type: 'entity', lastModified: '', isFolderIndex: true },
        { path: 'Brand/README.md', title: 'Brand', type: 'entity', lastModified: '', isFolderIndex: true },
      ]
      const folders = buildFolderNodes(tree)
      expect(folders.map((f) => f.name)).toEqual(['Brand', 'Menu'])
      const menu = folders.find((f) => f.name === 'Menu')!
      expect(menu.index?.path).toBe('Menu/README.md')
      expect(menu.pages.map((p) => p.path)).toEqual(['Menu/Salads.md'])
    })
  })

  describe('slugifyHeading', () => {
    it('lowercases and dasherizes', () => {
      expect(slugifyHeading('Hello World')).toBe('hello-world')
      expect(slugifyHeading('What\'s the Plan?')).toBe('whats-the-plan')
    })
  })

  describe('extractToc', () => {
    it('captures H2-H4, ignores code blocks', () => {
      const md = '# Title\n\n## Section\n\n```\n## not a heading\n```\n\n### Sub\n'
      const toc = extractToc(md)
      expect(toc).toEqual([
        { level: 2, text: 'Section', id: 'section' },
        { level: 3, text: 'Sub', id: 'sub' },
      ])
    })
  })

  describe('readAssets', () => {
    it('returns asset entries with label + optional path/url', () => {
      const fm = { assets: [{ label: 'Logos', path: 'Drive: x' }, { label: 'Photos', url: 'https://x' }] }
      expect(readAssets(fm)).toEqual([
        { label: 'Logos', path: 'Drive: x', url: undefined },
        { label: 'Photos', path: undefined, url: 'https://x' },
      ])
    })

    it('returns empty when frontmatter has no assets', () => {
      expect(readAssets({})).toEqual([])
      expect(readAssets({ assets: 'not-an-array' })).toEqual([])
    })
  })

  describe('stripFrontmatter', () => {
    it('removes leading YAML block', () => {
      const md = '---\ntitle: x\n---\nbody'
      expect(stripFrontmatter(md)).toBe('body')
    })

    it('returns unchanged when no frontmatter', () => {
      expect(stripFrontmatter('plain markdown')).toBe('plain markdown')
    })
  })
})
