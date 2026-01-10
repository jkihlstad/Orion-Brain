import type { AvailabilityWindow, EnrichedTaskItem, TimeBlockProposal } from "./types";

function minutesToMs(min: number) { return min * 60_000; }

export function scheduleGreedy(args: {
  windows: AvailabilityWindow[];
  tasks: EnrichedTaskItem[];
  existingBlocks: any[];
  meetingBufferMinutes: number;
  allowTaskSplitting: boolean;
}): TimeBlockProposal[] {
  const { windows, tasks, meetingBufferMinutes, allowTaskSplitting } = args;

  const sorted = [...tasks].sort((a, b) => {
    const ah = a.deadlineFlex === "hard" ? 0 : 1;
    const bh = b.deadlineFlex === "hard" ? 0 : 1;
    if (ah !== bh) return ah - bh;

    const ad = a.dueAt ?? Number.MAX_SAFE_INTEGER;
    const bd = b.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;

    return (b.priority ?? 3) - (a.priority ?? 3);
  });

  const proposals: TimeBlockProposal[] = [];
  const free = [...windows].sort((a, b) => a.startAt - b.startAt);
  const bufferMs = minutesToMs(meetingBufferMinutes);

  for (const t of sorted) {
    const needMs = minutesToMs(t.estMinutes);
    let placed = false;

    for (let i = 0; i < free.length; i++) {
      const slot = free[i];
      const slotLen = slot.endAt - slot.startAt;
      if (slotLen < needMs) continue;

      const startAt = slot.startAt + bufferMs;
      const endAt = startAt + needMs;
      if (endAt > slot.endAt) continue;

      proposals.push({
        proposalId: crypto.randomUUID(),
        action: "create",
        title: t.title,
        startAt,
        endAt,
        notes: t.notes,
        reason: t.reason || "Scheduled based on priority/deadline and available time.",
        confidence: confidenceFor(t),
        sourceEventIds: [t.id]
      });

      free.splice(i, 1, ...splitSlot(slot, startAt, endAt));
      placed = true;
      break;
    }

    if (!placed && allowTaskSplitting && t.splittable && t.estMinutes >= 50) {
      const part1: EnrichedTaskItem = { ...t, estMinutes: Math.floor(t.estMinutes / 2), title: `${t.title} (Part 1)` };
      const part2: EnrichedTaskItem = { ...t, estMinutes: t.estMinutes - part1.estMinutes, title: `${t.title} (Part 2)` };

      proposals.push(...scheduleGreedy({
        windows: free,
        tasks: [part1, part2],
        existingBlocks: [],
        meetingBufferMinutes,
        allowTaskSplitting: false
      }));
    }
  }

  return proposals;
}

function splitSlot(slot: AvailabilityWindow, startAt: number, endAt: number): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = [];
  if (slot.startAt < startAt) out.push({ startAt: slot.startAt, endAt: startAt });
  if (endAt < slot.endAt) out.push({ startAt: endAt, endAt: slot.endAt });
  return out;
}

function confidenceFor(t: EnrichedTaskItem): number {
  let c = 0.6;
  if (t.dueAt) c += 0.1;
  if (t.deadlineFlex === "hard") c += 0.1;
  if ((t.priority ?? 3) >= 4) c += 0.1;
  return Math.min(0.95, c);
}
