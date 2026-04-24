import type { TaskOwner } from '../../hooks/useOpeningRoadmap'

const OWNER_LABEL: Record<TaskOwner, { short: string; full: string }> = {
  lesya: { short: 'L', full: 'Lesya' },
  bas: { short: 'B', full: 'Bas' },
  kw: { short: 'KW', full: 'Kitchen' },
  coo: { short: 'CO', full: 'COO' },
  unassigned: { short: '·', full: 'Unassigned' },
}

export function OwnerChip({ owner }: { owner: TaskOwner }) {
  const { short, full } = OWNER_LABEL[owner]
  return (
    <span className="owner-chip" data-who={owner} title={full} aria-label={`Owner: ${full}`}>
      {short}
    </span>
  )
}
