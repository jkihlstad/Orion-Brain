import type { EnrichedTaskItem, TimeBlockProposal } from "./types";

export function generateSchedulingReason(task: EnrichedTaskItem, proposal: TimeBlockProposal): string {
  const reasons: string[] = [];

  if (task.deadlineFlex === "hard" && task.dueAt) {
    const dueDate = new Date(task.dueAt).toLocaleDateString();
    reasons.push(`Hard deadline on ${dueDate}`);
  }

  if (task.priority >= 4) {
    reasons.push("High priority task");
  }

  if (task.estMinutes >= 60) {
    reasons.push("Allocated focused time block for extended work");
  }

  if (reasons.length === 0) {
    reasons.push("Scheduled based on available time and task requirements");
  }

  return reasons.join(". ") + ".";
}

export function formatProposalSummary(proposals: TimeBlockProposal[]): string {
  if (proposals.length === 0) {
    return "No scheduling changes proposed.";
  }

  const creates = proposals.filter(p => p.action === "create").length;
  const moves = proposals.filter(p => p.action === "move").length;
  const deletes = proposals.filter(p => p.action === "delete").length;

  const parts: string[] = [];
  if (creates > 0) parts.push(`${creates} new time block(s)`);
  if (moves > 0) parts.push(`${moves} moved block(s)`);
  if (deletes > 0) parts.push(`${deletes} removed block(s)`);

  return `Proposed: ${parts.join(", ")}.`;
}
