/** Human-readable driving duration: "0 min", "45 min", "2 h", "2 h 3 min". */
export function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Distance in whole kilometres: "42 km". */
export function formatKm(meters: number): string {
  return `${Math.round(meters / 1000)} km`;
}
