export const DEFAULT_DAILY_DRIVE_MAX_SECONDS = 5 * 3600;

/**
 * Assign each ordered stop a day index in [0, dayCount-1] by greedily filling days
 * up to `capSeconds` of driving. `legSeconds[i]` is the drive from the previous
 * route point to stop i. The last day absorbs any remainder; a day is never left
 * empty by a single over-cap leg.
 */
export function splitByDriveCap(
  legSeconds: number[],
  dayCount: number,
  capSeconds: number,
): number[] {
  const days = Math.max(1, dayCount);
  const assignment: number[] = [];
  let dayIdx = 0;
  let dayDrive = 0;
  let dayHasStop = false;

  for (let i = 0; i < legSeconds.length; i++) {
    const leg = legSeconds[i] ?? 0;
    if (dayHasStop && dayIdx < days - 1 && dayDrive + leg > capSeconds) {
      dayIdx += 1;
      dayDrive = 0;
      dayHasStop = false;
    }
    assignment.push(dayIdx);
    dayDrive += leg;
    dayHasStop = true;
  }

  return assignment;
}
