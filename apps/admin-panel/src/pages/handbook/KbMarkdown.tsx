import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ExternalLink } from 'lucide-react'
import { slugifyHeading } from '../../lib/vault'

/**
 * Renders handbook markdown with brand-consistent prose (reuses `.wiki-prose`)
 * and SPA-aware links:
 *   - `[[slug]]` / `[[slug|Label]]` wikilinks → resolved to /handbook/<slug>
 *   - links to `/handbook/<slug>` navigate inside the app (no full reload)
 *   - all other links open in a new tab
 * Mirrors the link/heading handling in components/brain/PageReader.tsx.
 */

/** Pre-process: `[[slug]]` / `[[slug|Label]]` → `[Label](/handbook/slug)`. */
function transformWikilinks(md: string, knownSlugs: string[]): string {
  const known = new Set(knownSlugs)
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, label?: string) => {
    const slug = target.trim()
    const text = (label ?? target).trim()
    if (!known.has(slug)) return `*${text}*`
    return `[${text}](/handbook/${slug})`
  })
}

interface Props {
  body: string
  /** Known page slugs, used to resolve `[[wikilinks]]`. */
  knownSlugs?: string[]
  /** Called with the target slug when an internal /handbook/<slug> link is clicked. */
  onNavigate?: (slug: string) => void
}

export function KbMarkdown({ body, knownSlugs = [], onNavigate }: Props) {
  const md = useMemo(() => transformWikilinks(body, knownSlugs), [body, knownSlugs])

  return (
    <div className="wiki-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const text = typeof children === 'string' ? children : String(children)
            return <h2 id={slugifyHeading(text)}>{children}</h2>
          },
          h3: ({ children }) => {
            const text = typeof children === 'string' ? children : String(children)
            return <h3 id={slugifyHeading(text)}>{children}</h3>
          },
          a: ({ href, children, ...rest }) => {
            const target = href ?? ''
            const handbookMatch = /^\/handbook\/([^/?#]+)/.exec(target)
            if (handbookMatch && onNavigate) {
              const slug = decodeURIComponent(handbookMatch[1])
              return (
                <button
                  type="button"
                  className="text-honey-300 underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate(slug)
                  }}
                >
                  {children}
                </button>
              )
            }
            // Bare in-app absolute path (non-handbook) — let the browser route it.
            if (target.startsWith('/')) {
              return (
                <a href={target} className="text-honey-300 underline-offset-2 hover:underline">
                  {children}
                </a>
              )
            }
            return (
              <a
                {...rest}
                href={target}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-sky-400 underline-offset-2 hover:underline"
              >
                {children}
                <ExternalLink className="h-3 w-3" />
              </a>
            )
          },
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  )
}
