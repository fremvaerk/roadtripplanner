/**
 * Reorder `items` according to `optimizedIndices`, where position i holds the
 * original index of the item that should be at position i. Returns the input
 * unchanged if the indices don't form a valid permutation of the items.
 */
export function applyOptimizedOrder<T>(items: T[], optimizedIndices: number[]): T[] {
  if (optimizedIndices.length !== items.length) return items;
  // Must be a true permutation: in range AND no duplicates (a duplicate index would
  // silently drop one stop and double another).
  const seen = new Set<number>();
  const valid = optimizedIndices.every((i) => {
    if (!Number.isInteger(i) || i < 0 || i >= items.length || seen.has(i)) return false;
    seen.add(i);
    return true;
  });
  if (!valid) return items;
  return optimizedIndices.map((i) => items[i]);
}
