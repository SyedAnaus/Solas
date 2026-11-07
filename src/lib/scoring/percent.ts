/**
 * Round a set of shares to a step (e.g. 5 points) so that the rounded values still total exactly
 * 100, using the largest-remainder method. Input values are metres (or any non-negative weights).
 */
export function roundSharesToStep<K extends string>(values: Record<K, number>, step: number): Record<K, number> {
  const keys = Object.keys(values) as K[];
  const total = keys.reduce((sum, k) => sum + Math.max(0, values[k]), 0);
  const out = {} as Record<K, number>;
  if (total <= 0) {
    for (const k of keys) out[k] = 0;
    return out;
  }
  const units = Math.round(100 / step);
  const quotas = keys.map((k) => ({ k, q: (Math.max(0, values[k]) / total) * units }));
  let assigned = 0;
  for (const { k, q } of quotas) {
    out[k] = Math.floor(q);
    assigned += out[k];
  }
  // Hand out remaining units to the largest remainders; ties go to the larger raw share, then key order.
  const order = [...quotas].sort((a, b) => b.q - Math.floor(b.q) - (a.q - Math.floor(a.q)) || b.q - a.q);
  for (let i = 0; assigned < units && i < order.length; i++) {
    out[order[i]!.k] += 1;
    assigned += 1;
  }
  for (const k of keys) out[k] = out[k] * step;
  return out;
}

/** Exact shares in percent (unrounded), summing to 100 when total > 0. */
export function exactShares<K extends string>(values: Record<K, number>): Record<K, number> {
  const keys = Object.keys(values) as K[];
  const total = keys.reduce((sum, k) => sum + Math.max(0, values[k]), 0);
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = total > 0 ? (Math.max(0, values[k]) / total) * 100 : 0;
  return out;
}

/**
 * Text for a rounded share. A non-zero share that rounds to 0 shows as "<5%" so a small amount of
 * evidence is never presented as none.
 */
export function formatShare(rounded: number, exact: number, step: number): string {
  if (exact > 0 && rounded === 0) return `<${step}%`;
  if (exact < 100 && rounded === 100) return `>${100 - step}%`;
  return `${rounded}%`;
}
