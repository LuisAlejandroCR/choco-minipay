import { APP_CONFIG } from "./app-config.js";

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
  fallback.setUTCSeconds(0, 0);
  fallback.setUTCHours(APP_CONFIG.transfer.defaultScheduleHour, 0, 0, 0);
  return formatScheduleTimeFromDate(fallback);
}

export function formatScheduleLabel(dayLabel, firstRunAt) {
  return `Every ${dayLabel} - ${formatScheduleTimeFromTimestamp(firstRunAt)} local`;
}
