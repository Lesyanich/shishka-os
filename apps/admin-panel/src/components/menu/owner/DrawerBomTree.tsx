import type { BomTreeNode } from '../../../hooks/useBomTree'

interface DrawerBomTreeProps {
  root: BomTreeNode | null
  isLoading: boolean
  error: string | null
}

const BAHT = '\u0E3F'

function formatCost(node: BomTreeNode): string | null {
  if (node.costPerUnit <= 0) return null
  const loss = node.yieldLossPct != null ? 1 + node.yieldLossPct / 100 : 1
  const contribution = node.quantityPerUnit * node.costPerUnit * loss
  return `${BAHT}${contribution.toFixed(1)}`
}

function slotBadgeTone(slot: string | null): string {
  switch (slot) {
    case 'base':
      return 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
    case 'finish':
      return 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)]'
    case 'accent':
    case 'dressing':
      return 'bg-[var(--color-royal-red)]/15 text-[color:var(--color-brick-soft)]'
    case 'protein':
      return 'bg-nutri-pro/25 text-nutri-pro'
    default:
      return ''
  }
}

interface TreeRowProps {
  node: BomTreeNode
  isLast: boolean
  prefix: string
}

function TreeRow({ node, isLast, prefix }: TreeRowProps) {
  const cost = formatCost(node)
  const isRoot = node.depth === 0
  const branch = isRoot ? '' : isLast ? '└─ ' : '├─ '

  const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')

  return (
    <>
      <div
        className={`flex items-center justify-between gap-2 py-1 text-[11px] ${
          isRoot ? 'text-[color:var(--color-cream)]' : 'text-[color:var(--color-cream)]/70'
        }`}
        data-bom-depth={node.depth}
      >
        <span className="flex min-w-0 items-center gap-1 truncate">
          <span
            className="shrink-0 font-mono text-[10px] text-faint"
            aria-hidden
          >
            {prefix}
            {branch}
          </span>
          <span
            className={isRoot ? 'font-medium' : 'italic'}
            style={!isRoot ? { fontFamily: 'var(--font-display)' } : undefined}
          >
            {node.name}
          </span>
          {node.slot && (
            <span
              className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${slotBadgeTone(node.slot)}`}
              style={{ fontFamily: 'var(--font-display-sc)' }}
            >
              {node.slot}
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--color-cream)]/45">
          {!isRoot && (
            <>
              {node.quantityPerUnit.toFixed(node.quantityPerUnit < 1 ? 3 : 2)}
              {node.baseUnit ? ` ${node.baseUnit}` : ''}
              {cost && <span className="ml-2 text-[color:var(--color-cream)]/30">{cost}</span>}
            </>
          )}
        </span>
      </div>
      {node.children.map((child, idx) => (
        <TreeRow
          key={child.bomRowId ?? child.nomenclatureId}
          node={child}
          isLast={idx === node.children.length - 1}
          prefix={childPrefix}
        />
      ))}
    </>
  )
}

export function DrawerBomTree({ root, isLoading, error }: DrawerBomTreeProps) {
  return (
    <section aria-labelledby="drawer-bom-title" className="space-y-2">
      <h3
        id="drawer-bom-title"
        className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/60"
        style={{ fontFamily: 'var(--font-display-sc)' }}
      >
        BOM tree
      </h3>
      {isLoading && <div className="text-xs text-muted">Loading recipe…</div>}
      {error && <div className="text-xs text-brick-soft">{error}</div>}
      {root && root.children.length === 0 && !isLoading && (
        <div className="text-xs text-faint">No recipe defined.</div>
      )}
      {root && root.children.length > 0 && (
        <div className="rounded-lg border border-surface-3 bg-surface-2 px-3 py-2">
          <TreeRow node={root} isLast prefix="" />
        </div>
      )}
    </section>
  )
}
