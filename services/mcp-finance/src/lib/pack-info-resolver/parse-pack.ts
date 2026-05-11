const PATTERN = /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l)$/i;

export function parsePackWeight(input: string): { qty: number; unit: 'g' | 'kg' | 'ml' | 'L' } | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(PATTERN);
  if (!match) return null;
  const qty = parseFloat(match[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const rawUnit = match[2];
  const unit = rawUnit === 'l' ? 'L' : (rawUnit as 'g' | 'kg' | 'ml');
  return { qty, unit };
}
