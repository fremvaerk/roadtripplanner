/**
 * A human-readable stay label: "1 night · 13 Jun → 14 Jun" /
 * "3 nights · 13 Jun → 16 Jun" — where checkIn is the first night's date and
 * checkOut is the morning after the last night (last night's date + 1 day).
 *
 * Falls back to "N nights" with no dates (trip has no start date), and to the
 * number label for a non-contiguous group (e.g. nights 3 & 6 at one hotel),
 * where a single from→to span would misrepresent the stay.
 */
export function formatNightStay(
  numbers: number[],
  checkIn: string | null,
  checkOut: string | null,
): string {
  const count = numbers.length;
  const noun = `${count} night${count === 1 ? "" : "s"}`;
  const sorted = [...numbers].sort((a, b) => a - b);
  const contiguous = sorted[sorted.length - 1] - sorted[0] === count - 1;
  if (checkIn && checkOut && contiguous) return `${noun} · ${checkIn} → ${checkOut}`;
  if (count > 1 && !contiguous) return `${noun} (nights ${formatNightLabel(numbers)})`;
  return noun;
}

/** Compress night numbers into a compact label: [3,4,5] → "3–5", [3,6] → "3, 6", [3,4,6] → "3–4, 6". */
export function formatNightLabel(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i] === prev) continue; // collapse any duplicate numbers
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
