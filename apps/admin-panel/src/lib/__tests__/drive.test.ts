// Pure-function tests for the Drive search-URL helpers.
import { describe, it, expect } from 'vitest'
import { cleanDrivePath, driveSearchTerm, driveLinkFor } from '../drive'

describe('lib/drive', () => {
  describe('cleanDrivePath', () => {
    it('strips Drive: prefix and trailing slash', () => {
      expect(cleanDrivePath('Drive: 01_Business/Branding/')).toBe('01_Business/Branding')
      expect(cleanDrivePath('Drive: foo/bar.png')).toBe('foo/bar.png')
    })
    it('handles missing prefix', () => {
      expect(cleanDrivePath('foo/bar')).toBe('foo/bar')
    })
  })

  describe('driveSearchTerm', () => {
    it('extracts last folder name for folders', () => {
      expect(driveSearchTerm('Drive: 01_Business/Branding/')).toBe('Branding')
    })
    it('extracts file basename without extension', () => {
      expect(driveSearchTerm('Drive: 01_Business/Logo-25.png')).toBe('Logo-25')
    })
    it('handles deeply nested paths', () => {
      expect(driveSearchTerm('Drive: a/b/c/d/myfile.pdf')).toBe('myfile')
    })
    it('returns empty for empty input', () => {
      expect(driveSearchTerm('Drive:')).toBe('')
      expect(driveSearchTerm('Drive: /')).toBe('')
    })
  })

  describe('driveLinkFor', () => {
    it('returns Drive search URL for Drive: paths', () => {
      const url = driveLinkFor('Drive: 01_Business/Branding/')
      expect(url).toBe('https://drive.google.com/drive/search?q=Branding')
    })
    it('URL-encodes the term', () => {
      const url = driveLinkFor('Drive: My Folder With Spaces/')
      expect(url).toBe('https://drive.google.com/drive/search?q=My%20Folder%20With%20Spaces')
    })
    it('returns null for non-Drive paths (e.g. local repo paths)', () => {
      expect(driveLinkFor('apps/admin-panel/src/assets/logo.png')).toBeNull()
    })
    it('returns null for undefined / empty', () => {
      expect(driveLinkFor(undefined)).toBeNull()
      expect(driveLinkFor('')).toBeNull()
    })
  })
})
