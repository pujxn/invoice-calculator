// Dates for the history screens. A person picks a day on their own calendar ("2026-11-19" from a
// date box), so the day runs from their local midnight to the last millisecond before the next
// one, and is sent to the server as exact times.

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Start of that local day as an ISO time, or '' when the text is not a real date.
export function dayStart(day) {
  const m = DAY_PATTERN.exec(day ?? '');
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.getMonth() === Number(m[2]) - 1 ? date.toISOString() : '';
}

// Last moment of that local day as an ISO time.
export function dayEnd(day) {
  const start = dayStart(day);
  if (!start) return '';
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  next.setMilliseconds(next.getMilliseconds() - 1);
  return next.toISOString();
}

// "19 Nov 2026, 5:30 pm" in the person's own language and time zone.
export function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
