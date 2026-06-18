import { APP_CONFIG } from "./app-config.js";

export function getDefaultScheduleHour() {
  const hour = Number(APP_CONFIG.transfer.defaultScheduleHour);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 4;
}

export function getDefaultScheduleMinute() {
  const minute = Number(APP_CONFIG.transfer.defaultScheduleMinute);
  return Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0;
}

export function buildLocalScheduleDate(dayOfMonth, from = new Date()) {
  const day = Math.min(28, Math.max(1, Number(dayOfMonth) || 1));
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(getDefaultScheduleHour(), getDefaultScheduleMinute(), 0, 0);
  next.setDate(day);
  return next;
}

export function nextLocalMonthlyRun(dayOfMonth, from = new Date()) {
  const now = new Date(from);
  const next = buildLocalScheduleDate(dayOfMonth, now);
  if (next.getTime() <= now.getTime()) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(28, Math.max(1, Number(dayOfMonth) || 1)));
  }
  return Math.floor(next.getTime() / 1000);
}

export function scheduledLocalDateForPlan(plan, from = new Date()) {
  const day = Number(plan?.dayOfMonth || String(plan?.dayLabel || "").match(/\d+/)?.[0] || 0);
  if (!day) return null;

  const scheduled = buildLocalScheduleDate(day, from);
  if (plan?.firstRunAt) {
    const firstRun = new Date(Number(plan.firstRunAt) * 1000);
    scheduled.setHours(firstRun.getHours(), firstRun.getMinutes(), 0, 0);
  }
  return scheduled;
}

export function formatScheduleTimeFromDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatScheduleTimeFromTimestamp(seconds) {
  if (seconds) return formatScheduleTimeFromDate(new Date(Number(seconds) * 1000));

  const fallback = new Date();
  fallback.setSeconds(0, 0);
  fallback.setHours(getDefaultScheduleHour(), getDefaultScheduleMinute(), 0, 0);
  return formatScheduleTimeFromDate(fallback);
}

export function formatScheduleLabel(dayLabel, firstRunAt) {
  return `Every ${dayLabel} - ${formatScheduleTimeFromTimestamp(firstRunAt)} local`;
}
