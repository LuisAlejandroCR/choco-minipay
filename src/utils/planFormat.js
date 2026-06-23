// Pure date/time + duration formatters for plans and movement history (no plan-model dependencies).

export const SPLASH_DURATION_MS = 4000;

export function formatLocalTimestamp(date = new Date()) {
  const timestamp = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${timestamp.replace(",", "")} Local`;
}

export function formatLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatHistoryDate(timestamp) {
  const datePart = String(timestamp).match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
  if (!datePart) return timestamp;
  const [month, day] = datePart.split("/");
  return `${month}/${day}`;
}

// Display name for a plan/movement row: the contact (or short address) plus its disambiguation suffix
// ("Plan 1" / "Plan 2") when that contact has more than one plan.
export function recipientLabel(item) {
  return item?.nameSuffix ? `${item.recipient} · ${item.nameSuffix}` : (item?.recipient ?? "");
}

export function formatDemoTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
