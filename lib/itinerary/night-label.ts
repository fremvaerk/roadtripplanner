/** Compress night numbers into a compact label: [3,4,5] → "3–5", [3,6] → "3, 6", [3,4,6] → "3–4, 6". */
export function formatNightLabel(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = sorted[i];
    prev = sorted[i];
  }
  return parts.join(", ");
}
