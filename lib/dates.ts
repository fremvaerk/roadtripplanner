/** start date + dayIndex days, as a UTC date (so "Day 0" == the picked date in any timezone). */
export function dayDate(startDateISO: string | null, dayIndex: number): Date | null {
  if (!startDateISO) return null;
  const base = new Date(startDateISO);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + dayIndex),
  );
}

/** 0-based index of the day that is "today" (UTC), or null if today is outside the trip. */
export function todayDayIndex(
  startDateISO: string | null,
  dayCount: number,
  now: Date = new Date(),
): number | null {
  if (!startDateISO || dayCount <= 0) return null;
  const start = dayDate(startDateISO, 0);
  if (!start) return null;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.floor((todayUTC - start.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays < dayCount ? diffDays : null;
}
