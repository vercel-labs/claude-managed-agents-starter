export function formatTimeAgo(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const elapsedMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (Math.abs(elapsedMs) >= yearMs) {
    return rtf.format(Math.round(elapsedMs / yearMs), "year");
  }
  if (Math.abs(elapsedMs) >= monthMs) {
    return rtf.format(Math.round(elapsedMs / monthMs), "month");
  }
  if (Math.abs(elapsedMs) >= weekMs) {
    return rtf.format(Math.round(elapsedMs / weekMs), "week");
  }
  if (Math.abs(elapsedMs) >= dayMs) {
    return rtf.format(Math.round(elapsedMs / dayMs), "day");
  }
  if (Math.abs(elapsedMs) >= hourMs) {
    return rtf.format(Math.round(elapsedMs / hourMs), "hour");
  }
  if (Math.abs(elapsedMs) >= minuteMs) {
    return rtf.format(Math.round(elapsedMs / minuteMs), "minute");
  }
  return "just now";
}
