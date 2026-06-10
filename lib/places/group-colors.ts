/** Curated, map-legible group colors (full 6-digit hex). */
export const PALETTE: string[] = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

/** Neutral color for pool / ungrouped places. */
export const UNGROUPED_COLOR = "#64748b"; // slate-500

export function isValidHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

/** The palette color for a group at `orderIndex`, wrapping with modulo. */
export function defaultGroupColor(orderIndex: number): string {
  const n = PALETTE.length;
  return PALETTE[((orderIndex % n) + n) % n];
}

/** The palette color for a day at `dayIndex`, wrapping with modulo. */
export function defaultDayColor(dayIndex: number): string {
  const n = PALETTE.length;
  return PALETTE[((dayIndex % n) + n) % n];
}

/** Darken a #rrggbb color toward black by `amount` (0..1) for a pin border. */
export function darken(hex: string, amount = 0.2): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const a = Math.max(0, Math.min(1, amount));
  const num = parseInt(m[1], 16);
  const ch = (c: number) => Math.max(0, Math.floor(c * (1 - a)));
  const r = ch((num >> 16) & 0xff);
  const g = ch((num >> 8) & 0xff);
  const b = ch(num & 0xff);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}
