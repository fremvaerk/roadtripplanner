/** start date + dayIndex days, as a UTC date (so "Day 0" == the picked date in any timezone). */
export function dayDate(startDateISO: string | null, dayIndex: number): Date | null {
  if (!startDateISO) return null;
  const base = new Date(startDateISO);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + dayIndex),
  );
}
