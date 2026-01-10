import type { AvailabilityWindow, CalendarEvent, Lock, ScheduleSettings } from "./types";

function minutesToMs(min: number) { return min * 60_000; }

export function buildAvailabilityWindows(args: {
  nowMs: number;
  horizonDays: number;
  timezone: string;
  settings: ScheduleSettings;
  existingEvents: CalendarEvent[];
  locks: Lock[];
}): AvailabilityWindow[] {
  const { nowMs, horizonDays, settings, existingEvents } = args;

  const windows: AvailabilityWindow[] = [];
  const dayMs = 24 * 60 * 60_000;

  for (let d = 0; d < horizonDays; d++) {
    const dayStart = startOfLocalDayMs(nowMs + d * dayMs);
    const weekday = weekdayNumber(dayStart);

    for (const w of settings.windows) {
      if (w.weekday !== weekday) continue;
      const startAt = dayStart + minutesToMs(w.startMinutes);
      const endAt = dayStart + minutesToMs(w.endMinutes);
      if (endAt > startAt) windows.push({ startAt, endAt });
    }
  }

  const busy = existingEvents
    .map(e => ({ startAt: e.startAt, endAt: e.endAt }))
    .filter(b => b.endAt > nowMs);

  return subtractMany(windows, busy)
    .map(w => ({ startAt: Math.max(w.startAt, nowMs), endAt: w.endAt }))
    .filter(w => w.endAt - w.startAt >= minutesToMs(settings.minFocusBlockMinutes));
}

function subtractMany(base: AvailabilityWindow[], busy: AvailabilityWindow[]): AvailabilityWindow[] {
  let out = base;
  for (const b of busy) out = out.flatMap(w => subtractOne(w, b));
  return out;
}

function subtractOne(w: AvailabilityWindow, b: AvailabilityWindow): AvailabilityWindow[] {
  const overlapStart = Math.max(w.startAt, b.startAt);
  const overlapEnd = Math.min(w.endAt, b.endAt);
  if (overlapEnd <= overlapStart) return [w];

  const parts: AvailabilityWindow[] = [];
  if (w.startAt < overlapStart) parts.push({ startAt: w.startAt, endAt: overlapStart });
  if (overlapEnd < w.endAt) parts.push({ startAt: overlapEnd, endAt: w.endAt });
  return parts;
}

function startOfLocalDayMs(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekdayNumber(ms: number) {
  const day = new Date(ms).getDay();
  return day === 0 ? 7 : day;
}
