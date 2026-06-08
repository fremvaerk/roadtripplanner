/**
 * Reorder `items` according to `optimizedIndices`, where position i holds the
 * original index of the item that should be at position i. Returns the input
 * unchanged if the indices don't form a valid permutation of the items.
 */
export function applyOptimizedOrder<T>(items: T[], optimizedIndices: number[]): T[] {
  if (optimizedIndices.length !== items.length) return items;
  const valid = optimizedIndices.every((i) => Number.isInteger(i) && i >= 0 && i < items.length);
  if (!valid) return items;
  return optimizedIndices.map((i) => items[i]);
}
