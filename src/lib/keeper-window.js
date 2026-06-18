// Pure timing logic used by the off-chain keeper (run-due-schedules.mjs).
// Kept here so it can be unit-tested via `npm test` without spinning up a node.

export function sameMonth(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

// Returns the Unix epoch second of this month's execution window for a schedule.
// Combines the current UTC calendar date for dayOfMonth with the HH:MM from
// firstRunAt (which was fixed at the local 4 AM when the user created the schedule).
// ChocoLedger enforces dayOfMonth in [1, 28], so no month-overflow is possible;
// using dayOfMonth directly in Date.UTC is safe and avoids the off-by-one that the
// old (dayOfMonth-1)+setUTCDate pattern introduced for dayOfMonth=1.
export function scheduleWindowForCurrentMonth(schedule, now = new Date()) {
  const firstRun = new Date(Number(schedule.firstRunAt) * 1000);
  return Math.floor(new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    Number(schedule.dayOfMonth),
    firstRun.getUTCHours(),
    firstRun.getUTCMinutes(),
    0,
    0,
  )).getTime() / 1000);
}

// Returns true when a schedule is eligible to run: active, not cancelled,
// past its first-run timestamp, and its current-month window has opened.
export function isDueThisMonth(schedule, nowSec, now = new Date()) {
  if (!schedule.active || schedule.cancelled) return false;
  if (schedule.firstRunAt > nowSec) return false;
  return scheduleWindowForCurrentMonth(schedule, now) <= nowSec;
}
