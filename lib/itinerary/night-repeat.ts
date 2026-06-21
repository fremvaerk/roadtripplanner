/**
 * The dayIds of the `count` days immediately following `dayId`, ordered by
 * dayIndex. Used by the night editor's "repeat this night for the next N days"
 * action — applying the same overnight location to consecutive days makes them
 * collapse into one marker (a multi-night stay) on the map.
 *
 * Returns [] for a non-existent dayId, count <= 0, or when there are no
 * following days. Never returns more than the days that actually exist after it.
 */
export function followingDayIds(
  days: { id: string; dayIndex: number }[],
  dayId: string,
  count: number,
): string[] {
  if (count <= 0) return [];
  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  const pos = sorted.findIndex((d) => d.id === dayId);
  if (pos < 0) return [];
  return sorted.slice(pos + 1, pos + 1 + count).map((d) => d.id);
}

/** How many days follow `dayId` (the max you can repeat a night across). */
export function followingDayCount(
  days: { id: string; dayIndex: number }[],
  dayId: string,
): number {
  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  const pos = sorted.findIndex((d) => d.id === dayId);
  return pos < 0 ? 0 : sorted.length - 1 - pos;
}
