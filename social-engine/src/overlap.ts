import type { AvailabilityWindow } from "./types";

function minutesToMs(m: number) { return m * 60_000; }

export function findOverlapSlots(a: AvailabilityWindow[], b: AvailabilityWindow[], durationMinutes: number) {
  const dur = minutesToMs(durationMinutes);
  const out: { startAt: number; endAt: number }[] = [];

  const aa = [...a].sort((x,y) => x.startAt - y.startAt);
  const bb = [...b].sort((x,y) => x.startAt - y.startAt);

  let i = 0, j = 0;
  while (i < aa.length && j < bb.length && out.length < 12) {
    const start = Math.max(aa[i].startAt, bb[j].startAt);
    const end = Math.min(aa[i].endAt, bb[j].endAt);

    if (end - start >= dur) {
      out.push({ startAt: start, endAt: start + dur });
      const mid = start + Math.floor((end - start - dur) / 2);
      if (mid > start) out.push({ startAt: mid, endAt: mid + dur });
      const late = end - dur;
      if (late > mid) out.push({ startAt: late, endAt: end });
    }

    if (aa[i].endAt < bb[j].endAt) i++; else j++;
  }

  const seen = new Set<string>();
  return out.filter(s => {
    const k = `${s.startAt}-${s.endAt}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
