import assert from "node:assert/strict";
import test from "node:test";
import { isDueThisMonth, sameMonth, scheduleWindowForCurrentMonth } from "./keeper-window.js";

// Minimal schedule shape used by the keeper
function makeSchedule(dayOfMonth, firstRunAtDate, overrides = {}) {
  return {
    dayOfMonth,
    firstRunAt: Math.floor(firstRunAtDate.getTime() / 1000),
    sourceAmount: 1_000_000n,          // 1 USDC (6 dec)
    destinationAmount: 129_390_000_000_000_000_000n, // ~129.39 KESm (18 dec)
    active: true,
    cancelled: false,
    ...overrides,
  };
}

// ─── sameMonth ───────────────────────────────────────────────────────────────

test("sameMonth: same year and month", () => {
  assert.ok(sameMonth(new Date(2026, 5, 1), new Date(2026, 5, 30)));
});

test("sameMonth: consecutive months are different", () => {
  assert.ok(!sameMonth(new Date(2026, 5, 30), new Date(2026, 6, 1)));
});

test("sameMonth: same month-number but different year", () => {
  assert.ok(!sameMonth(new Date(2025, 5, 17), new Date(2026, 5, 17)));
});

test("sameMonth: December vs January next year", () => {
  assert.ok(!sameMonth(new Date(2025, 11, 31), new Date(2026, 0, 1)));
});

// ─── scheduleWindowForCurrentMonth ───────────────────────────────────────────

test("window for day 17: correct UTC epoch at firstRunAt time", () => {
  // firstRunAt = Jun 17 09:00 UTC (≈ 4 AM CDT)
  const firstRun = new Date(Date.UTC(2026, 5, 17, 9, 0, 0));
  const schedule  = makeSchedule(17, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 17, 10, 0));  // later that day
  const expected  = Math.floor(new Date(Date.UTC(2026, 5, 17, 9, 0, 0)).getTime() / 1000);
  assert.equal(scheduleWindowForCurrentMonth(schedule, now), expected);
});

test("window projects to the current UTC month, not the month of firstRunAt", () => {
  // Schedule created May 5 — by June the window should be June 5
  const firstRun = new Date(Date.UTC(2026, 4, 5, 9, 0, 0));
  const schedule  = makeSchedule(5, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 15, 12, 0));
  const expected  = Math.floor(new Date(Date.UTC(2026, 5, 5, 9, 0, 0)).getTime() / 1000);
  assert.equal(scheduleWindowForCurrentMonth(schedule, now), expected);
});

test("window for day 1 is the first day of the current UTC month", () => {
  const firstRun = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
  const schedule  = makeSchedule(1, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 15, 12, 0));  // mid June
  const expected  = Math.floor(new Date(Date.UTC(2026, 5, 1, 9, 0, 0)).getTime() / 1000);
  assert.equal(scheduleWindowForCurrentMonth(schedule, now), expected);
});

test("window for day 28 stays in the current month (no overflow)", () => {
  // Contract enforces dayOfMonth <= 28, so this is the max legal value
  const firstRun = new Date(Date.UTC(2026, 1, 28, 9, 0, 0));
  const schedule  = makeSchedule(28, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 28, 10, 0));  // June 28 (30-day month)
  const expected  = Math.floor(new Date(Date.UTC(2026, 5, 28, 9, 0, 0)).getTime() / 1000);
  assert.equal(scheduleWindowForCurrentMonth(schedule, now), expected);
});

test("window preserves HH:MM from firstRunAt across months", () => {
  // firstRunAt was set at 14:30 UTC — window must be 14:30 every month
  const firstRun = new Date(Date.UTC(2026, 0, 10, 14, 30, 0));
  const schedule  = makeSchedule(10, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 9, 0, 0));  // before window in June
  const window    = scheduleWindowForCurrentMonth(schedule, now);
  const windowDate = new Date(window * 1000);
  assert.equal(windowDate.getUTCHours(), 14);
  assert.equal(windowDate.getUTCMinutes(), 30);
  assert.equal(windowDate.getUTCDate(), 10);
});

// ─── isDueThisMonth ──────────────────────────────────────────────────────────

test("active plan past runAt window is due", () => {
  // day 1, created in January — by mid-June day 1 has passed
  const firstRun = new Date(Date.UTC(2026, 0, 1, 9, 0));
  const schedule  = makeSchedule(1, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 17, 12, 0));
  const nowSec    = Math.floor(now.getTime() / 1000);
  assert.ok(isDueThisMonth(schedule, nowSec, now));
});

test("plan whose runAt window is still in the future today is not yet due", () => {
  // day 28, checked on June 17 — window is June 28
  const firstRun = new Date(Date.UTC(2026, 0, 28, 9, 0));
  const schedule  = makeSchedule(28, firstRun);
  const now       = new Date(Date.UTC(2026, 5, 17, 12, 0));  // June 17
  const nowSec    = Math.floor(now.getTime() / 1000);
  assert.ok(!isDueThisMonth(schedule, nowSec, now));
});

test("plan with future firstRunAt is not due even if dayOfMonth passed", () => {
  const futureFirstRun = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const schedule = makeSchedule(1, futureFirstRun);
  const nowSec   = Math.floor(Date.now() / 1000);
  assert.ok(!isDueThisMonth(schedule, nowSec));
});

test("cancelled plan is not due", () => {
  const pastFirstRun = new Date(Date.UTC(2026, 0, 1, 9, 0));
  const schedule = makeSchedule(1, pastFirstRun, { active: false, cancelled: true });
  const now      = new Date(Date.UTC(2026, 5, 17, 12, 0));
  const nowSec   = Math.floor(now.getTime() / 1000);
  assert.ok(!isDueThisMonth(schedule, nowSec, now));
});

test("paused plan (active=false, not cancelled) is not due", () => {
  const pastFirstRun = new Date(Date.UTC(2026, 0, 1, 9, 0));
  const schedule = makeSchedule(1, pastFirstRun, { active: false });
  const now      = new Date(Date.UTC(2026, 5, 17, 12, 0));
  const nowSec   = Math.floor(now.getTime() / 1000);
  assert.ok(!isDueThisMonth(schedule, nowSec, now));
});

test("active non-cancelled plan due today is correctly due", () => {
  // Simulate: checked right after the 4 AM window on the correct day
  const firstRun = new Date(Date.UTC(2026, 5, 17, 9, 0));   // June 17 09:00 UTC
  const schedule = makeSchedule(17, firstRun);
  const now      = new Date(Date.UTC(2026, 5, 17, 9, 30));   // 30 min after window
  const nowSec   = Math.floor(now.getTime() / 1000);
  assert.ok(isDueThisMonth(schedule, nowSec, now));
});

test("active plan checked 1 minute before its window is not yet due", () => {
  const firstRun = new Date(Date.UTC(2026, 5, 17, 9, 0));   // window at 09:00 UTC
  const schedule = makeSchedule(17, firstRun);
  const now      = new Date(Date.UTC(2026, 5, 17, 8, 59));   // 1 min before
  const nowSec   = Math.floor(now.getTime() / 1000);
  assert.ok(!isDueThisMonth(schedule, nowSec, now));
});
