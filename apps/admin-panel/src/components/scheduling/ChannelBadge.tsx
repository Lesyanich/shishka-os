import type { Channel } from '../../types/scheduling'

const channelConfig: Record<Channel, { label: string; className: string }> = {
  dine_in: { label: 'Dine-in', className: 'bg-emerald-500/20 text-emerald-400' },
  delivery: { label: 'Delivery', className: 'bg-blue-500/20 text-blue-400' },
  retail_L2: { label: 'Retail L-2', className: 'bg-purple-500/20 text-purple-400' },
  catering: { label: 'Catering', className: 'bg-amber-500/20 text-amber-400' },
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  const config = channelConfig[channel]
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
